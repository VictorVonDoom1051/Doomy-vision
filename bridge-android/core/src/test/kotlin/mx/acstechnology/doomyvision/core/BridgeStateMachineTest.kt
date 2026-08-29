package mx.acstechnology.doomyvision.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BridgeStateMachineTest {
    @Test
    fun `starts DISCONNECTED`() {
        val sm = BridgeStateMachine()
        assertEquals(BridgeState.DISCONNECTED, sm.state)
    }

    @Test
    fun `valid full happy path transitions`() {
        val sm = BridgeStateMachine()
        sm.transition(BridgeState.CONNECTING)
        sm.transition(BridgeState.READY)
        sm.transition(BridgeState.LISTENING)
        sm.transition(BridgeState.PROCESSING)
        sm.transition(BridgeState.SPEAKING)
        sm.transition(BridgeState.READY)
        assertEquals(BridgeState.READY, sm.state)
    }

    @Test
    fun `rejects invalid transition DISCONNECTED to SPEAKING`() {
        val sm = BridgeStateMachine()
        assertFailsWith<InvalidStateTransitionException> { sm.transition(BridgeState.SPEAKING) }
    }

    @Test
    fun `tryTransition returns false instead of throwing`() {
        val sm = BridgeStateMachine()
        assertFalse(sm.tryTransition(BridgeState.SPEAKING))
        assertEquals(BridgeState.DISCONNECTED, sm.state)
    }

    @Test
    fun `error is reachable from every busy state and can recover to READY`() {
        val sm = BridgeStateMachine()
        sm.transition(BridgeState.CONNECTING)
        sm.transition(BridgeState.READY)
        sm.transition(BridgeState.LISTENING)
        assertTrue(sm.canTransition(BridgeState.ERROR))
        sm.transition(BridgeState.ERROR)
        assertTrue(sm.canTransition(BridgeState.READY))
    }

    @Test
    fun `listeners are notified on transition`() {
        val sm = BridgeStateMachine()
        val seen = mutableListOf<Pair<BridgeState, BridgeState>>()
        sm.onTransition { from, to -> seen.add(from to to) }
        sm.transition(BridgeState.CONNECTING)
        assertEquals(listOf(BridgeState.DISCONNECTED to BridgeState.CONNECTING), seen)
    }

    @Test
    fun `vision capture path is reachable from READY`() {
        val sm = BridgeStateMachine()
        sm.transition(BridgeState.CONNECTING)
        sm.transition(BridgeState.READY)
        sm.transition(BridgeState.CAPTURING_VISION)
        sm.transition(BridgeState.UPLOADING)
        sm.transition(BridgeState.PROCESSING)
        sm.transition(BridgeState.SPEAKING)
        assertEquals(BridgeState.SPEAKING, sm.state)
    }
}
