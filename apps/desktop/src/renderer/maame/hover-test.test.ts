import { describe, expect, it } from 'vitest';
import { MAV_CMD } from '../../shared/mission-types';
import { averageHoverCurrent, hoverTestMission, hoverTestProblem } from './hover-test';

const plan = { heightM: 1, holdS: 8, lat: 51.65, lon: -0.08 };

describe('Maame hover test mission', () => {
  it('is HOME, take off to the height, hover for the hold time, land in place', () => {
    const m = hoverTestMission(plan);
    expect(m.map((i) => i.seq)).toEqual([0, 1, 2, 3]);
    expect(m.map((i) => i.command)).toEqual([MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_TAKEOFF, MAV_CMD.NAV_LOITER_TIME, MAV_CMD.NAV_LAND]);
    expect(m[1]!.altitude).toBe(1);
    expect(m[2]!.param1).toBe(8);
    expect(m[2]!.altitude).toBe(1);
    for (const i of m.slice(1)) expect([i.latitude, i.longitude]).toEqual([51.65, -0.08]);
  });
  it('refuses anything outside 0.5/1 m, 5-10 s, or without GPS', () => {
    expect(hoverTestProblem({ ...plan, heightM: 0.5 })).toBeNull();
    expect(hoverTestProblem({ ...plan, heightM: 5 })).toMatch(/height/);
    expect(hoverTestProblem({ ...plan, holdS: 4 })).toMatch(/hover time/);
    expect(hoverTestProblem({ ...plan, holdS: 11 })).toMatch(/hover time/);
    expect(hoverTestProblem({ ...plan, lat: 0, lon: 0 })).toMatch(/GPS/);
    expect(() => hoverTestMission({ ...plan, heightM: 3 })).toThrow();
  });
  it('averages hover current only from enough in-air samples', () => {
    expect(averageHoverCurrent([20, 22, 24, 0, NaN, 21, 23, 22, 20, 24, 22, 23])).toBeCloseTo(22.1, 1);
    expect(averageHoverCurrent([20, 22])).toBeNull();
  });
});
