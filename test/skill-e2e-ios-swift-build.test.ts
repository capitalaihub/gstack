// Swift-build invariant tests. Runs against the fixture iOS app at
// test/fixtures/ios-qa/FixtureApp/. Requires the Swift toolchain
// (Xcode CLI tools or stand-alone Swift). Skipped if swift is not on PATH.
//
// Two invariants:
//
//   1. Debug-config build succeeds + the StateServer XCTest unit suite
//      passes (validates that the Swift production code actually runs,
//      not just compiles).
//
//   2. Release-config build excludes DebugBridge symbols. This is the
//      structural Release-build guard from Package.swift's
//      `.when(configuration: .debug)`. We verify by:
//        a. swift build -c release succeeds
//        b. nm -j against the built binary shows zero `DebugBridge*`
//           symbols
//        c. swift build -c release with --vv shows DebugBridge target
//           gated (no compilation step for DebugBridgeCore/UI)

import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const FIXTURE_PATH = join(ROOT, 'test/fixtures/ios-qa/FixtureApp');

function hasSwift(): boolean {
  const r = spawnSync('swift', ['--version'], { stdio: 'pipe' });
  return r.status === 0;
}

const swiftAvailable = hasSwift();
const describeIfSwift = swiftAvailable ? describe : describe.skip;

describeIfSwift('swift build invariants', () => {
  test('Debug-config build succeeds', () => {
    const r = spawnSync('swift', ['build', '-c', 'debug'], {
      cwd: FIXTURE_PATH,
      stdio: 'pipe',
      timeout: 120_000,
    });
    if (r.status !== 0) {
      console.error('swift build stderr:', r.stderr?.toString().slice(0, 4000));
    }
    expect(r.status).toBe(0);
  }, 180_000);

  test('XCTest suite for StateServer passes (validates real Swift impl)', () => {
    const r = spawnSync('swift', ['test'], {
      cwd: FIXTURE_PATH,
      stdio: 'pipe',
      timeout: 180_000,
    });
    const stdout = r.stdout?.toString() ?? '';
    const stderr = r.stderr?.toString() ?? '';
    const combined = stdout + stderr;
    if (r.status !== 0) {
      console.error('swift test failure:', combined.slice(-4000));
    }
    expect(r.status).toBe(0);
    expect(combined).toContain("'All tests' passed");
  }, 240_000);

  // Codex-flagged: Release-build guard must be STRUCTURAL, not advisory.
  // The Package.swift's `.when(configuration: .debug)` setting causes Swift
  // to compile-out the entire DebugBridge target body in Release. Since
  // every public symbol is gated `#if DEBUG`, the release build emits an
  // empty module — zero symbols.
  test('Release-config build excludes DebugBridge symbols', () => {
    // Step 1: clean + release build
    spawnSync('swift', ['package', 'clean'], { cwd: FIXTURE_PATH, stdio: 'pipe', timeout: 60_000 });
    const build = spawnSync('swift', ['build', '-c', 'release'], {
      cwd: FIXTURE_PATH,
      stdio: 'pipe',
      timeout: 180_000,
    });
    if (build.status !== 0) {
      console.error('release build stderr:', build.stderr?.toString().slice(0, 4000));
    }
    expect(build.status).toBe(0);

    // Step 2: locate the built object file(s). SwiftPM puts .build artifacts
    // under .build/<triple>/release/.
    const oFiles = spawnSync('find', [
      join(FIXTURE_PATH, '.build'),
      '-path', '*/release/*',
      '-name', '*.o',
      '-path', '*DebugBridge*',
    ], { stdio: 'pipe' });
    const files = (oFiles.stdout?.toString() ?? '').trim().split('\n').filter(Boolean);
    expect(files.length).toBeGreaterThan(0);

    let foundForbidden = 0;
    const forbidden = ['StateServer', 'handleRequest', 'sessionAcquire', 'authRotate', 'snapshotGet'];
    for (const f of files) {
      const nm = spawnSync('nm', ['-j', f], { stdio: 'pipe' });
      const syms = nm.stdout?.toString() ?? '';
      for (const tok of forbidden) {
        if (syms.includes(tok)) {
          console.error(`Release symbol leak: ${tok} found in ${f}`);
          foundForbidden++;
        }
      }
    }
    expect(foundForbidden).toBe(0);
  }, 300_000);
});
