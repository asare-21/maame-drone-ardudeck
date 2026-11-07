/**
 * Maame cockpit input: on-screen sticks and keyboard to a body-frame velocity move.
 * Pure, so it is tested; MaameCockpitPanel sends the result ~10x a second while a
 * stick or key is held, and a zero move when everything is released.
 * The main process clamps again (main/maame/cockpit.ts COCKPIT_LIMITS).
 */
export interface Stick { x: number; y: number } // -1..1, y up = +1

export interface VelocityMove { kind: 'velocity'; forward: number; right: number; up: number; yawRateDeg: number }

const CLIMB_MS = 1;
const YAW_DEG_S = 45;
const DEAD = 0.08; // ignore tiny drags around the centre

const shape = (v: number) => {
  const c = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  return Math.abs(c) < DEAD ? 0 : c;
};

/** Left stick: up/down = climb, left/right = turn. Right stick: up/down = forward, left/right = sideways. */
export function stickVelocity(left: Stick, right: Stick, maxSpeedMs: number): VelocityMove {
  return {
    kind: 'velocity',
    forward: shape(right.y) * maxSpeedMs,
    right: shape(right.x) * maxSpeedMs,
    up: shape(left.y) * CLIMB_MS,
    yawRateDeg: shape(left.x) * YAW_DEG_S,
  };
}

/** Keys that fly (KeyboardEvent.code). Plain keys only: Shift+P/A/R/L stay the emergency shortcuts. */
export const COCKPIT_KEYS: Record<string, string> = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  ArrowUp: 'climb', ArrowDown: 'descend', ArrowLeft: 'turn left', ArrowRight: 'turn right',
};

export function keysVelocity(held: ReadonlySet<string>, maxSpeedMs: number): VelocityMove {
  const axis = (pos: string, neg: string) => (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
  return stickVelocity(
    { x: axis('ArrowRight', 'ArrowLeft'), y: axis('ArrowUp', 'ArrowDown') },
    { x: axis('KeyD', 'KeyA'), y: axis('KeyW', 'KeyS') },
    maxSpeedMs,
  );
}

export const isStill = (v: VelocityMove) => !v.forward && !v.right && !v.up && !v.yawRateDeg;
