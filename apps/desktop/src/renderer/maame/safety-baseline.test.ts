import { describe, expect, it } from 'vitest';
import { checkBaseline, checkItem, maameBaseline } from './safety-baseline';

// Values read from the Maame FC (Copter 4.7.2) on 2026-11-06.
const FC: Record<string, number> = {
  ARMING_SKIPCHK: 0, FS_THR_ENABLE: 0, FS_GCS_ENABLE: 0, FS_GCS_TIMEOUT: 5, FS_OPTIONS: 16, FS_EKF_ACTION: 1,
  AUTO_OPTIONS: 0, FENCE_ENABLE: 0, FENCE_TYPE: 7, FENCE_ACTION: 3, FENCE_ALT_MAX: 120, RTL_ALT_M: 15,
  BATT_MONITOR: 4, BATT_FS_LOW_ACT: 2, BATT_FS_CRT_ACT: 1, SCR_ENABLE: 1, SCR_USER1: 0, SCR_USER2: 1,
  MAV_GCS_SYSID: 255, BRD_ALT_CONFIG: 1,
};

describe('maame safety baseline', () => {
  it('flags exactly the unsafe settings on the real FC, with the right fixes', () => {
    const failing = checkBaseline(maameBaseline(255), (p) => FC[p] ?? null).filter((r) => !r.ok);
    expect(failing.map((r) => [r.item.param, r.fix])).toEqual([
      ['ARMING_SKIPCHK', 64],
      ['FS_GCS_ENABLE', 1],
      ['FS_OPTIONS', 10],
      ['AUTO_OPTIONS', 3],
      ['FENCE_ENABLE', 1],
    ]);
  });

  it('passes once the fixes are applied', () => {
    const fixed: Record<string, number> = { ...FC, ARMING_SKIPCHK: 64, FS_GCS_ENABLE: 1, FS_OPTIONS: 10, AUTO_OPTIONS: 3, FENCE_ENABLE: 1 };
    expect(checkBaseline(maameBaseline(255), (p) => fixed[p] ?? null).every((r) => r.ok)).toBe(true);
  });

  it('keeps other bits, reports missing params, and follows the GCS sysid', () => {
    const auto = maameBaseline(255).find((i) => i.param === 'AUTO_OPTIONS')!;
    expect(checkItem(auto, 128)).toMatchObject({ ok: false, fix: 131 }); // weathervaning bit kept
    expect(checkItem(auto, 131).ok).toBe(true);
    expect(checkItem(auto, null)).toMatchObject({ ok: false, fix: null });
    const gcs = maameBaseline(254).find((i) => i.param === 'MAV_GCS_SYSID')!;
    expect(checkItem(gcs, 255)).toMatchObject({ ok: false, fix: 254 });
  });
});
