// Canonical app state for the fixture. Every snapshot-eligible field is
// marked with the @Snapshotable wrapper-style sentinel comment that the
// codegen tool detects. Two @Observable classes (one annotated, one not)
// confirm the codegen scopes correctly.

import Foundation

#if canImport(Observation)
import Observation
#endif

#if canImport(Observation)
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class FixtureAppState {
    @Snapshotable public var isLoggedIn: Bool = false
    @Snapshotable public var username: String = ""
    @Snapshotable public var tapCounter: Int = 0
    /// Not snapshotted — ephemeral cache that should never leak via /state/snapshot.
    public var ephemeralCache: [String: String] = [:]
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class FixtureUtility {
    public var lastEvent: String = ""
}
#endif

/// Property wrapper marker for snapshot-eligible state. The actual wrapper
/// is a no-op at runtime; codegen-tool detection happens via attribute scan.
@propertyWrapper
public struct Snapshotable<Value> {
    public var wrappedValue: Value
    public init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
}
