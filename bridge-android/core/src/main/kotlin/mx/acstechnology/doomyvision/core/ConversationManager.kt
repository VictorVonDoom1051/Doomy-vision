package mx.acstechnology.doomyvision.core

/**
 * DoomySession / ConversationManager (sección 5 y 15, lado Bridge).
 * Orquesta un turno completo: captura de visión si aplica (con
 * CompositeVisionFrameProvider), llamada a Doomy Vision, y reporte del
 * resultado a través de la máquina de estados. No implementa lógica de
 * negocio de IA (eso vive en Doomy Core) — solo coordina al Bridge.
 */
class ConversationManager(
    private val api: DoomyApiClient,
    private val stateMachine: BridgeStateMachine,
    private val visionProvider: CompositeVisionFrameProvider?,
) {
    var sessionId: String? = null
        private set

    suspend fun startSession(deviceType: String, mode: String) {
        stateMachine.tryTransition(BridgeState.CONNECTING)
        sessionId = api.createSession(deviceType, mode)
        stateMachine.tryTransition(BridgeState.READY)
    }

    /**
     * Envía un turno de texto/voz ya transcrito. Si `withVision` es true,
     * intenta obtener un frame antes de enviar (sección 18: mientras no
     * haya tool-calling en vivo, el Bridge decide capturar de antemano
     * cuando el usuario ya disparó una interacción con intención visual
     * obvia, p.ej. desde la UI; el caso general de "Doomy pide ver" se
     * resuelve reintentando tras un `vision_requested: true`).
     */
    suspend fun sendTurn(text: String, withVision: Boolean): ConversationResult {
        val sid = sessionId ?: throw DoomyVisionBridgeError.DoomyAPIError(detail = "sendTurn sin sesión activa")

        var imageJpeg: ByteArray? = null
        if (withVision) {
            stateMachine.tryTransition(BridgeState.CAPTURING_VISION)
            val provider = visionProvider ?: throw DoomyVisionBridgeError.VisionError(detail = "VISION_ENABLED pero no hay VisionFrameProvider configurado")
            imageJpeg = provider.getBestFrame().bytes
            stateMachine.tryTransition(BridgeState.UPLOADING)
        }

        stateMachine.tryTransition(BridgeState.PROCESSING)
        val result = try {
            api.sendConversation(sid, text, imageJpeg, null)
        } catch (e: DoomyVisionBridgeError) {
            stateMachine.tryTransition(BridgeState.ERROR)
            throw e
        }

        if (result.visionRequested && imageJpeg == null) {
            // Doomy pidió ver pero no le mandamos imagen — reintento automático una vez.
            stateMachine.tryTransition(BridgeState.CAPTURING_VISION)
            val provider = visionProvider ?: throw DoomyVisionBridgeError.VisionError(detail = "Doomy pidió visión pero no hay VisionFrameProvider")
            val frame = provider.getBestFrame()
            stateMachine.tryTransition(BridgeState.UPLOADING)
            stateMachine.tryTransition(BridgeState.PROCESSING)
            val retryResult = api.sendConversation(sid, text, frame.bytes, null)
            stateMachine.tryTransition(BridgeState.SPEAKING)
            return retryResult
        }

        stateMachine.tryTransition(BridgeState.SPEAKING)
        return result
    }

    fun finishPlayback() {
        stateMachine.tryTransition(BridgeState.READY)
    }
}
