package mx.acstechnology.doomyvision.core

/**
 * VisionFrameProvider (sección 8). No depende exclusivamente de
 * `capturePhoto()`: hay reportes de la comunidad de interacción entre la
 * captura fotográfica y HFP activo (ver
 * docs/DOOMY_VISION_ARCHITECTURE.md#foto-vs-frame-de-stream para las
 * fuentes). Esta clase intenta, en orden, photo capture -> frame de
 * stream -> cámara del teléfono -> imagen mock, y registra en
 * diagnósticos cada fallback usado.
 */
data class VisionFrame(
    val bytes: ByteArray,
    val mimeType: String,
    val source: VisionFrameSource,
    val width: Int,
    val height: Int,
)

enum class VisionFrameSource { PHOTO_CAPTURE, STREAM_FRAME, PHONE_CAMERA, MOCK_IMAGE }

enum class FrameQuality { GOOD, DEGRADED, UNUSABLE }

interface VisionFrameSourceProvider {
    val source: VisionFrameSource
    suspend fun capture(): VisionFrame?
    /** Heurística barata (tamaño/resolución) para decidir si un frame de stream es "suficientemente bueno". */
    fun assessQuality(frame: VisionFrame): FrameQuality
}

class VisionFrameDiagnostics {
    data class Event(val attempted: VisionFrameSource, val succeeded: Boolean, val reason: String?)
    val events = mutableListOf<Event>()
    fun record(attempted: VisionFrameSource, succeeded: Boolean, reason: String? = null) {
        events.add(Event(attempted, succeeded, reason))
    }
    fun clear() = events.clear()
}

/**
 * Orquestador con fallback automático (sección 8):
 * "Si capturePhoto falla mientras HFP está activo, utilizar
 * automáticamente el frame del stream si cumple calidad suficiente."
 */
class CompositeVisionFrameProvider(
    private val providers: List<VisionFrameSourceProvider>,
    private val diagnostics: VisionFrameDiagnostics = VisionFrameDiagnostics(),
) {
    suspend fun getBestFrame(): VisionFrame {
        diagnostics.clear()
        for (provider in providers) {
            var captureError: String? = null
            val frame = try {
                provider.capture()
            } catch (e: Exception) {
                captureError = e.message ?: "excepción sin mensaje"
                null
            }
            if (frame == null) {
                diagnostics.record(provider.source, succeeded = false, reason = captureError ?: "capture() devolvió null")
                continue
            }
            val quality = provider.assessQuality(frame)
            if (quality == FrameQuality.UNUSABLE) {
                diagnostics.record(provider.source, succeeded = false, reason = "calidad insuficiente")
                continue
            }
            diagnostics.record(provider.source, succeeded = true, reason = if (quality == FrameQuality.DEGRADED) "calidad degradada pero aceptada" else null)
            return frame
        }
        throw DoomyVisionBridgeError.VisionError(
            detail = "Todos los VisionFrameSourceProvider fallaron: ${diagnostics.events}"
        )
    }

    fun lastDiagnostics(): List<VisionFrameDiagnostics.Event> = diagnostics.events.toList()
}

/** Imagen fija para MODE B / tests — nunca falla, útil como último fallback. */
class MockImageFrameProvider(private val fakeJpegBytes: ByteArray) : VisionFrameSourceProvider {
    override val source = VisionFrameSource.MOCK_IMAGE
    override suspend fun capture(): VisionFrame = VisionFrame(fakeJpegBytes, "image/jpeg", source, width = 640, height = 480)
    override fun assessQuality(frame: VisionFrame) = FrameQuality.GOOD
}
