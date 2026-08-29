import Foundation

/// Espejo de Wearables.kt — ver ese archivo para la justificación completa
/// (sección 6). MockWearablesManager reproduce el flujo documentado de
/// MockDeviceKit: pair -> power on -> don -> unfold -> session ready.
public enum DeviceMode { case realGlasses, mockDevice, phone }

public enum WearableConnectionState: Int, Comparable {
    case disconnected = 0, pairing, paired, poweredOn, worn, sessionReady
    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

public struct WearableStatus {
    public var connectionState: WearableConnectionState
    public var cameraAvailable: Bool
    public var batteryPercent: Int?
    public init(connectionState: WearableConnectionState, cameraAvailable: Bool, batteryPercent: Int? = nil) {
        self.connectionState = connectionState
        self.cameraAvailable = cameraAvailable
        self.batteryPercent = batteryPercent
    }
}

public protocol WearablesManager: AnyObject {
    var mode: DeviceMode { get }
    func pair() async throws -> WearableStatus
    func powerOn() async throws -> WearableStatus
    func don() async throws -> WearableStatus
    func unfold() async throws -> WearableStatus
    func startSession() async throws -> WearableStatus
    func disconnect() async
    func currentStatus() -> WearableStatus
}

public final class MockWearablesManager: WearablesManager {
    public let mode: DeviceMode = .mockDevice
    private var status = WearableStatus(connectionState: .disconnected, cameraAvailable: false)
    public init() {}

    public func pair() async throws -> WearableStatus {
        status.connectionState = .paired
        return status
    }

    public func powerOn() async throws -> WearableStatus {
        guard status.connectionState >= .paired else {
            throw DoomyVisionBridgeError.wearablesError(detail: "powerOn sin pair() previo")
        }
        status.connectionState = .poweredOn
        return status
    }

    public func don() async throws -> WearableStatus {
        guard status.connectionState >= .poweredOn else {
            throw DoomyVisionBridgeError.wearablesError(detail: "don() sin powerOn() previo")
        }
        status.connectionState = .worn
        return status
    }

    public func unfold() async throws -> WearableStatus {
        guard status.connectionState >= .worn else {
            throw DoomyVisionBridgeError.wearablesError(detail: "unfold() sin don() previo")
        }
        return status
    }

    public func startSession() async throws -> WearableStatus {
        // Regla documentada de Meta: powered on + worn antes de streaming.
        guard status.connectionState >= .worn else {
            throw DoomyVisionBridgeError.wearablesError(detail: "startSession sin power_on+don (estado: \(status.connectionState))")
        }
        status.connectionState = .sessionReady
        status.cameraAvailable = true
        status.batteryPercent = 87
        return status
    }

    public func disconnect() async {
        status = WearableStatus(connectionState: .disconnected, cameraAvailable: false)
    }

    public func currentStatus() -> WearableStatus { status }
}
