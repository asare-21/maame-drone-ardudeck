import { describe, expect, it } from 'vitest';
import { blockingPrearm, readyChecks, type ReadyInput } from './ready-checks';

const NOW = 100_000;
const good: ReadyInput = {
  nowMs: NOW, connected: true, baselineFailures: 0, gpsFixType: 3, gpsSats: 12, batteryVoltage: 23.2,
  piLastSeenMs: NOW - 500, piStatus: 3, messages: [], missionItems: 5, uploadedItems: 5,
  armVoltage: null, missionCheck: { ok: true, problems: [], minutes: 4, packUse: 0.2 },
};
const failing = (i: ReadyInput) => readyChecks(i).filter((c) => !c.ok).map((c) => c.id);

describe('readyChecks', () => {
  it('passes a healthy drone with the Pi still on standby (the launch flow opens the gate)', () => {
    expect(failing(good)).toEqual([]);
  });

  it('matches what the bench drone reported: no GPS, so pre-arm blocks', () => {
    const bench = {
      ...good, gpsFixType: 0, gpsSats: 0,
      messages: [
        { text: 'PreArm: AHRS: waiting for home', timestamp: NOW - 5000 },
        { text: 'PreArm: Pi companion not ready', timestamp: NOW - 5000 },
        { text: 'PreArm: Fence requires position', timestamp: NOW - 5000 },
      ],
    };
    expect(failing(bench)).toEqual(['gps', 'prearm']);
    expect(readyChecks(bench).find((c) => c.id === 'prearm')!.detail).toBe('AHRS: waiting for home; Fence requires position');
  });

  it('flags a low pack, a silent Pi, unsafe settings and an unuploaded mission', () => {
    expect(failing({ ...good, batteryVoltage: 21.0, piLastSeenMs: NOW - 5000, baselineFailures: 2, uploadedItems: null })).toEqual([
      'baseline', 'battery', 'pi', 'mission',
    ]);
  });

  it('ignores old pre-arm messages', () => {
    expect(blockingPrearm([{ text: 'PreArm: Compass 1 not healthy', timestamp: NOW - 60_000 }], NOW)).toEqual([]);
  });

  it('uses the FC arming voltage when it is stricter (22.68 V passes 3.6 V/cell but not BATT_ARM_VOLT 22.8)', () => {
    const r = readyChecks({ ...good, batteryVoltage: 22.68, armVoltage: 22.8 }).find((c) => c.id === 'battery')!;
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('22.68 V (3.78 V/cell), need 22.80 V (FC arming minimum)');
    expect(failing({ ...good, batteryVoltage: 22.68, armVoltage: null })).toEqual([]);
  });

  it('blocks a mission that breaks the fence or the battery budget', () => {
    const bad = { ok: false, problems: ['item 2: 60 m is at or above the fence ceiling 50 m'], minutes: 3, packUse: 0.1 };
    expect(failing({ ...good, missionCheck: bad })).toEqual(['missionSafe']);
    expect(readyChecks({ ...good, missionCheck: bad }).find((c) => c.id === 'missionSafe')!.detail).toMatch(/fence ceiling/);
    expect(failing({ ...good, missionItems: 0, uploadedItems: null, missionCheck: null })).toEqual(['mission', 'missionSafe']);
  });
});
