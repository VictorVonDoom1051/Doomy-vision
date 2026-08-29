package mx.acstechnology.doomyvision.core

/**
 * AudioRouteManager (sección 9). Independiente de DAT: la documentación
 * oficial de Meta confirma que el micrófono/bocinas de los Ray-Ban se
 * acceden "through iOS or Android Bluetooth profiles" (HFP), no por el
 * SDK de DAT — ver docs/DOOMY_VISION_ARCHITECTURE.md#audio-rayban.
 * En Android real esto se implementa sobre AudioManager +
 * BluetoothHeadset/BluetoothProfile.ServiceListener (app/), pero la
 * interfaz y la lógica de "qué ruta elegimos y por qué" viven aquí y son
 * testeables sin Android.
 */
enum class AudioInputRoute { RAYBAN_META, PHONE_MIC, NONE }
enum class AudioOutputRoute { RAYBAN_META, PHONE_SPEAKER }

data class AudioRouteState(
    val input: AudioInputRoute,
    val output: AudioOutputRoute,
    val hfpConnected: Boolean,
)

interface AudioRouteListener {
    fun onRouteChanged(newState: AudioRouteState)
}

interface AudioRouteManager {
    fun currentState(): AudioRouteState
    fun addListener(listener: AudioRouteListener)
    /** Fuerza reevaluación de rutas disponibles (p.ej. tras un evento del sistema). */
    fun refresh(): AudioRouteState
}

/**
 * Implementación para desarrollo/tests y para MODE C (teléfono): nunca hay
 * Ray-Ban conectados, así que la ruta siempre es el teléfono. La UI debe
 * mostrar esto explícitamente ("Micrófono: iPhone ⚠️") en vez de asumir
 * silenciosamente que se está usando el mic de los lentes (sección 9).
 */
class PhoneOnlyAudioRouteManager : AudioRouteManager {
    private var state = AudioRouteState(AudioInputRoute.PHONE_MIC, AudioOutputRoute.PHONE_SPEAKER, hfpConnected = false)
    private val listeners = mutableListOf<AudioRouteListener>()

    override fun currentState() = state
    override fun addListener(listener: AudioRouteListener) { listeners.add(listener) }
    override fun refresh(): AudioRouteState = state
}

/** Simula la ruta Ray-Ban vía HFP para pruebas de MODE B, con eventos de cambio de ruta. */
class SimulatedRayBanAudioRouteManager : AudioRouteManager {
    private var state = AudioRouteState(AudioInputRoute.NONE, AudioOutputRoute.PHONE_SPEAKER, hfpConnected = false)
    private val listeners = mutableListOf<AudioRouteListener>()

    override fun currentState() = state
    override fun addListener(listener: AudioRouteListener) { listeners.add(listener) }

    fun simulateHfpConnected() {
        state = AudioRouteState(AudioInputRoute.RAYBAN_META, AudioOutputRoute.RAYBAN_META, hfpConnected = true)
        listeners.forEach { it.onRouteChanged(state) }
    }

    fun simulateHfpDisconnected() {
        state = AudioRouteState(AudioInputRoute.PHONE_MIC, AudioOutputRoute.PHONE_SPEAKER, hfpConnected = false)
        listeners.forEach { it.onRouteChanged(state) }
    }

    override fun refresh(): AudioRouteState = state
}
