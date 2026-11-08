import { describe, expect, it } from 'vitest';
import { COCKPIT_KEYS, isStill, keysVelocity, stickVelocity } from './cockpit-input';

describe('Maame cockpit input', () => {
  it('maps the sticks: right = forward/sideways at the chosen speed, left = climb/turn', () => {
    expect(stickVelocity({ x: 0.5, y: -1 }, { x: -0.5, y: 1 }, 2)).toEqual({
      kind: 'velocity', forward: 2, right: -1, up: -1, yawRateDeg: 22.5,
    });
  });

  it('ignores a near-centre stick and out-of-range or broken values', () => {
    expect(isStill(stickVelocity({ x: 0.05, y: -0.05 }, { x: 0.02, y: 0.07 }, 3))).toBe(true);
    expect(stickVelocity({ x: 9, y: NaN }, { x: -9, y: 0 }, 1)).toMatchObject({ right: -1, up: 0, yawRateDeg: 45 });
  });

  it('flies from held keys; opposite keys cancel; nothing held = still', () => {
    expect(keysVelocity(new Set(['KeyW', 'KeyD', 'ArrowUp']), 1.5)).toMatchObject({ forward: 1.5, right: 1.5, up: 1 });
    expect(keysVelocity(new Set(['KeyW', 'KeyS']), 1.5).forward).toBe(0);
    expect(isStill(keysVelocity(new Set(), 3))).toBe(true);
  });

  it('never claims the emergency letters', () => {
    expect(Object.keys(COCKPIT_KEYS).some((k) => ['KeyP', 'KeyR', 'KeyL'].includes(k))).toBe(false);
  });
});
