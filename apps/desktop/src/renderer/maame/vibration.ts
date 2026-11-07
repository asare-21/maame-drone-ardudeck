/**
 * Maame vibration verdict from the FC's VIBRATION telemetry (m/s^2 per axis and
 * accelerometer clipping counts), using ArduPilot's guide lines: under 30 is good,
 * 30-60 is marginal (position hold may suffer), over 60 or any new clipping is bad
 * (fix the mounting / props before tuning). The notch filter itself is set up and
 * applied by upstream's Motor vibration filter (Setup > Quick Setup).
 */
export interface Vibe { x: number; y: number; z: number; clip0: number; clip1: number; clip2?: number }

export type VibeLevel = 'good' | 'marginal' | 'bad';

export interface VibeVerdict {
  level: VibeLevel;
  worst: number;
  axis: 'x' | 'y' | 'z';
  /** Clipping events since the reference (e.g. take-off). */
  newClips: number;
  advice: string;
}

export const VIBE_MARGINAL = 30;
export const VIBE_BAD = 60;

const clips = (v: Vibe) => v.clip0 + v.clip1 + (v.clip2 ?? 0);

/** Verdict for a reading (or a per-axis peak), with clipping counted from `since`. */
export function vibrationVerdict(v: Vibe, since?: Vibe | null): VibeVerdict {
  const axis = (['x', 'y', 'z'] as const).reduce((a, b) => (v[b] > v[a] ? b : a));
  const worst = v[axis];
  const newClips = Math.max(0, clips(v) - (since ? clips(since) : 0));
  const level: VibeLevel = worst > VIBE_BAD || newClips > 0 ? 'bad' : worst > VIBE_MARGINAL ? 'marginal' : 'good';
  const advice =
    level === 'good'
      ? 'Vibration is fine. Next: Setup > Quick Setup > Motor vibration filter, with this hover\'s log, to set the notch.'
      : newClips > 0
        ? `The accelerometers clipped ${newClips} time(s): fix the mounting first (dampers, tight props, straight motor shafts), then tune.`
        : level === 'bad'
          ? `Vibration ${worst.toFixed(0)} m/s² on ${axis.toUpperCase()}: too high to tune around - check dampers, props and motors first.`
          : `Vibration ${worst.toFixed(0)} m/s² on ${axis.toUpperCase()} is marginal: the notch filter (Setup > Quick Setup > Motor vibration filter) and damping should bring it under ${VIBE_MARGINAL}.`;
  return { level, worst, axis, newClips, advice };
}

/** Per-axis maximum of two readings (to keep a flight's peak). */
export function peakVibe(a: Vibe | null, b: Vibe): Vibe {
  if (!a) return b;
  return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z), clip0: b.clip0, clip1: b.clip1, clip2: b.clip2 };
}
