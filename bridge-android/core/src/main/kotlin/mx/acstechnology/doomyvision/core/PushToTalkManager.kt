package mx.acstechnology.doomyvision.core

/**
 * PushToTalkManager (secciones 3 y 11). V1 = push-to-talk explícito, NO
 * full-duplex. Orquesta: mantener -> grabar -> soltar -> mandar audio ->
 * transcribir -> analizar -> generar respuesta -> TTS -> reproducir,
 * expresado como transiciones de BridgeStateMachine.
 */
class PushToTalkManager(
    private val stateMachine: BridgeStateMachine,
    private val maxRecordingSeconds: Int = 30,
) {
    private var recordingStartedAtMs: Long? = null

    fun onPressStart(nowMs: Long = System.currentTimeMillis()) {
        if (stateMachine.state != BridgeState.READY) {
            throw DoomyVisionBridgeError.AudioError(
                detail = "PTT press ignorado: estado actual ${stateMachine.state}, se esperaba READY"
            )
        }
        recordingStartedAtMs = nowMs
        stateMachine.transition(BridgeState.LISTENING)
    }

    /** @return true si se alcanzó el límite y se debe detener la grabación en el sistema real. */
    fun isOverLimit(nowMs: Long = System.currentTimeMillis()): Boolean {
        val started = recordingStartedAtMs ?: return false
        return (nowMs - started) / 1000 >= maxRecordingSeconds
    }

    fun onReleaseAndSend() {
        if (stateMachine.state != BridgeState.LISTENING) {
            throw DoomyVisionBridgeError.AudioError(
                detail = "PTT release ignorado: estado actual ${stateMachine.state}, se esperaba LISTENING"
            )
        }
        recordingStartedAtMs = null
        stateMachine.transition(BridgeState.PROCESSING)
    }

    fun onResponseReady() {
        stateMachine.transition(BridgeState.SPEAKING)
    }

    fun onPlaybackFinished() {
        stateMachine.tryTransition(BridgeState.READY)
    }

    fun onError() {
        stateMachine.tryTransition(BridgeState.ERROR)
    }
}
