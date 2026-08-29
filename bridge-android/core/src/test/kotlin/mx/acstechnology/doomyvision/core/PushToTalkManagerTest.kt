package mx.acstechnology.doomyvision.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class PushToTalkManagerTest {
    private fun readyStateMachine(): BridgeStateMachine {
        val sm = BridgeStateMachine()
        sm.transition(BridgeState.CONNECTING)
        sm.transition(BridgeState.READY)
        return sm
    }

    @Test
    fun `full press-release-respond-playback cycle`() {
        val sm = readyStateMachine()
        val ptt = PushToTalkManager(sm)

        ptt.onPressStart(nowMs = 0)
        assertEquals(BridgeState.LISTENING, sm.state)

        ptt.onReleaseAndSend()
        assertEquals(BridgeState.PROCESSING, sm.state)

        ptt.onResponseReady()
        assertEquals(BridgeState.SPEAKING, sm.state)

        ptt.onPlaybackFinished()
        assertEquals(BridgeState.READY, sm.state)
    }

    @Test
    fun `pressing while not READY is rejected (no infinite recording bugs)`() {
        val sm = BridgeStateMachine() // DISCONNECTED
        val ptt = PushToTalkManager(sm)
        assertFailsWith<DoomyVisionBridgeError.AudioError> { ptt.onPressStart() }
    }

    @Test
    fun `releasing without pressing first is rejected`() {
        val sm = readyStateMachine()
        val ptt = PushToTalkManager(sm)
        assertFailsWith<DoomyVisionBridgeError.AudioError> { ptt.onReleaseAndSend() }
    }

    @Test
    fun `enforces max recording duration (no infinite recordings, section 41)`() {
        val sm = readyStateMachine()
        val ptt = PushToTalkManager(sm, maxRecordingSeconds = 5)
        ptt.onPressStart(nowMs = 0)
        assertTrue(!ptt.isOverLimit(nowMs = 3000))
        assertTrue(ptt.isOverLimit(nowMs = 5001))
    }

    @Test
    fun `onError moves state machine to ERROR from a busy state`() {
        val sm = readyStateMachine()
        val ptt = PushToTalkManager(sm)
        ptt.onPressStart(nowMs = 0)
        ptt.onReleaseAndSend()
        ptt.onError()
        assertEquals(BridgeState.ERROR, sm.state)
    }
}
