/**
 * Live state of the Maame Pi companion (MAVLink component 191): last heartbeat,
 * its MAV_STATE (ACTIVE = arming gate open) and its last status message.
 */
import { create } from 'zustand';

interface CompanionState {
  lastSeenMs: number | null;
  status: number | null;
  lastText: string | null;
  /** Pi health from maame_status.py (PI_TEMP, PI_LOAD, PI_WIFI, PI_THROT, PI_ROUTER). */
  values: Record<string, number>;
  valuesAtMs: number | null;
}

export const useMaameCompanion = create<CompanionState>(() => ({ lastSeenMs: null, status: null, lastText: null, values: {}, valuesAtMs: null }));

let started = false;

/** Subscribe once to the Pi heartbeat / STATUSTEXT forwarded by the main process. */
export function startCompanionWatch(): void {
  if (started || typeof window === 'undefined' || !window.electronAPI) return;
  started = true;
  window.electronAPI.onCompanionHeartbeat((d) =>
    useMaameCompanion.setState({ lastSeenMs: d.lastSeen, status: d.systemStatus ?? null }),
  );
  window.electronAPI.onCompanionStatusText((d) => useMaameCompanion.setState({ lastText: d.text }));
  window.electronAPI.onMaameCompanionValue((d) =>
    useMaameCompanion.setState((s) => ({ values: { ...s.values, [d.name]: d.value }, valuesAtMs: Date.now() })),
  );
}

/** Pi health values when fresh (< 10 s old), else null: an old Pi image sends none. */
export function freshPiHealth(s: { values: Record<string, number>; valuesAtMs: number | null }, nowMs: number) {
  const fresh = s.valuesAtMs !== null && nowMs - s.valuesAtMs < 10_000;
  return {
    piTempC: fresh ? (s.values.PI_TEMP ?? null) : null,
    piThrottled: fresh ? (s.values.PI_THROT ?? null) : null,
  };
}
