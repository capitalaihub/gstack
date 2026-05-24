/**
 * terminal-agent process-control primitives shared by cli.ts spawn site,
 * server.ts shutdown teardown, and the v1.44 watchdog/respawn loop.
 *
 * Why this exists: pre-v1.44 used `pkill -f terminal-agent\.ts`, which
 * matches any process whose argv contains the string and would kill
 * sibling gstack sessions on the same host. The agent now writes a
 * structured `terminal-agent-pid` record (`{pid, gen, startedAt}`) and
 * every kill site routes through `killAgentByRecord` here — identity-based,
 * no regex.
 *
 * The `gen` field is a per-boot generation counter. Loopback /internal/*
 * calls from the parent server include `X-Browse-Gen` so a slow agent that
 * the watchdog respawned around can't accidentally service a stale grant
 * from the old generation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { safeUnlink, safeKill, isProcessAlive } from './error-handling';
import { writeSecureFile, mkdirSecure } from './file-permissions';

export interface AgentRecord {
  pid: number;
  /** Random per-boot identifier. Loopback /internal/* sees X-Browse-Gen: <gen>. */
  gen: string;
  /** ms since epoch. Reserved for future PID-reuse guards. */
  startedAt: number;
}

export function agentRecordPath(stateDir: string): string {
  return path.join(stateDir, 'terminal-agent-pid');
}

/** Read the current record. Returns null on missing/malformed file. */
export function readAgentRecord(stateDir: string): AgentRecord | null {
  try {
    const raw = fs.readFileSync(agentRecordPath(stateDir), 'utf-8');
    const j = JSON.parse(raw);
    if (typeof j?.pid === 'number' && typeof j?.gen === 'string' && typeof j?.startedAt === 'number') {
      return j as AgentRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/** Atomic write. Caller must ensure stateDir exists; agent does this at boot. */
export function writeAgentRecord(stateDir: string, record: AgentRecord): void {
  try { mkdirSecure(stateDir); } catch {}
  const target = agentRecordPath(stateDir);
  const tmp = `${target}.tmp-${process.pid}`;
  writeSecureFile(tmp, JSON.stringify(record));
  fs.renameSync(tmp, target);
}

export function clearAgentRecord(stateDir: string): void {
  safeUnlink(agentRecordPath(stateDir));
}

/**
 * Kill the agent identified by `record`. Signal defaults to SIGTERM (give
 * the agent a chance to run its own SIGTERM cleanup). Returns true if a
 * signal was actually sent to a live PID; false if the PID was already
 * dead (no-op). Never throws — ESRCH is swallowed by safeKill.
 *
 * Validates liveness BEFORE signaling so a PID-reuse race (the recorded
 * PID was reaped and a brand-new unrelated process now holds it) can't
 * cause us to kill the wrong process. This is a best-effort defense:
 * Linux/macOS don't expose process-start-time cheaply, and the gap
 * between record-write and watchdog-tick is small (60s max).
 */
export function killAgentByRecord(
  record: AgentRecord,
  signal: NodeJS.Signals = 'SIGTERM',
): boolean {
  if (!isProcessAlive(record.pid)) return false;
  safeKill(record.pid, signal);
  return true;
}
