import { describe, expect, it } from 'vitest';
import { clampThrottle, motorVibeReport, motorVibeSteps, propsLikelyOn } from './motor-vibe-test';

const v = (x: number, y = 3, z = 3, clip0 = 0) => ({ x, y, z, clip0, clip1: 0 });
const r = (motor: number, x: number, clip0 = 0) => ({ motor, peak: v(x, 3, 3, clip0), start: v(1) });

describe('Maame props-off motor vibration test', () => {
  it('runs the motors in test order', () => {
    const steps = motorVibeSteps([
      { Number: 1, TestOrder: 1 }, { Number: 2, TestOrder: 3 }, { Number: 3, TestOrder: 4 }, { Number: 4, TestOrder: 2 },
    ]);
    expect(steps.map((s) => s.motor)).toEqual([1, 4, 2, 3]);
    expect(steps.map((s) => s.testOrder)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the throttle between 5 and 30 %', () => {
    expect(clampThrottle(80)).toBe(30);
    expect(clampThrottle(0)).toBe(5);
    expect(clampThrottle(15.4)).toBe(15);
  });

  it('stops when the current says the props are on', () => {
    expect(propsLikelyOn(1.2)).toBe(false);
    expect(propsLikelyOn(8)).toBe(true);
  });

  it('is good when all motors are smooth and similar', () => {
    const rep = motorVibeReport([r(1, 8), r(2, 9), r(3, 7), r(4, 8)])!;
    expect(rep.level).toBe('good');
    expect(rep.rows.every((x) => !x.outlier)).toBe(true);
  });

  it('points at the motor that shakes more than the others', () => {
    const rep = motorVibeReport([r(1, 8), r(2, 9), r(3, 22), r(4, 8)])!;
    expect(rep.level).toBe('marginal');
    expect(rep.rows.find((x) => x.motor === 3)?.outlier).toBe(true);
    expect(rep.advice).toMatch(/Motor 3/);
  });

  it('ignores differences in tiny numbers', () => {
    expect(motorVibeReport([r(1, 2), r(2, 2), r(3, 6), r(4, 2)])!.level).toBe('good');
  });

  it('is bad on clipping or > 60 m/s^2, and skips motors that never ran', () => {
    expect(motorVibeReport([r(1, 8), r(2, 70), r(3, 8), r(4, 8)])!.level).toBe('bad');
    const clip = motorVibeReport([r(1, 8, 3), r(2, 8), { motor: 3, peak: null, start: null }])!;
    expect(clip.level).toBe('bad');
    expect(clip.rows).toHaveLength(2);
    expect(clip.advice).toMatch(/clipped/);
    expect(motorVibeReport([{ motor: 1, peak: null, start: null }])).toBeNull();
  });
});
