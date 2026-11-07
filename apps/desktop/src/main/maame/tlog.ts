/**
 * Maame telemetry log (.tlog): every MAVLink frame to and from the drone during a
 * Maame connection, each prefixed by its time as a uint64 big-endian count of
 * microseconds since 1970. The standard format MAVExplorer, Mission Planner and
 * pymavlink replay; recorded on the laptop, so it survives losing the aircraft.
 */
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

/** One tlog record: timestamp + raw frame. */
export function tlogRecord(frame: Uint8Array, nowMs: number): Uint8Array {
  const out = new Uint8Array(8 + frame.length);
  new DataView(out.buffer).setBigUint64(0, BigInt(Math.round(nowMs * 1000)));
  out.set(frame, 8);
  return out;
}

/** maame-2026-11-07_21-36-05.tlog (local time). */
export function tlogFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `maame-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.tlog`;
}

export class TlogRecorder {
  private stream: WriteStream | null = null;
  path: string | null = null;

  start(dir: string, now = new Date()): string {
    void this.stop();
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, tlogFileName(now));
    this.stream = createWriteStream(this.path);
    this.stream.on('error', () => { this.stream = null; }); // a full disk must not break the link
    return this.path;
  }

  record(frame: Uint8Array): void {
    this.stream?.write(tlogRecord(frame, Date.now()));
  }

  stop(): Promise<void> {
    const s = this.stream;
    this.stream = null;
    return s ? new Promise((resolve) => s.end(resolve)) : Promise.resolve();
  }
}

/** The recorder for the current Maame connection (one at a time, like the primary link). */
export const maameTlog = new TlogRecorder();
