/**
 * Live state of the Maame Pi companion (MAVLink component 191): last heartbeat,
 * its MAV_STATE (ACTIVE = arming gate open) and its last status message.
 */
import { create } from 'zustand';

interface CompanionState {
  lastSeenMs: number | null;
  status: number | null;
  lastText: string | null;
}

export const useMaameCompanion = create<CompanionState>(() => ({ lastSeenMs: null, status: null, lastText: null }));

let started = false;

/** Subscribe once to the Pi heartbeat / STATUSTEXT forwarded by the main process. */
export function startCompanionWatch(): void {
  if (started || typeof window === 'undefined' || !window.electronAPI) return;
  started = true;
  window.electronAPI.onCompanionHeartbeat((d) =>
    useMaameCompanion.setState({ lastSeenMs: d.lastSeen, status: d.systemStatus ?? null }),
  );
  window.electronAPI.onCompanionStatusText((d) => useMaameCompanion.setState({ lastText: d.text }));
}
