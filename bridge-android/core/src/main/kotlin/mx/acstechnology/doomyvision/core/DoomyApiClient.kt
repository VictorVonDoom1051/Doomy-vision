package mx.acstechnology.doomyvision.core

/**
 * Contrato del cliente de red hacia Doomy Vision (/api/doomy-vision/v1).
 * La implementación real (Ktor/OkHttp) vive en app/ y no se compila aquí;
 * esta interfaz + una implementación falsa permiten probar
 * ConversationManager sin red real.
 */
data class ConversationResult(
    val sessionId: String,
    val responseId: String,
    val text: String,
    val audioUrl: String?,
    val visionUsed: Boolean,
    val visionRequested: Boolean,
    val latencyMs: Long,
)

interface DoomyApiClient {
    suspend fun registerDevice(deviceId: String, internalKey: String): String /** -> access token */
    suspend fun createSession(deviceType: String, mode: String): String /** -> session_id */
    suspend fun sendConversation(sessionId: String, text: String?, imageJpeg: ByteArray?, audioClip: ByteArray?): ConversationResult
}

/** Doble de prueba: nunca toca la red, siempre determinista. */
class FakeDoomyApiClient(
    private val fixedResponseText: String = "Parece un NVR Hikvision de ocho canales. (fake client)",
    var shouldFailNext: Boolean = false,
) : DoomyApiClient {
    var lastSessionId: String? = null
        private set
    var callCount: Int = 0
        private set

    override suspend fun registerDevice(deviceId: String, internalKey: String): String {
        if (internalKey.isBlank()) throw DoomyVisionBridgeError.AuthenticationError(detail = "internalKey vacío")
        return "fake-token-for-$deviceId"
    }

    override suspend fun createSession(deviceType: String, mode: String): String {
        val id = "fake-session-${(1000..9999).random()}"
        lastSessionId = id
        return id
    }

    override suspend fun sendConversation(sessionId: String, text: String?, imageJpeg: ByteArray?, audioClip: ByteArray?): ConversationResult {
        callCount += 1
        if (shouldFailNext) {
            shouldFailNext = false
            throw DoomyVisionBridgeError.DoomyAPIError(detail = "fallo simulado en sendConversation")
        }
        return ConversationResult(
            sessionId = sessionId,
            responseId = "resp-$callCount",
            text = fixedResponseText,
            audioUrl = "https://example.invalid/audio/resp-$callCount",
            visionUsed = imageJpeg != null,
            visionRequested = false,
            latencyMs = 42,
        )
    }
}
