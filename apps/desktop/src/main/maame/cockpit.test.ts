import { describe, expect, it } from 'vitest';
import { COCKPIT_LIMITS, MASK_OFFSET, MASK_VELOCITY, cockpitRefusal, positionTarget, turnCommand } from './cockpit';

describe('Maame cockpit', () => {
  it('builds a body-frame velocity with yaw rate, NED down positive', () => {
    const t = positionTarget({ kind: 'velocity', forward: 1, right: -0.5, up: 0.5, yawRateDeg: 30 });
    expect(t).toMatchObject({ coordinateFrame: 9, typeMask: MASK_VELOCITY, vx: 1, vy: -0.5, vz: -0.5 });
    expect(t.yawRate).toBeCloseTo(Math.PI / 6);
    expect(MASK_VELOCITY).toBe(0b0101_1100_0111); // pos + accel + yaw ignored, velocity + yaw rate used
  });

  it('caps speed in any direction, climb, and yaw rate', () => {
    const t = positionTarget({ kind: 'velocity', forward: 10, right: 10, up: 9, yawRateDeg: 500 });
    expect(Math.hypot(t.vx, t.vy)).toBeCloseTo(COCKPIT_LIMITS.speedMs);
    expect(t.vz).toBe(-COCKPIT_LIMITS.climbMs);
    expect(t.yawRate).toBeCloseTo((COCKPIT_LIMITS.yawRateDeg * Math.PI) / 180);
    expect(positionTarget({ kind: 'velocity', forward: NaN, right: Infinity, up: 0, yawRateDeg: 0 }).vx).toBe(0);
  });

  it('builds a capped body-frame offset (nudge)', () => {
    const t = positionTarget({ kind: 'offset', forward: 50, right: 2, up: -20 });
    expect(t).toMatchObject({ typeMask: MASK_OFFSET, x: COCKPIT_LIMITS.stepM, y: 2, z: COCKPIT_LIMITS.stepUpM });
  });

  it('turns relative to the heading, either way', () => {
    expect(turnCommand(90)).toEqual({ command: 115, params: [90, 45, 1, 1] });
    expect(turnCommand(-45).params).toEqual([45, 45, -1, 1]);
    expect(turnCommand(720).params[0]).toBe(180);
  });

  it('only moves an armed drone in GUIDED on the Maame link', () => {
    expect(cockpitRefusal({ maameLink: true, armed: true, customMode: 4 })).toBeNull();
    expect(cockpitRefusal({ maameLink: false, armed: true, customMode: 4 })).toMatch(/Maame/);
    expect(cockpitRefusal({ maameLink: true, armed: false, customMode: 4 })).toMatch(/not flying/);
    expect(cockpitRefusal({ maameLink: true, armed: true, customMode: 3 })).toMatch(/GUIDED/); // AUTO mission
  });
});
