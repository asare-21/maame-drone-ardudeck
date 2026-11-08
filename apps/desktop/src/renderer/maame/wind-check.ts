/**
 * Maame wind check: forecast wind at the launch point (upstream's Open-Meteo wind
 * field, sampled with its own bilinear sampler) against Maame's limit. No forecast
 * (e.g. offline on the Pi's hotspot) is reported, not treated as a failure.
 */
import type { WindField } from '../../shared/wind-types';
import { sampleWind } from '../components/map/wind/wind-field';

/** Sustained wind Maame may launch in (~3 kg 10" quad flying itself, no RC to fight a gust). */
export const MAAME_MAX_WIND_MS = 8;
/** Forecast level checked: missions fly ~20-120 m, where wind is stronger than at the ground. */
export const MAAME_WIND_LEVEL_M = 80;

/** Wind speed (m/s) at the point for the forecast hour nearest `nowMs`, or null outside / empty. */
export function windAtLaunch(field: WindField | null, lat: number, lon: number, nowMs: number): number | null {
  if (!field?.frames.length) return null;
  const frame = field.frames.reduce((best, f) =>
    Math.abs(Date.parse(`${f.time}Z`) - nowMs) < Math.abs(Date.parse(`${best.time}Z`) - nowMs) ? f : best);
  const uv = sampleWind(field, frame, lat, lon);
  return uv ? Math.hypot(uv.u, uv.v) : null;
}
