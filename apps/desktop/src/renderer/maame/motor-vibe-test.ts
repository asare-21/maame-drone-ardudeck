/**
 * Maame props-off motor vibration test: spin each motor alone with
 * MAV_CMD_DO_MOTOR_TEST (no arming, so no GPS / EKF / RC needed) and keep the
 * FC's VIBRATION peak per motor. A motor that shakes the frame much more than
 * the others points at a bad bearing, bent shaft or loose bell.
 */
import { vibrationVerdict, type Vibe, type VibeLevel } from './vibration';

export const MOTOR_VIBE_THROTTLE = { min: 5, max: 30, default: 15 };
export const MOTOR_VIBE_STEP_S = 3;
/** shortcut: fixed threshold, tune from the first real props-off reading. Bare motors draw well under this. */
export const PROPS_OFF_MAX_A = 5;
/** A motor stands out when its peak is this many times the median of the others ... */
export const OUTLIER_RATIO = 1.5;
/** ... and above this floor (small numbers on a still bench mean nothing). */
export const OUTLIER_FLOOR = 10;

export interface MotorVibeStep { motor: number; testOrder: number }
export interface MotorVibeResult { motor: number; peak: Vibe | null; start: Vibe | null }

export const clampThrottle = (pct: number) =>
  Math.round(Math.min(MOTOR_VIBE_THROTTLE.max, Math.max(MOTOR_VIBE_THROTTLE.min, pct)));

/** One step per motor, in the FC's test order (the order ArduPilot numbers them for DO_MOTOR_TEST). */
export function motorVibeSteps(motors: { Number: number; TestOrder: number }[]): MotorVibeStep[] {
  return motors
    .slice()
    .sort((a, b) => a.TestOrder - b.TestOrder)
    .map((m) => ({ motor: m.Number, testOrder: m.TestOrder }));
}

/** Battery current says the props are on (or something is stalled): stop now. */
export const propsLikelyOn = (currentA: number) => currentA > PROPS_OFF_MAX_A;

export interface MotorVibeRow { motor: number; worst: number; newClips: number; level: VibeLevel; outlier: boolean }
export interface MotorVibeReport { rows: MotorVibeRow[]; level: VibeLevel; advice: string }

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function motorVibeReport(results: MotorVibeResult[]): MotorVibeReport | null {
  const done = results.filter((r): r is MotorVibeResult & { peak: Vibe } => !!r.peak);
  if (done.length === 0) return null;
  const rows: MotorVibeRow[] = done.map((r) => {
    const v = vibrationVerdict(r.peak, r.start);
    return { motor: r.motor, worst: v.worst, newClips: v.newClips, level: v.level, outlier: false };
  });
  if (rows.length >= 3) {
    for (const row of rows) {
      const others = median(rows.filter((o) => o !== row).map((o) => o.worst));
      row.outlier = row.worst > OUTLIER_FLOOR && row.worst > others * OUTLIER_RATIO;
    }
  }
  const bad = rows.filter((r) => r.level === 'bad');
  const outliers = rows.filter((r) => r.outlier);
  const level: VibeLevel = bad.length ? 'bad' : outliers.length || rows.some((r) => r.level === 'marginal') ? 'marginal' : 'good';
  const list = (rs: MotorVibeRow[]) => rs.map((r) => r.motor).join(', ');
  const advice = bad.length
    ? `Motor ${list(bad)}: ${bad.some((r) => r.newClips) ? 'the accelerometers clipped' : 'vibration over 60 m/s²'} with no props. Check that motor's bearings, shaft and bell, its screws, and the FC dampers before flying.`
    : outliers.length
      ? `Motor ${list(outliers)} shakes the frame more than the others: spin it by hand for roughness, check the shaft is straight and the bell is tight.`
      : level === 'marginal'
        ? 'All motors are similar but above 30 m/s² with no props: check the FC soft-mounting and that the frame is screwed tight.'
        : 'All motors run smoothly with no props. Next: balance and fit the props, then the hover test.';
  return { rows, level, advice };
}
