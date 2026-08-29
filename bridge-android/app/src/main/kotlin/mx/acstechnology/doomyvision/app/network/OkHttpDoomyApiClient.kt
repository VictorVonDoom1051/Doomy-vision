package mx.acstechnology.doomyvision.app.network

import kotlinx.coroutines.suspendCancellableCoroutine
import mx.acstechnology.doomyvision.core.ConversationResult
import mx.acstechnology.doomyvision.core.DoomyApiClient
import mx.acstechnology.doomyvision.core.DoomyVisionBridgeError
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Implementación real de DoomyApiClient contra
 * /api/doomy-vision/v1 (ver backend/). Usa OkHttp (ya declarado en
 * app/build.gradle.kts). NUNCA incluye llaves de IA — solo el token de
 * acceso de corta duración obtenido en /device/register (sección 27).
 */
class OkHttpDoomyApiClient(
    private val baseUrl: String,
    private var accessToken: String? = null,
) : DoomyApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private fun v1(path: String) = "${baseUrl.trimEnd('/')}/api/doomy-vision/v1$path"

    override suspend fun registerDevice(deviceId: String, internalKey: String): String {
        val body = JSONObject().put("device_id", deviceId).toString()
            .toRequestBody("application/json".toMediaType())
        val req = Request.Builder()
            .url(v1("/device/register"))
            .addHeader("x-doomy-vision-key", internalKey)
            .post(body)
            .build()
        val json = executeJson(req)
        accessToken = json.getString("access_token")
        return accessToken!!
    }

    override suspend fun createSession(deviceType: String, mode: String): String {
        val body = JSONObject().put("device_type", deviceType).put("mode", mode).toString()
            .toRequestBody("application/json".toMediaType())
        val req = authed(Request.Builder().url(v1("/session")).post(body)).build()
        return executeJson(req).getString("session_id")
    }

    override suspend fun sendConversation(sessionId: String, text: String?, imageJpeg: ByteArray?, audioClip: ByteArray?): ConversationResult {
        val multipart = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("session_id", sessionId)
        text?.let { multipart.addFormDataPart("text", it) }
        imageJpeg?.let {
            multipart.addFormDataPart("image", "frame.jpg", it.toRequestBody("image/jpeg".toMediaType()))
        }
        audioClip?.let {
            multipart.addFormDataPart("audio", "ptt.m4a", it.toRequestBody("audio/mp4".toMediaType()))
        }
        val req = authed(Request.Builder().url(v1("/conversation")).post(multipart.build())).build()
        val json = executeJson(req)
        val audio = json.optJSONObject("audio")
        return ConversationResult(
            sessionId = json.getString("session_id"),
            responseId = json.getString("response_id"),
            text = json.getString("text"),
            audioUrl = audio?.let { baseUrl.trimEnd('/') + it.getString("url") },
            visionUsed = json.optBoolean("vision_used", false),
            visionRequested = json.optBoolean("vision_requested", false),
            latencyMs = json.optJSONObject("latency_ms")?.optLong("total_ms", 0) ?: 0,
        )
    }

    private fun authed(builder: Request.Builder): Request.Builder =
        accessToken?.let { builder.addHeader("authorization", "Bearer $it") } ?: builder

    private suspend fun executeJson(request: Request): JSONObject = suspendCancellableCoroutine { cont ->
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                cont.resumeWithException(DoomyVisionBridgeError.NetworkError(detail = e.message, cause = e))
            }
            override fun onResponse(call: Call, response: Response) {
                response.use { res ->
                    val bodyStr = res.body?.string().orEmpty()
                    if (!res.isSuccessful) {
                        val message = runCatching { JSONObject(bodyStr).getJSONObject("error").getString("message") }.getOrNull()
                        cont.resumeWithException(
                            DoomyVisionBridgeError.DoomyAPIError(userMessage = message ?: "Doomy Core respondió ${res.code}", detail = bodyStr)
                        )
                        return
                    }
                    cont.resume(runCatching { JSONObject(bodyStr) }.getOrElse {
                        JSONObject()
                    })
                }
            }
        })
        cont.invokeOnCancellation { /* OkHttp call cancel podría añadirse guardando la referencia al Call */ }
    }
}
