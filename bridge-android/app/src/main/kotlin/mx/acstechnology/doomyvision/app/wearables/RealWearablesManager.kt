package mx.acstechnology.doomyvision.app.wearables

import mx.acstechnology.doomyvision.core.DeviceMode
import mx.acstechnology.doomyvision.core.DoomyVisionBridgeError
import mx.acstechnology.doomyvision.core.WearableConnectionState
import mx.acstechnology.doomyvision.core.WearableStatus
import mx.acstechnology.doomyvision.core.WearablesManager

/**
 * MODE A — Ray-Ban Meta reales, vía Meta Wearables Device Access Toolkit
 * (MWDAT) v0.7.0.
 *
 * ESTADO: NO COMPILA EN ESTE ENTORNO. Requiere:
 *   1. Aprobación en el Developer Preview de Meta (developers.meta.com/wearables)
 *   2. APPLICATION_ID emitido por Meta (AndroidManifest.xml)
 *   3. Dependencia `com.meta.wearable:mwdat-core`/`mwdat-camera` vía
 *      GitHub Packages con GITHUB_TOKEN (ver app/build.gradle.kts)
 *   4. Un dispositivo Android físico con Bluetooth y Ray-Ban Meta
 *      emparejados en la app oficial "Meta AI".
 *
 * Ver docs/DOOMY_VISION_ARCHITECTURE.md#meta-wearables-dat para las
 * fuentes oficiales consultadas (wearables.developer.meta.com/docs,
 * github.com/facebook/meta-wearables-dat-android) y
 * DOOMY_VISION_BLOCKERS.md para el detalle del bloqueo.
 *
 * El cuerpo de cada método de abajo documenta, con el nombre real de las
 * clases de MWDAT según su README público (MWDATCore, MWDATCamera), qué
 * llamada iría en cada paso, para que activar esto sea un ejercicio de
 * "descomentar + probar", no de diseñar desde cero.
 */
class RealWearablesManager(
    // private val core: MWDATCore,   // com.meta.wearable.core.MWDATCore
    // private val camera: MWDATCamera, // com.meta.wearable.camera.MWDATCamera
) : WearablesManager {
    override val mode = DeviceMode.REAL_GLASSES

    private var status = WearableStatus(WearableConnectionState.DISCONNECTED, cameraAvailable = false)

    override suspend fun pair(): WearableStatus {
        // 1. Deeplink de registro: el usuario toca un botón en Doomy Vision,
        //    la app abre un deeplink hacia la app "Meta AI" para confirmar
        //    el registro (flujo "Registration" del Integration Overview
        //    oficial). Esto es un evento de UI, no una llamada bloqueante:
        //    MWDATCore notifica el resultado por callback/Flow.
        // core.registerApp(applicationId = BuildConfig.MWDAT_APPLICATION_ID)
        throw DoomyVisionBridgeError.WearablesError(
            userMessage = "Meta Wearables DAT no está disponible en este build (Developer Preview pendiente)",
            detail = "RealWearablesManager.pair() no implementado — ver DOOMY_VISION_BLOCKERS.md"
        )
    }

    override suspend fun powerOn(): WearableStatus = notImplemented("powerOn")
    override suspend fun don(): WearableStatus = notImplemented("don")
    override suspend fun unfold(): WearableStatus = notImplemented("unfold")

    override suspend fun startSession(): WearableStatus {
        // 2. Permisos: primer acceso a cámara requiere permiso explícito
        //    (allow always/once/deny) vía deeplink a Meta AI. El micrófono
        //    usa HFP (dialogos de plataforma estándar) — no pasa por MWDAT,
        //    ver AndroidAudioRouteManager.
        // 3. Sesión: camera.startSession() — inicia MWDATCamera; requiere
        //    que el dispositivo esté "powered on and worn (donned)" según
        //    la documentación oficial (la misma regla que
        //    MockWearablesManager en :core aplica y prueba).
        return notImplemented("startSession")
    }

    override suspend fun disconnect() {
        // camera.stopSession(); core.disconnect()
    }

    override fun currentStatus(): WearableStatus = status

    private fun notImplemented(fn: String): Nothing = throw DoomyVisionBridgeError.WearablesError(
        userMessage = "Ray-Ban Meta no disponible todavía en este build",
        detail = "RealWearablesManager.$fn() pendiente de MWDAT — ver DOOMY_VISION_BLOCKERS.md"
    )
}
