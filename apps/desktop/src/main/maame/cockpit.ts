/**
 * Maame remote cockpit: manual flying from ArduDeck with no RC, through
 * GUIDED-mode targets relative to the drone's heading. Velocity targets must be
 * resent (~10 Hz); ArduCopter stops by itself ~3 s after the last one, so a
 * released stick, a lost window or a lost link always ends in a hold.
 * Pure: builds the MAVLink payload fields; ipc-handlers sends them.
 */

/** Hard limits, whatever the UI asks for. */
export const COCKPIT_LIMITS = {
  speedMs: 3,      // horizontal
  climbMs: 1,      // vertical
  yawRateDeg: 45,
  stepM: 10,       // one nudge, horizontal
  stepUpM: 5,      // one nudge, vertical
  turnDeg: 180,
} as const;

export type CockpitMove =
  /** Body-frame velocity: forward/right/up m/s, yaw rate deg/s (+ = clockwise). */
  | { kind: 'velocity'; forward: number; right: number; up: number; yawRateDeg: number }
  /** Body-frame offset from where it is now: forward/right/up metres. */
  | { kind: 'offset'; forward: number; right: number; up: number }
  /** Turn by degrees (+ = clockwise), relative to the current heading. */
  | { kind: 'turn'; degrees: number };

const MAV_FRAME_BODY_OFFSET_NED = 9;
// SET_POSITION_TARGET_LOCAL_NED type_mask bits: 1-4 ignore position, 8-32 ignore velocity,
// 64-256 ignore acceleration, 1024 ignore yaw, 2048 ignore yaw rate.
const IGNORE_POS = 0b111;
const IGNORE_VEL = 0b111000;
const IGNORE_ACC = 0b111000000;
const IGNORE_YAW = 1024;
const IGNORE_YAW_RATE = 2048;
export const MASK_VELOCITY = IGNORE_POS | IGNORE_ACC | IGNORE_YAW; // velocity + yaw rate
export const MASK_OFFSET = IGNORE_VEL | IGNORE_ACC | IGNORE_YAW | IGNORE_YAW_RATE;

const clamp = (v: number, lim: number) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

export interface PositionTargetFields {
  coordinateFrame: number;
  typeMask: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yawRate: number;
}

/** SET_POSITION_TARGET_LOCAL_NED fields for a velocity or offset move (NED: z and vz are down). */
export function positionTarget(m: Exclude<CockpitMove, { kind: 'turn' }>): PositionTargetFields {
  const L = COCKPIT_LIMITS;
  if (m.kind === 'velocity') {
    // keep the horizontal speed under the limit in any direction, not per axis
    let f = clamp(m.forward, L.speedMs);
    let r = clamp(m.right, L.speedMs);
    const h = Math.hypot(f, r);
    if (h > L.speedMs) { f *= L.speedMs / h; r *= L.speedMs / h; }
    return {
      coordinateFrame: MAV_FRAME_BODY_OFFSET_NED, typeMask: MASK_VELOCITY,
      x: 0, y: 0, z: 0, vx: f, vy: r, vz: -clamp(m.up, L.climbMs),
      yawRate: (clamp(m.yawRateDeg, L.yawRateDeg) * Math.PI) / 180,
    };
  }
  return {
    coordinateFrame: MAV_FRAME_BODY_OFFSET_NED, typeMask: MASK_OFFSET,
    x: clamp(m.forward, L.stepM), y: clamp(m.right, L.stepM), z: -clamp(m.up, L.stepUpM),
    vx: 0, vy: 0, vz: 0, yawRate: 0,
  };
}

/** MAV_CMD_CONDITION_YAW params for a relative turn. */
export function turnCommand(degrees: number): { command: 115; params: [number, number, number, number] } {
  const d = clamp(degrees, COCKPIT_LIMITS.turnDeg);
  return { command: 115, params: [Math.abs(d), COCKPIT_LIMITS.yawRateDeg, d >= 0 ? 1 : -1, 1] };
}

/** Why the move must not be sent, or null: only on the Maame link, armed and in GUIDED. */
export function cockpitRefusal(s: { maameLink: boolean; armed: boolean | null; customMode: number | null }): string | null {
  if (!s.maameLink) return 'use Connect to Maame';
  if (!s.armed) return 'not flying';
  if (s.customMode !== 4) return 'take control first (GUIDED): the cockpit never moves a drone in another mode';
  return null;
}
