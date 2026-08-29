package mx.acstechnology.doomyvision.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import mx.acstechnology.doomyvision.core.BridgeState

/**
 * UI V1 (secciones 11/42): pantalla única, funcionalidad antes que diseño.
 * Un solo estado central (BridgeState, vía BridgeViewModel) en vez de
 * banderas booleanas repartidas (isTalking/isLoading/isRecording/...).
 *
 * Este archivo es real Jetpack Compose idiomático pero no se compila en
 * este entorno (requiere Android SDK). Ver DOOMY_VISION_BLOCKERS.md.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    DoomyVisionScreen()
                }
            }
        }
    }
}

@Composable
fun DoomyVisionScreen(viewModel: BridgeViewModel = androidx.lifecycle.viewmodel.compose.viewModel()) {
    val state by viewModel.state.collectAsState()
    val lastQuestion by viewModel.lastUserText.collectAsState()
    val lastAnswer by viewModel.lastAssistantText.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("DOOMY VISION", style = MaterialTheme.typography.headlineSmall)

        DiagnosticsRow(label = "Ray-Ban Meta", value = viewModel.glassesStatusLabel())
        DiagnosticsRow(label = "Camera", value = viewModel.cameraStatusLabel())
        DiagnosticsRow(label = "Microphone", value = viewModel.micStatusLabel())
        DiagnosticsRow(label = "Doomy Core", value = viewModel.coreStatusLabel())

        Spacer(Modifier.weight(1f))

        Text(
            text = when (state) {
                BridgeState.LISTENING -> "🎙️ Escuchando..."
                BridgeState.PROCESSING, BridgeState.CAPTURING_VISION, BridgeState.UPLOADING -> "🧠 Pensando..."
                BridgeState.SPEAKING -> "🔊 Doomy está hablando..."
                BridgeState.ERROR -> "⚠️ ${viewModel.lastErrorMessage.value}"
                else -> " "
            },
            style = MaterialTheme.typography.bodyMedium,
        )

        if (lastQuestion.isNotBlank()) Text("Tú: $lastQuestion", style = MaterialTheme.typography.bodySmall)
        if (lastAnswer.isNotBlank()) Text("Doomy: $lastAnswer", style = MaterialTheme.typography.bodySmall)

        Button(
            onClick = { /* onPressStart/onReleaseAndSend via viewModel, ligado a un pointerInput real */ },
            modifier = Modifier.fillMaxWidth().height(72.dp),
            enabled = state == BridgeState.READY || state == BridgeState.LISTENING,
        ) {
            Text(if (state == BridgeState.LISTENING) "Suelta para enviar" else "Mantén para hablar")
        }
    }
}

@Composable
private fun DiagnosticsRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.labelMedium)
    }
}
