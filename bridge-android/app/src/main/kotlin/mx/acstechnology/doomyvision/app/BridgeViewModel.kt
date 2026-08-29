package mx.acstechnology.doomyvision.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mx.acstechnology.doomyvision.core.*

/**
 * ViewModel que conecta la UI con la máquina de estados y
 * ConversationManager de :core. Decide, según BuildConfig/Settings, si
 * usar RealWearablesManager (MODE A), MockWearablesManager (MODE B) o
 * nada especial + PhoneCameraFrameProvider (MODE C) — sección 6.
 */
class BridgeViewModel(
    private val stateMachine: BridgeStateMachine = BridgeStateMachine(),
    private val pushToTalk: PushToTalkManager = PushToTalkManager(stateMachine),
    private val wearables: WearablesManager = MockWearablesManager(),
    private val audioRoute: AudioRouteManager = PhoneOnlyAudioRouteManager(),
    private val api: DoomyApiClient? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(stateMachine.state)
    val state: StateFlow<BridgeState> = _state.asStateFlow()

    val lastUserText = MutableStateFlow("")
    val lastAssistantText = MutableStateFlow("")
    val lastErrorMessage = MutableStateFlow("")

    init {
        stateMachine.onTransition { _, to -> _state.value = to }
    }

    fun glassesStatusLabel(): String = when (wearables.currentStatus().connectionState) {
        WearableConnectionState.SESSION_READY -> "● Connected"
        WearableConnectionState.DISCONNECTED -> "○ Disconnected"
        else -> "◐ ${wearables.currentStatus().connectionState}"
    }

    fun cameraStatusLabel(): String = if (wearables.currentStatus().cameraAvailable) "● Ready" else "○ Not ready"

    fun micStatusLabel(): String = when (audioRoute.currentState().input) {
        AudioInputRoute.RAYBAN_META -> "● Ray-Ban Meta"
        AudioInputRoute.PHONE_MIC -> "⚠ Phone"
        AudioInputRoute.NONE -> "○ None"
    }

    fun coreStatusLabel(): String = if (api != null) "● Online" else "○ Not configured"

    fun onPressStart() = runCatching { pushToTalk.onPressStart() }
        .onFailure { lastErrorMessage.value = it.message ?: "Error" }

    fun onReleaseAndSend(transcribedText: String) {
        viewModelScope.launch {
            try {
                pushToTalk.onReleaseAndSend()
                lastUserText.value = transcribedText
                // ConversationManager real se inyectaría aquí con el api
                // client + vision provider configurados por DeviceMode.
                pushToTalk.onResponseReady()
            } catch (e: DoomyVisionBridgeError) {
                lastErrorMessage.value = e.userMessage
                pushToTalk.onError()
            }
        }
    }
}
