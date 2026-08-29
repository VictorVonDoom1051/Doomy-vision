package mx.acstechnology.doomyvision.core

/**
 * Máquina de estados central del Bridge (sección 38 de la misión).
 * Un solo estado central en vez de "isTalking / isLoading / isRecording /
 * isSending / isThinking" repartidos por toda la app.
 */
enum class BridgeState {
    DISCONNECTED,
    CONNECTING,
    READY,
    LISTENING,
    CAPTURING_VISION,
    UPLOADING,
    PROCESSING,
    SPEAKING,
    ERROR,
}

/** Transiciones válidas explícitas — cualquier otra transición se rechaza. */
private val VALID_TRANSITIONS: Map<BridgeState, Set<BridgeState>> = mapOf(
    BridgeState.DISCONNECTED to setOf(BridgeState.CONNECTING),
    BridgeState.CONNECTING to setOf(BridgeState.READY, BridgeState.ERROR, BridgeState.DISCONNECTED),
    // PROCESSING es alcanzable directo desde READY (no solo vía LISTENING):
    // un turno de texto ya transcrito — p.ej. desde el Dev Console o un
    // teclado — no pasa por captura de audio.
    BridgeState.READY to setOf(BridgeState.LISTENING, BridgeState.CAPTURING_VISION, BridgeState.PROCESSING, BridgeState.DISCONNECTED, BridgeState.ERROR),
    BridgeState.LISTENING to setOf(BridgeState.PROCESSING, BridgeState.READY, BridgeState.ERROR, BridgeState.DISCONNECTED),
    BridgeState.CAPTURING_VISION to setOf(BridgeState.UPLOADING, BridgeState.PROCESSING, BridgeState.READY, BridgeState.ERROR),
    BridgeState.UPLOADING to setOf(BridgeState.PROCESSING, BridgeState.ERROR, BridgeState.READY),
    BridgeState.PROCESSING to setOf(BridgeState.SPEAKING, BridgeState.READY, BridgeState.ERROR),
    BridgeState.SPEAKING to setOf(BridgeState.READY, BridgeState.ERROR, BridgeState.DISCONNECTED),
    BridgeState.ERROR to setOf(BridgeState.READY, BridgeState.CONNECTING, BridgeState.DISCONNECTED),
)

class InvalidStateTransitionException(from: BridgeState, to: BridgeState) :
    IllegalStateException("Transición inválida: $from -> $to")

/**
 * Máquina de estados con listeners, thread-unsafe por diseño simple
 * (se espera un solo hilo/coroutine dueño en el Bridge real; la app
 * Android la envuelve en un StateFlow — ver app/ para el wrapper real).
 */
class BridgeStateMachine(initial: BridgeState = BridgeState.DISCONNECTED) {
    var state: BridgeState = initial
        private set

    private val listeners = mutableListOf<(BridgeState, BridgeState) -> Unit>()

    fun onTransition(listener: (from: BridgeState, to: BridgeState) -> Unit) {
        listeners.add(listener)
    }

    fun canTransition(to: BridgeState): Boolean = to in (VALID_TRANSITIONS[state] ?: emptySet())

    fun transition(to: BridgeState) {
        if (!canTransition(to)) throw InvalidStateTransitionException(state, to)
        val from = state
        state = to
        listeners.forEach { it(from, to) }
    }

    /** Igual que transition() pero no lanza si la transición no es válida — para llamadores tolerantes. */
    fun tryTransition(to: BridgeState): Boolean {
        if (!canTransition(to)) return false
        transition(to)
        return true
    }
}
