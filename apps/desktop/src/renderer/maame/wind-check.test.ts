import { describe, expect, it } from 'vitest';
import type { WindField } from '../../shared/wind-types';
import { windAtLaunch } from './wind-check';

// 2x2 grid around home; u/v uniform per frame so the sample is exact anywhere inside
const grid = (u: number, v: number) => ({ u: [u, u, u, u], v: [v, v, v, v] });
const field: WindField = {
  width: 2, height: 2, bbox: { south: 51.6, north: 51.7, west: -0.1, east: 0 }, altitudeM: 80,
  frames: [{ time: '2026-11-08T09:00', ...grid(3, 4) }, { time: '2026-11-08T10:00', ...grid(6, 8) }],
  speedMax: 10, modelLabel: 'test', fetchedAt: 0,
};

describe('Maame wind check', () => {
  it('uses the forecast hour nearest now at the launch point', () => {
    expect(windAtLaunch(field, 51.65, -0.05, Date.parse('2026-11-08T09:20Z'))).toBe(5);
    expect(windAtLaunch(field, 51.65, -0.05, Date.parse('2026-11-08T09:40Z'))).toBe(10);
  });
  it('has no answer outside the field or without one', () => {
    expect(windAtLaunch(field, 52, 1, Date.now())).toBeNull();
    expect(windAtLaunch(null, 51.65, -0.05, Date.now())).toBeNull();
  });
});
