import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TlogRecorder, tlogFileName, tlogRecord } from './tlog';

describe('Maame tlog', () => {
  it('prefixes each frame with big-endian microseconds since 1970', () => {
    const rec = tlogRecord(new Uint8Array([0xfd, 1, 2]), 1_794_087_396_299.5);
    expect(new DataView(rec.buffer).getBigUint64(0)).toBe(1_794_087_396_299_500n);
    expect([...rec.slice(8)]).toEqual([0xfd, 1, 2]);
  });

  it('names files by local start time', () => {
    expect(tlogFileName(new Date(2026, 10, 7, 21, 6, 5))).toBe('maame-2026-11-07_21-06-05.tlog');
  });

  it('writes records back to back and closes cleanly', async () => {
    const r = new TlogRecorder();
    const path = r.start(mkdtempSync(join(tmpdir(), 'tlog-')));
    r.record(new Uint8Array([0xfd, 0xaa]));
    r.record(new Uint8Array([0xfe, 0xbb, 0xcc]));
    await r.stop();
    const bytes = readFileSync(path);
    expect(bytes.length).toBe(8 + 2 + 8 + 3);
    expect([...bytes.subarray(8, 10)]).toEqual([0xfd, 0xaa]);
    expect([...bytes.subarray(18)]).toEqual([0xfe, 0xbb, 0xcc]);
    r.record(new Uint8Array([1])); // after stop: ignored, no throw
  });
});
