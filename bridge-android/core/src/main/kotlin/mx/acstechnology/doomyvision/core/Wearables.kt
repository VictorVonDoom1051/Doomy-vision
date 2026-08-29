package mx.acstechnology.doomyvision.core

/**
 * Abstracción de los tres modos de operación (sección 6):
 *   MODE A — REAL_GLASSES (Ray-Ban reales vía Meta Wearables DAT)
 *   MODE B — MOCK_DEVICE (Meta MockDeviceKit)
 *   MODE C — PHONE (cámara/mic/bocinas del teléfono)
 *
 * `WearablesManager` es la interfaz que la UI y el resto del Bridge
 * consumen. La implementación real (MODE A) vive en app/ y envuelve
 * MWDATCore/MWDATCamera (ver docs/DOOMY_VISION_ARCHITECTURE.md) — no
 * puede compilarse en este entorno (requiere Android SDK + acceso al
 * Developer Preview de Meta). MockWearablesManager (MODE B, esta clase)
 * SÍ es real y probada: reproduce el flujo documentado de MockDeviceKit
 * (pair -> power on -> don -> unfold -> session ready -> camera available).
 */
enum class DeviceMode { REAL_GLASSES, MOCK_DEVICE, PHONE }

enum class WearableConnectionState { DISCONNECTED, PAIRING, PAIRED, POWERED_ON, WORN, SESSION_READY }

data class WearableStatus(
    val connectionState: WearableConnectionState,
    val cameraAvailable: Boolean,
    val batteryPercent: Int? = null,
)

interface WearablesManager {
    val mode: DeviceMode
    suspend fun pair(): WearableStatus
    suspend fun powerOn(): WearableStatus
    suspend fun don(): WearableStatus /** el usuario se pone los lentes */
    suspend fun unfold(): WearableStatus /** desdoblar — requerido antes de iniciar sesión */
    suspend fun startSession(): WearableStatus
    suspend fun disconnect()
    fun currentStatus(): WearableStatus
}

/**
 * Implementación de MODE B, fiel al flujo documentado oficialmente para
 * MockDeviceKit (ver docs/DOOMY_VISION_ARCHITECTURE.md#meta-wearables-dat):
 * "The device must be powered on and worn (donned) before streaming can
 * start." — replicamos esa regla aquí, no solo en la UI.
 */
class MockWearablesManager : WearablesManager {
    override val mode = DeviceMode.MOCK_DEVICE
    private var status = WearableStatus(WearableConnectionState.DISCONNECTED, cameraAvailable = false)

    override suspend fun pair(): WearableStatus {
        status = status.copy(connectionState = WearableConnectionState.PAIRED)
        return status
    }

    override suspend fun powerOn(): WearableStatus {
        require(status.connectionState >= WearableConnectionState.PAIRED) {
            "No se puede encender un dispositivo mock sin emparejar primero"
        }
        status = status.copy(connectionState = WearableConnectionState.POWERED_ON)
        return status
    }

    override suspend fun don(): WearableStatus {
        require(status.connectionState >= WearableConnectionState.POWERED_ON) {
            "El dispositivo debe estar encendido antes de 'ponérselo'"
        }
        status = status.copy(connectionState = WearableConnectionState.WORN)
        return status
    }

    override suspend fun unfold(): WearableStatus {
        require(status.connectionState >= WearableConnectionState.WORN) {
            "El dispositivo debe estar puesto (donned) antes de desdoblar"
        }
        return status
    }

    override suspend fun startSession(): WearableStatus {
        // Regla documentada de Meta: "must be powered on and worn (donned)
        // before streaming can start" — la aplicamos explícitamente.
        if (status.connectionState < WearableConnectionState.WORN) {
            throw DoomyVisionBridgeError.WearablesError(
                detail = "startSession() llamado sin power_on+don previos (estado actual: ${status.connectionState})"
            )
        }
        status = status.copy(connectionState = WearableConnectionState.SESSION_READY, cameraAvailable = true, batteryPercent = 87)
        return status
    }

    override suspend fun disconnect() {
        status = WearableStatus(WearableConnectionState.DISCONNECTED, cameraAvailable = false)
    }

    override fun currentStatus(): WearableStatus = status
}

// WearableConnectionState es un enum, por lo tanto ya implementa
// Comparable<WearableConnectionState> por orden de declaración (ordinal) —
// eso es lo que usan los `require(status.connectionState >= ...)` de arriba.
