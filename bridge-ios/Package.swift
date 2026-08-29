// swift-tools-version:5.10
// ==========================================================================
// Doomy Vision Bridge — paquete Swift.
//
// ESTADO: estructura y código listos, NO COMPILADO en este entorno (el
// contenedor de trabajo es Linux sin Xcode/toolchain de Swift — ver
// DOOMY_VISION_BLOCKERS.md). DoomyVisionCore es Swift puro (sin
// UIKit/AVFoundation) y es el candidato para correr con `swift test` en
// cualquier Mac con Xcode sin necesitar un dispositivo ni Ray-Ban reales.
// DoomyVisionApp (la app real) depende de MWDAT vía Swift Package Manager
// y de AVFoundation/CoreBluetooth, así que solo compila en Xcode/iOS.
// ==========================================================================
import PackageDescription

let package = Package(
    name: "DoomyVisionBridge",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "DoomyVisionCore", targets: ["DoomyVisionCore"]),
    ],
    dependencies: [
        // Meta Wearables Device Access Toolkit v0.7.0 — requiere acceso
        // al Developer Preview de Meta antes de poder resolverse.
        // .package(url: "https://github.com/facebook/meta-wearables-dat-ios", from: "0.7.0"),
    ],
    targets: [
        .target(name: "DoomyVisionCore", dependencies: []),
        .testTarget(name: "DoomyVisionCoreTests", dependencies: ["DoomyVisionCore"]),
        // DoomyVisionApp (app real con MWDAT/AVFoundation) se agrega como
        // target de app en un proyecto Xcode, no como target SPM de librería.
    ]
)
