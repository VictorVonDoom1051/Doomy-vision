import XCTest
@testable import DoomyVisionCore

// ESTADO: NOT RUN EN ESTE ENTORNO — no hay toolchain de Swift/Xcode en el
// contenedor Linux de trabajo (ver DOOMY_VISION_BLOCKERS.md). Este archivo
// es un espejo directo de los tests ya corridos y en verde del lado
// Android (BridgeStateMachineTest.kt, PushToTalkManagerTest.kt,
// VisionFrameProviderTest.kt, WearablesAndConversationTest.kt) — mismo
// comportamiento esperado, mismas correcciones de bugs ya aplicadas.
// Ejecutar con `swift test` en macOS con Xcode para confirmar en verde.
final class BridgeStateMachineTests: XCTestCase {
    func testStartsDisconnected() {
        let sm = BridgeStateMachine()
        XCTAssertEqual(sm.state, .disconnected)
    }

    func testHappyPathTransitions() throws {
        let sm = BridgeStateMachine()
        try sm.transition(to: .connecting)
        try sm.transition(to: .ready)
        try sm.transition(to: .listening)
        try sm.transition(to: .processing)
        try sm.transition(to: .speaking)
        try sm.transition(to: .ready)
        XCTAssertEqual(sm.state, .ready)
    }

    func testRejectsInvalidTransition() {
        let sm = BridgeStateMachine()
        XCTAssertThrowsError(try sm.transition(to: .speaking))
    }

    func testTextOnlyTurnReachesProcessingDirectlyFromReady() throws {
        // Regresión del bug encontrado en Android: READY -> PROCESSING
        // directo (turno de texto sin PTT) debe ser una transición válida.
        let sm = BridgeStateMachine()
        try sm.transition(to: .connecting)
        try sm.transition(to: .ready)
        try sm.transition(to: .processing)
        XCTAssertEqual(sm.state, .processing)
    }
}

final class MockWearablesManagerTests: XCTestCase {
    func testDocumentedMockDeviceKitFlow() async throws {
        let mgr = MockWearablesManager()
        _ = try await mgr.pair()
        _ = try await mgr.powerOn()
        _ = try await mgr.don()
        _ = try await mgr.unfold()
        let status = try await mgr.startSession()
        XCTAssertEqual(status.connectionState, .sessionReady)
        XCTAssertTrue(status.cameraAvailable)
    }

    func testStartSessionBeforeDonIsRejected() async {
        let mgr = MockWearablesManager()
        _ = try? await mgr.pair()
        do {
            _ = try await mgr.startSession()
            XCTFail("debía lanzar wearablesError")
        } catch {
            // esperado
        }
    }
}

final class VisionFrameProviderTests: XCTestCase {
    struct FlakyProvider: VisionFrameSourceProvider {
        let source: VisionFrameSource
        let fail: Bool
        var quality: FrameQuality = .good
        func capture() async throws -> VisionFrame? {
            if fail { throw DoomyVisionBridgeError.cameraError(detail: "capturePhoto falló (simulado)") }
            return VisionFrame(bytes: Data([1, 2, 3]), mimeType: "image/jpeg", source: source, width: 640, height: 480)
        }
        func assessQuality(_ frame: VisionFrame) -> FrameQuality { quality }
    }

    func testFallsBackFromPhotoCaptureToStreamFrame() async throws {
        let composite = CompositeVisionFrameProvider(providers: [
            FlakyProvider(source: .photoCapture, fail: true),
            FlakyProvider(source: .streamFrame, fail: false),
        ])
        let frame = try await composite.getBestFrame()
        XCTAssertEqual(frame.source, .streamFrame)
        XCTAssertEqual(composite.lastDiagnostics.count, 2)
        XCTAssertFalse(composite.lastDiagnostics[0].succeeded)
        XCTAssertTrue(composite.lastDiagnostics[1].succeeded)
    }
}
