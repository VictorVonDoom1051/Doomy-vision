package mx.acstechnology.doomyvision.core

/** Modelo de errores tipados (sección 45). Mensajes amigables separados del detalle técnico. */
sealed class DoomyVisionBridgeError(val userMessage: String, technicalDetail: String? = null, cause: Throwable? = null) :
    Exception(technicalDetail ?: userMessage, cause) {

    class WearablesError(userMessage: String = "No se pudo conectar con tus Ray-Ban Meta", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)

    class CameraError(userMessage: String = "No se pudo acceder a la cámara", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)

    class AudioError(userMessage: String = "Hubo un problema con el audio", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)

    class NetworkError(userMessage: String = "Sin conexión con Doomy Core", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)

    class DoomyAPIError(userMessage: String = "Doomy Core no está disponible", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)

    class AuthenticationError(userMessage: String = "No autorizado", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)

    class VisionError(userMessage: String = "No se pudo capturar la imagen", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)

    class PlaybackError(userMessage: String = "No se pudo reproducir la respuesta", detail: String? = null, cause: Throwable? = null) :
        DoomyVisionBridgeError(userMessage, detail, cause)
}
