package mx.acstechnology.doomyvision.core

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MockWearablesManagerTest {
    @Test
    fun `documented MockDeviceKit flow — pair, power on, don, unfold, session ready, camera available`() = runTest {
        val mgr = MockWearablesManager()
        mgr.pair()
        mgr.powerOn()
        mgr.don()
        mgr.unfold()
        val status = mgr.startSession()
        assertEquals(WearableConnectionState.SESSION_READY, status.connectionState)
        assertTrue(status.cameraAvailable)
    }

    @Test
    fun `startSession before don+powerOn is rejected — enforces Meta's documented ordering`() = runTest {
        val mgr = MockWearablesManager()
        mgr.pair()
        assertFailsWith<DoomyVisionBridgeError.WearablesError> { mgr.startSession() }
    }

    @Test
    fun `powerOn before pair is rejected`() = runTest {
        val mgr = MockWearablesManager()
        assertFailsWith<IllegalArgumentException> { mgr.powerOn() }
    }

    @Test
    fun `disconnect resets to DISCONNECTED with camera unavailable`() = runTest {
        val mgr = MockWearablesManager()
        mgr.pair(); mgr.powerOn(); mgr.don(); mgr.unfold(); mgr.startSession()
        mgr.disconnect()
        val status = mgr.currentStatus()
        assertEquals(WearableConnectionState.DISCONNECTED, status.connectionState)
        assertTrue(!status.cameraAvailable)
    }
}

class SimulatedRayBanAudioRouteManagerTest {
    @Test
    fun `defaults to NONE input until HFP connects, never silently assumes Ray-Ban mic`() {
        val mgr = SimulatedRayBanAudioRouteManager()
        assertEquals(AudioInputRoute.NONE, mgr.currentState().input)
    }

    @Test
    fun `notifies listeners and switches routes on HFP connect and disconnect`() {
        val mgr = SimulatedRayBanAudioRouteManager()
        val events = mutableListOf<AudioRouteState>()
        mgr.addListener(object : AudioRouteListener {
            override fun onRouteChanged(newState: AudioRouteState) { events.add(newState) }
        })
        mgr.simulateHfpConnected()
        assertEquals(AudioInputRoute.RAYBAN_META, mgr.currentState().input)
        mgr.simulateHfpDisconnected()
        assertEquals(AudioInputRoute.PHONE_MIC, mgr.currentState().input)
        assertEquals(2, events.size)
    }
}

class ConversationManagerTest {
    @Test
    fun `text-only turn does not touch the vision provider`() = runTest {
        val sm = BridgeStateMachine()
        sm.transition(BridgeState.CONNECTING)
        val api = FakeDoomyApiClient()
        val convo = ConversationManager(api, sm, visionProvider = null)
        convo.startSession("phone", "mock")

        val result = convo.sendTurn("¿Qué hora es?", withVision = false)
        assertEquals(false, result.visionUsed)
        assertEquals(BridgeState.SPEAKING, sm.state)
    }

    @Test
    fun `vision turn captures a frame through the composite provider first`() = runTest {
        val sm = BridgeStateMachine()
        sm.transition(BridgeState.CONNECTING)
        val api = FakeDoomyApiClient()
        val vision = CompositeVisionFrameProvider(listOf(MockImageFrameProvider(byteArrayOf(1, 2, 3))))
        val convo = ConversationManager(api, sm, vision)
        convo.startSession("mock", "mock")

        val result = convo.sendTurn("¿Qué estoy viendo?", withVision = true)
        assertEquals(true, result.visionUsed)
    }

    @Test
    fun `API failure moves the state machine to ERROR instead of hanging`() = runTest {
        val sm = BridgeStateMachine()
        sm.transition(BridgeState.CONNECTING)
        val api = FakeDoomyApiClient(shouldFailNext = true)
        val convo = ConversationManager(api, sm, visionProvider = null)
        convo.startSession("phone", "mock")

        assertFailsWith<DoomyVisionBridgeError.DoomyAPIError> { convo.sendTurn("hola", withVision = false) }
        assertEquals(BridgeState.ERROR, sm.state)
    }

    @Test
    fun `sendTurn without an active session fails clearly`() = runTest {
        val sm = BridgeStateMachine()
        val convo = ConversationManager(FakeDoomyApiClient(), sm, visionProvider = null)
        assertFailsWith<DoomyVisionBridgeError.DoomyAPIError> { convo.sendTurn("hola", withVision = false) }
    }
}
