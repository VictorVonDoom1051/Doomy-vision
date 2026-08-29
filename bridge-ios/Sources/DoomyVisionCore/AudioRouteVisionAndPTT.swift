import Foundation

// ==========================================================================
// AudioRouteManager (sección 9/10) — espejo de AudioRoute.kt. En la app
// real (DoomyVisionApp), la implementación concreta usa AVAudioSession +
// CallKit/AVAudioSession.routeChangeNotification para detectar HFP,
// exactamente como confirma la documentación oficial de Meta: el audio de
// los Ray-Ban se accede "through iOS or Android Bluetooth profiles", no
// por el SDK de DAT.
// ==========================================================================
public enum AudioInputRoute { case rayBanMeta, phoneMic, none }
public enum AudioOutputRoute { case rayBanMeta, phoneSpeaker }

public struct AudioRouteState: Equatable {
    public let input: AudioInputRoute
    public let output: AudioOutputRoute
    public let hfpConnected: Bool
    public init(input: AudioInputRoute, output: AudioOutputRoute, hfpConnected: Bool) {
        self.input = input; self.output = output; self.hfpConnected = hfpConnected
    }
}
extension AudioInputRoute: Equatable {}
extension AudioOutputRoute: Equatable {}

public protocol AudioRouteManager: AnyObject {
    func currentState() -> AudioRouteState
    func addListener(_ listener: @escaping (AudioRouteState) -> Void)
    @discardableResult func refresh() -> AudioRouteState
}

public final class SimulatedRayBanAudioRouteManager: AudioRouteManager {
    private var state = AudioRouteState(input: .none, output: .phoneSpeaker, hfpConnected: false)
    private var listeners: [(AudioRouteState) -> Void] = []
    public init() {}
    public func currentState() -> AudioRouteState { state }
    public func addListener(_ listener: @escaping (AudioRouteState) -> Void) { listeners.append(listener) }
    public func refresh() -> AudioRouteState { state }

    public func simulateHfpConnected() {
        state = AudioRouteState(input: .rayBanMeta, output: .rayBanMeta, hfpConnected: true)
        listeners.forEach { $0(state) }
    }
    public func simulateHfpDisconnected() {
        state = AudioRouteState(input: .phoneMic, output: .phoneSpeaker, hfpConnected: false)
        listeners.forEach { $0(state) }
    }
}

// ==========================================================================
// VisionFrameProvider (sección 8) — espejo de VisionFrameProvider.kt,
// incluida la corrección de doble-registro de diagnóstico encontrada y
// corregida durante las pruebas del lado Android (ver
// DOOMY_VISION_PROGRESS.md, "bugs encontrados y corregidos").
// ==========================================================================
public struct VisionFrame {
    public let bytes: Data
    public let mimeType: String
    public let source: VisionFrameSource
    public let width: Int
    public let height: Int
    public init(bytes: Data, mimeType: String, source: VisionFrameSource, width: Int, height: Int) {
        self.bytes = bytes; self.mimeType = mimeType; self.source = source; self.width = width; self.height = height
    }
}

public enum VisionFrameSource { case photoCapture, streamFrame, phoneCamera, mockImage }
public enum FrameQuality { case good, degraded, unusable }

public protocol VisionFrameSourceProvider {
    var source: VisionFrameSource { get }
    func capture() async throws -> VisionFrame?
    func assessQuality(_ frame: VisionFrame) -> FrameQuality
}

public struct VisionFrameDiagnosticEvent {
    public let attempted: VisionFrameSource
    public let succeeded: Bool
    public let reason: String?
}

public final class CompositeVisionFrameProvider {
    private let providers: [VisionFrameSourceProvider]
    public private(set) var lastDiagnostics: [VisionFrameDiagnosticEvent] = []

    public init(providers: [VisionFrameSourceProvider]) { self.providers = providers }

    public func getBestFrame() async throws -> VisionFrame {
        lastDiagnostics = []
        for provider in providers {
            var captureError: String?
            var frame: VisionFrame?
            do {
                frame = try await provider.capture()
            } catch {
                captureError = String(describing: error)
            }
            guard let f = frame else {
                lastDiagnostics.append(.init(attempted: provider.source, succeeded: false, reason: captureError ?? "capture() devolvió nil"))
                continue
            }
            let quality = provider.assessQuality(f)
            if quality == .unusable {
                lastDiagnostics.append(.init(attempted: provider.source, succeeded: false, reason: "calidad insuficiente"))
                continue
            }
            lastDiagnostics.append(.init(attempted: provider.source, succeeded: true, reason: quality == .degraded ? "calidad degradada pero aceptada" : nil))
            return f
        }
        throw DoomyVisionBridgeError.visionError(detail: "Todos los VisionFrameSourceProvider fallaron")
    }
}
extension FrameQuality: Equatable {}

public struct MockImageFrameProvider: VisionFrameSourceProvider {
    public let source: VisionFrameSource = .mockImage
    private let bytes: Data
    public init(bytes: Data) { self.bytes = bytes }
    public func capture() async throws -> VisionFrame? { VisionFrame(bytes: bytes, mimeType: "image/jpeg", source: source, width: 640, height: 480) }
    public func assessQuality(_ frame: VisionFrame) -> FrameQuality { .good }
}

// ==========================================================================
// PushToTalkManager (secciones 3/11) — espejo de PushToTalkManager.kt.
// ==========================================================================
public final class PushToTalkManager {
    private let stateMachine: BridgeStateMachine
    private let maxRecordingSeconds: Int
    private var recordingStartedAt: Date?

    public init(stateMachine: BridgeStateMachine, maxRecordingSeconds: Int = 30) {
        self.stateMachine = stateMachine
        self.maxRecordingSeconds = maxRecordingSeconds
    }

    public func onPressStart(now: Date = Date()) throws {
        guard stateMachine.state == .ready else {
            throw DoomyVisionBridgeError.audioError(detail: "PTT press ignorado: estado \(stateMachine.state), se esperaba ready")
        }
        recordingStartedAt = now
        try stateMachine.transition(to: .listening)
    }

    public func isOverLimit(now: Date = Date()) -> Bool {
        guard let started = recordingStartedAt else { return false }
        return now.timeIntervalSince(started) >= Double(maxRecordingSeconds)
    }

    public func onReleaseAndSend() throws {
        guard stateMachine.state == .listening else {
            throw DoomyVisionBridgeError.audioError(detail: "PTT release ignorado: estado \(stateMachine.state), se esperaba listening")
        }
        recordingStartedAt = nil
        try stateMachine.transition(to: .processing)
    }

    public func onResponseReady() throws { try stateMachine.transition(to: .speaking) }
    public func onPlaybackFinished() { stateMachine.tryTransition(to: .ready) }
    public func onError() { stateMachine.tryTransition(to: .error) }
}
