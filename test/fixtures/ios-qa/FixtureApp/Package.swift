// swift-tools-version:5.9
// Test fixture: minimal SwiftUI app + DebugBridge SPM package.
// DebugBridgeCore (Foundation+Network) builds cross-platform.
// DebugBridgeUI (UIKit/SwiftUI) is iOS-only.

import PackageDescription

let package = Package(
    name: "FixtureApp",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "DebugBridgeCore", targets: ["DebugBridgeCore"]),
        .library(name: "DebugBridgeUI", targets: ["DebugBridgeUI"]),
    ],
    targets: [
        .target(
            name: "DebugBridgeCore",
            dependencies: [],
            path: "Sources/DebugBridgeCore",
            swiftSettings: [
                .define("DEBUG", .when(configuration: .debug)),
            ]
        ),
        .target(
            name: "DebugBridgeUI",
            dependencies: ["DebugBridgeCore"],
            path: "Sources/DebugBridgeUI",
            swiftSettings: [
                .define("DEBUG", .when(configuration: .debug)),
            ]
        ),
        .testTarget(
            name: "DebugBridgeCoreTests",
            dependencies: ["DebugBridgeCore"],
            path: "Tests/DebugBridgeCoreTests"
        ),
    ]
)
