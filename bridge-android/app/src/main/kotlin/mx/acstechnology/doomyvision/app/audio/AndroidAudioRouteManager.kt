package mx.acstechnology.doomyvision.app.audio

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import mx.acstechnology.doomyvision.core.AudioInputRoute
import mx.acstechnology.doomyvision.core.AudioOutputRoute
import mx.acstechnology.doomyvision.core.AudioRouteListener
import mx.acstechnology.doomyvision.core.AudioRouteManager
import mx.acstechnology.doomyvision.core.AudioRouteState

/**
 * Implementación real de AudioRouteManager para Android (sección 9/10).
 *
 * Importante (confirmado con la documentación oficial de Meta, sección
 * FAQ del Device Access Toolkit): "access the microphone and speakers
 * through iOS or Android Bluetooth profiles" — el audio de los Ray-Ban
 * NO pasa por MWDAT, pasa por el perfil Bluetooth HFP estándar del SO.
 * Por eso esta clase usa APIs nativas de Android (AudioManager +
 * BluetoothHeadset), independientes de si RealWearablesManager está
 * disponible o no.
 *
 * ESTADO: código real (no pseudocódigo), pero requiere Android SDK para
 * compilar (android.bluetooth.*, android.media.*) — no se puede probar en
 * este entorno. La lógica de "qué ruta se decide y cuándo" ya está
 * probada de forma aislada en :core (SimulatedRayBanAudioRouteManagerTest).
 */
class AndroidAudioRouteManager(private val context: Context) : AudioRouteManager {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val listeners = mutableListOf<AudioRouteListener>()
    private var bluetoothHeadset: BluetoothHeadset? = null
    private var state = AudioRouteState(AudioInputRoute.NONE, AudioOutputRoute.PHONE_SPEAKER, hfpConnected = false)

    private val profileListener = object : BluetoothProfile.ServiceListener {
        override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
            if (profile == BluetoothProfile.HEADSET) {
                bluetoothHeadset = proxy as BluetoothHeadset
                refresh()
            }
        }
        override fun onServiceDisconnected(profile: Int) {
            if (profile == BluetoothProfile.HEADSET) {
                bluetoothHeadset = null
                refresh()
            }
        }
    }

    fun start() {
        BluetoothAdapter.getDefaultAdapter()
            ?.getProfileProxy(context, profileListener, BluetoothProfile.HEADSET)
        // Orden recomendado (sección 10): preparar HFP ANTES de iniciar el
        // stream de cámara de MWDAT, ya que la documentación oficial no
        // especifica el orden explícitamente (ver
        // docs/DOOMY_VISION_ARCHITECTURE.md#orden-de-inicializacion) —
        // adoptamos la postura conservadora de inicializar audio primero.
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    }

    fun stop() {
        bluetoothHeadset?.let {
            BluetoothAdapter.getDefaultAdapter()?.closeProfileProxy(BluetoothProfile.HEADSET, it)
        }
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    override fun currentState(): AudioRouteState = state
    override fun addListener(listener: AudioRouteListener) { listeners.add(listener) }

    override fun refresh(): AudioRouteState {
        val devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS or AudioManager.GET_DEVICES_OUTPUTS)
        val hasBtScoInput = devices.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO && it.isSink.not() }
        val hasBtScoOutput = devices.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO && it.isSink }
        val hfpConnected = bluetoothHeadset?.connectedDevices?.isNotEmpty() == true

        val newState = AudioRouteState(
            input = if (hfpConnected || hasBtScoInput) AudioInputRoute.RAYBAN_META else AudioInputRoute.PHONE_MIC,
            output = if (hfpConnected || hasBtScoOutput) AudioOutputRoute.RAYBAN_META else AudioOutputRoute.PHONE_SPEAKER,
            hfpConnected = hfpConnected,
        )
        if (newState != state) {
            state = newState
            listeners.forEach { it.onRouteChanged(newState) }
        }
        return state
    }
}
