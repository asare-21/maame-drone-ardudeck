import { describe, expect, it } from 'vitest';
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../shared/mission-types';
import { checkMission } from './mission-check';

const HOME = { lat: 51.65, lon: -0.08 };
const NORTH_100M = 100 / 111_195; // degrees of latitude for 100 m
const item = (command: number, lat: number, lon: number, altitude: number, param1 = 0): MissionItem => ({
  seq: 0, frame: MAV_FRAME.GLOBAL_RELATIVE_ALT, command, current: false, autocontinue: true,
  param1, param2: 0, param3: 0, param4: 0, latitude: lat, longitude: lon, altitude,
});
const mission = [
  item(MAV_CMD.NAV_TAKEOFF, 0, 0, 10),
  item(MAV_CMD.NAV_WAYPOINT, HOME.lat + NORTH_100M, HOME.lon, 10),
  item(MAV_CMD.NAV_RETURN_TO_LAUNCH, 0, 0, 0),
];
const fc: Record<string, number> = { FENCE_ENABLE: 1, FENCE_TYPE: 7, FENCE_ALT_MAX: 50, RTL_ALT_M: 15, BATT_CAPACITY: 10_000 };
const run = (over: Partial<Parameters<typeof checkMission>[0]> = {}) =>
  checkMission({ items: mission, home: HOME, param: (n) => fc[n] ?? null, outsideFence: () => null, ...over });

describe('Maame mission check', () => {
  it('passes a short mission and times it: climb 4 s + 100 m out 10 s + back 10 s + descend 20 s', () => {
    const r = run();
    expect(r.problems).toEqual([]);
    expect(r.minutes * 60).toBeCloseTo(44, 0);
    expect(r.packUse).toBeLessThan(0.1);
  });
  it('flags waypoints and the return height at or above the fence ceiling', () => {
    const high = [mission[0]!, item(MAV_CMD.NAV_WAYPOINT, HOME.lat, HOME.lon, 60), mission[2]!];
    expect(run({ items: high }).problems).toEqual(['item 2: 60 m is at or above the fence ceiling 50 m']);
    expect(run({ param: (n) => ({ ...fc, RTL_ALT_M: 50 })[n] ?? null }).problems[0]).toMatch(/return height/);
  });
  it('reports points outside the horizontal fence', () => {
    const r = run({ outsideFence: (lat) => (lat > HOME.lat ? 'outside fence: 100 m from home' : null) });
    expect(r.problems).toEqual(['item 2: outside fence: 100 m from home']);
  });
  it('refuses a mission that would use more than 70% of the pack', () => {
    const long = [mission[0]!, item(MAV_CMD.NAV_LOITER_TIME, 0, 0, 10, 20 * 60), mission[2]!];
    const r = run({ items: long });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/battery/);
  });
  it('needs a home position', () => {
    expect(run({ home: null }).problems).toEqual(['no home position yet (needs GPS)']);
  });
  it('uses the measured hover current when there is one', () => {
    const est = run();
    const meas = run({ hoverCurrentA: 50 });
    expect(est.measured).toBe(false);
    expect(meas.measured).toBe(true);
    expect(meas.packUse / est.packUse).toBeCloseTo(2, 5); // 50 A vs the 25 A estimate
  });
});
