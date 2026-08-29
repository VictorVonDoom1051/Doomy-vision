package mx.acstechnology.doomyvision.core

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

private class FlakyProvider(
    override val source: VisionFrameSource,
    private val fail: Boolean,
    private val quality: FrameQuality = FrameQuality.GOOD,
) : VisionFrameSourceProvider {
    override suspend fun capture(): VisionFrame? {
        if (fail) throw DoomyVisionBridgeError.CameraError(detail = "capturePhoto falló (simulado, p.ej. por HFP activo)")
        return VisionFrame(byteArrayOf(1, 2, 3), "image/jpeg", source, 640, 480)
    }
    override fun assessQuality(frame: VisionFrame) = quality
}

class VisionFrameProviderTest {
    @Test
    fun `falls back from PHOTO_CAPTURE to STREAM_FRAME when photo capture fails (section 8)`() = runTest {
        val composite = CompositeVisionFrameProvider(
            listOf(
                FlakyProvider(VisionFrameSource.PHOTO_CAPTURE, fail = true),
                FlakyProvider(VisionFrameSource.STREAM_FRAME, fail = false),
            )
        )
        val frame = composite.getBestFrame()
        assertEquals(VisionFrameSource.STREAM_FRAME, frame.source)

        val diag = composite.lastDiagnostics()
        assertEquals(false, diag[0].succeeded)
        assertEquals(VisionFrameSource.PHOTO_CAPTURE, diag[0].attempted)
        assertEquals(true, diag[1].succeeded)
    }

    @Test
    fun `skips a source whose frame quality is UNUSABLE`() = runTest {
        val composite = CompositeVisionFrameProvider(
            listOf(
                FlakyProvider(VisionFrameSource.STREAM_FRAME, fail = false, quality = FrameQuality.UNUSABLE),
                FlakyProvider(VisionFrameSource.PHONE_CAMERA, fail = false, quality = FrameQuality.GOOD),
            )
        )
        val frame = composite.getBestFrame()
        assertEquals(VisionFrameSource.PHONE_CAMERA, frame.source)
    }

    @Test
    fun `throws VisionError when every source fails`() = runTest {
        val composite = CompositeVisionFrameProvider(
            listOf(
                FlakyProvider(VisionFrameSource.PHOTO_CAPTURE, fail = true),
                FlakyProvider(VisionFrameSource.STREAM_FRAME, fail = true),
            )
        )
        assertFailsWith<DoomyVisionBridgeError.VisionError> { composite.getBestFrame() }
    }

    @Test
    fun `mock image provider always succeeds and is a safe last resort`() = runTest {
        val composite = CompositeVisionFrameProvider(
            listOf(
                FlakyProvider(VisionFrameSource.PHOTO_CAPTURE, fail = true),
                MockImageFrameProvider(byteArrayOf(9, 9, 9)),
            )
        )
        val frame = composite.getBestFrame()
        assertEquals(VisionFrameSource.MOCK_IMAGE, frame.source)
    }
}
