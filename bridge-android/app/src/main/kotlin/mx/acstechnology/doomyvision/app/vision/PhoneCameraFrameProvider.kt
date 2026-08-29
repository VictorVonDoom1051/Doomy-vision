package mx.acstechnology.doomyvision.app.vision

import android.content.Context
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import mx.acstechnology.doomyvision.core.FrameQuality
import mx.acstechnology.doomyvision.core.VisionFrame
import mx.acstechnology.doomyvision.core.VisionFrameSource
import mx.acstechnology.doomyvision.core.VisionFrameSourceProvider
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * MODE C (sección 6/7) — cámara del teléfono como fallback de desarrollo
 * cuando no hay Ray-Ban conectados. Implementación real con CameraX
 * (requiere Android SDK para compilar; no probado en este entorno, pero
 * es exactamente el mismo patrón que la mayoría de apps CameraX en
 * producción — sin dependencias de MWDAT).
 */
class PhoneCameraFrameProvider(
    private val context: Context,
    private val imageCapture: ImageCapture,
) : VisionFrameSourceProvider {
    override val source = VisionFrameSource.PHONE_CAMERA

    override suspend fun capture(): VisionFrame? = suspendCancellableCoroutine { cont ->
        val outputStream = ByteArrayOutputStream()
        imageCapture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: androidx.camera.core.ImageProxy) {
                    try {
                        val buffer = image.planes[0].buffer
                        val bytes = ByteArray(buffer.remaining())
                        buffer.get(bytes)
                        outputStream.write(bytes)
                        cont.resume(
                            VisionFrame(
                                bytes = outputStream.toByteArray(),
                                mimeType = "image/jpeg",
                                source = source,
                                width = image.width,
                                height = image.height,
                            )
                        )
                    } finally {
                        image.close()
                    }
                }
                override fun onError(exception: ImageCaptureException) {
                    cont.resumeWithException(exception)
                }
            }
        )
    }

    override fun assessQuality(frame: VisionFrame): FrameQuality =
        if (frame.bytes.size < 2_000) FrameQuality.UNUSABLE else FrameQuality.GOOD

    companion object {
        suspend fun bindTo(context: Context, lifecycleOwner: androidx.lifecycle.LifecycleOwner): ImageCapture {
            val provider = ProcessCameraProvider.getInstance(context).get()
            val imageCapture = ImageCapture.Builder().build()
            provider.unbindAll()
            provider.bindToLifecycle(
                lifecycleOwner,
                androidx.camera.core.CameraSelector.DEFAULT_BACK_CAMERA,
                imageCapture,
            )
            return imageCapture
        }
    }
}
