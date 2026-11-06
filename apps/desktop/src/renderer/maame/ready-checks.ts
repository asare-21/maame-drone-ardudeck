/**
 * Maame ready-to-fly checklist: everything that must be true before an
 * autonomous (no RC) launch. Pure, so it is unit-tested; MaameFlightCard feeds it
 * from the stores.
 */

export const MAAME_CELLS = 6;
/** Li-ion resting voltage per cell below which a mission should not start. */
export const MIN_LAUNCH_CELL_V = 3.6;
export const MIN_SATS = 8;
/** ArduPilot repeats pre-arm failures every 30 s while disarmed. */
export const PREARM_WINDOW_MS = 35_000;
/** Pi heartbeat older than this counts as offline. */
export const PI_TIMEOUT_MS = 3000;
export const MAV_STATE_ACTIVE = 4;

export interface ReadyInput {
  nowMs: number;
  connected: boolean;
  baselineFailures: number;
  gpsFixType: number;
  gpsSats: number;
  batteryVoltage: number;
  piLastSeenMs: number | null;
  piStatus: number | null;
  /** FC STATUSTEXTs with their timestamps. */
  messages: Array<{ text: string; timestamp: number }>;
  missionItems: number;
  uploadedItems: number | null;
}

export interface ReadyCheck {
  id: 'link' | 'baseline' | 'gps' | 'battery' | 'pi' | 'prearm' | 'mission';
  label: string;
  ok: boolean;
  detail: string;
}

/** Recent FC pre-arm failures, minus the Pi gate (the launch flow opens it). */
export function blockingPrearm(messages: ReadyInput['messages'], nowMs: number): string[] {
  const texts = messages
    .filter((m) => nowMs - m.timestamp < PREARM_WINDOW_MS && m.text.startsWith('PreArm:'))
    .map((m) => m.text.replace(/^PreArm:\s*/, ''))
    .filter((t) => !/Pi companion not ready/i.test(t));
  return [...new Set(texts)];
}

export function readyChecks(i: ReadyInput): ReadyCheck[] {
  const cellV = i.batteryVoltage / MAAME_CELLS;
  const piOnline = i.piLastSeenMs !== null && i.nowMs - i.piLastSeenMs < PI_TIMEOUT_MS;
  const prearm = blockingPrearm(i.messages, i.nowMs);
  return [
    { id: 'link', label: 'Link to drone', ok: i.connected, detail: i.connected ? 'connected' : 'not connected' },
    {
      id: 'baseline',
      label: 'Safety baseline',
      ok: i.baselineFailures === 0,
      detail: i.baselineFailures === 0 ? 'all settings safe' : `${i.baselineFailures} unsafe setting(s)`,
    },
    {
      id: 'gps',
      label: 'GPS',
      ok: i.gpsFixType >= 3 && i.gpsSats >= MIN_SATS,
      detail: `${i.gpsFixType >= 3 ? '3D fix' : 'no 3D fix'}, ${i.gpsSats} satellites (need ${MIN_SATS})`,
    },
    {
      id: 'battery',
      label: 'Battery',
      ok: cellV >= MIN_LAUNCH_CELL_V,
      detail: `${i.batteryVoltage.toFixed(2)} V (${cellV.toFixed(2)} V/cell, need ${MIN_LAUNCH_CELL_V})`,
    },
    {
      id: 'pi',
      label: 'Pi companion',
      ok: piOnline,
      detail: !piOnline ? 'no heartbeat' : i.piStatus === MAV_STATE_ACTIVE ? 'ACTIVE (gate open)' : 'online, standby',
    },
    { id: 'prearm', label: 'FC pre-arm', ok: prearm.length === 0, detail: prearm.length ? prearm.join('; ') : 'no failures' },
    {
      id: 'mission',
      label: 'Mission on drone',
      ok: i.missionItems > 0 && i.uploadedItems === i.missionItems,
      detail:
        i.missionItems === 0
          ? 'no mission planned'
          : i.uploadedItems === i.missionItems
            ? `${i.missionItems} items uploaded`
            : 'planned but not uploaded',
    },
  ];
}
