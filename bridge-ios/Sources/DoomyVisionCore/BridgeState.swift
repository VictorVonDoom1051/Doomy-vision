import Foundation

/// Máquina de estados central del Bridge (sección 38). Espejo exacto de
/// mx.acstechnology.doomyvision.core.BridgeState en el lado Android/JVM —
/// mantener ambas en sync si se modifican las transiciones válidas.
public enum BridgeState: String, CaseIterable {
    case disconnected, connecting, ready, listening
    case capturingVision, uploading, processing, speaking, error
}

public struct InvalidStateTransitionError: Error, CustomStringConvertible {
    public let from: BridgeState
    public let to: BridgeState
    public var description: String { "Transición inválida: \(from) -> \(to)" }
}

private let validTransitions: [BridgeState: Set<BridgeState>] = [
    .disconnected: [.connecting],
    .connecting: [.ready, .error, .disconnected],
    .ready: [.listening, .capturingVision, .processing, .disconnected, .error],
    .listening: [.processing, .ready, .error, .disconnected],
    .capturingVision: [.uploading, .processing, .ready, .error],
    .uploading: [.processing, .error, .ready],
    .processing: [.speaking, .ready, .error],
    .speaking: [.ready, .error, .disconnected],
    .error: [.ready, .connecting, .disconnected],
]

public final class BridgeStateMachine {
    public private(set) var state: BridgeState
    private var listeners: [(BridgeState, BridgeState) -> Void] = []

    public init(initial: BridgeState = .disconnected) {
        self.state = initial
    }

    public func onTransition(_ listener: @escaping (BridgeState, BridgeState) -> Void) {
        listeners.append(listener)
    }

    public func canTransition(to: BridgeState) -> Bool {
        validTransitions[state]?.contains(to) ?? false
    }

    @discardableResult
    public func transition(to: BridgeState) throws -> BridgeState {
        guard canTransition(to: to) else { throw InvalidStateTransitionError(from: state, to: to) }
        let from = state
        state = to
        listeners.forEach { $0(from, to) }
        return state
    }

    @discardableResult
    public func tryTransition(to: BridgeState) -> Bool {
        guard canTransition(to: to) else { return false }
        _ = try? transition(to: to)
        return true
    }
}
