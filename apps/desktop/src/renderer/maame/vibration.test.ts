import { describe, expect, it } from 'vitest';
import { peakVibe, vibrationVerdict } from './vibration';

const v = (x: number, y: number, z: number, clip0 = 0, clip1 = 0) => ({ x, y, z, clip0, clip1 });

describe('Maame vibration verdict', () => {
  it('grades the worst axis against 30 / 60 m/s^2', () => {
    expect(vibrationVerdict(v(12, 15, 22))).toMatchObject({ level: 'good', axis: 'z', worst: 22 });
    expect(vibrationVerdict(v(35, 12, 20))).toMatchObject({ level: 'marginal', axis: 'x' });
    expect(vibrationVerdict(v(10, 70, 20))).toMatchObject({ level: 'bad', axis: 'y' });
  });

  it('counts clipping since take-off, and any new clipping is bad', () => {
    const before = v(5, 5, 5, 4, 0);
    expect(vibrationVerdict(v(10, 10, 10, 4, 0), before)).toMatchObject({ level: 'good', newClips: 0 });
    const r = vibrationVerdict(v(10, 10, 10, 6, 1), before);
    expect(r).toMatchObject({ level: 'bad', newClips: 3 });
    expect(r.advice).toMatch(/clipped 3/);
  });

  it('keeps the per-axis peak of a flight', () => {
    expect(peakVibe(peakVibe(null, v(10, 40, 5)), v(30, 20, 8, 2))).toEqual({ x: 30, y: 40, z: 8, clip0: 2, clip1: 0, clip2: undefined });
  });
});
