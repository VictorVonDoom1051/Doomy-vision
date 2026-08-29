import Foundation

/// Modelo de errores tipados (sección 45) — espejo de Errors.kt.
public enum DoomyVisionBridgeError: Error, CustomStringConvertible {
    case wearablesError(userMessage: String = "No se pudo conectar con tus Ray-Ban Meta", detail: String? = nil)
    case cameraError(userMessage: String = "No se pudo acceder a la cámara", detail: String? = nil)
    case audioError(userMessage: String = "Hubo un problema con el audio", detail: String? = nil)
    case networkError(userMessage: String = "Sin conexión con Doomy Core", detail: String? = nil)
    case doomyAPIError(userMessage: String = "Doomy Core no está disponible", detail: String? = nil)
    case authenticationError(userMessage: String = "No autorizado", detail: String? = nil)
    case visionError(userMessage: String = "No se pudo capturar la imagen", detail: String? = nil)
    case playbackError(userMessage: String = "No se pudo reproducir la respuesta", detail: String? = nil)

    public var userMessage: String {
        switch self {
        case .wearablesError(let m, _), .cameraError(let m, _), .audioError(let m, _),
             .networkError(let m, _), .doomyAPIError(let m, _), .authenticationError(let m, _),
             .visionError(let m, _), .playbackError(let m, _):
            return m
        }
    }

    public var description: String { userMessage }
}
