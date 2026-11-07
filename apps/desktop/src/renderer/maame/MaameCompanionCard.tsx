/**
 * Maame Pi companion, in the Pre-flight panel: gate state from its heartbeat and
 * health from maame_status.py (temperature, load, Wi-Fi, router, power).
 * Display only; "Pi ready" lives in the launch card.
 */
import { useEffect, useState } from 'react';
import { freshPiHealth, useMaameCompanion } from './companion-store';
import { MAV_STATE_ACTIVE, PI_MAX_TEMP_C, PI_TIMEOUT_MS } from './ready-checks';

type Tone = 'ok' | 'warn' | 'bad' | 'off';
const TONE: Record<Tone, string> = { ok: 'text-green-400', warn: 'text-amber-400', bad: 'text-red-400', off: 'text-gray-400' };

function power(throttled: number | null): [string, Tone] {
  if (throttled === null || throttled < 0) return ['unknown', 'off'];
  if (throttled & 0x1) return ['UNDER-VOLTAGE NOW: check the Pi 5 V supply', 'bad'];
  if (throttled & 0x4) return ['throttled now', 'warn'];
  if (throttled & 0x10000) return ['under-voltage happened since boot', 'warn'];
  return ['OK', 'ok'];
}

function wifi(dbm: number | undefined): [string, Tone] {
  if (dbm === undefined) return ['unknown', 'off'];
  if (dbm === 0) return ['not on a network (hotspot mode?)', 'off'];
  return [`${dbm.toFixed(0)} dBm`, dbm >= -65 ? 'ok' : dbm >= -75 ? 'warn' : 'bad'];
}

export function MaameCompanionCard() {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const pi = useMaameCompanion();
  const online = pi.lastSeenMs !== null && nowMs - pi.lastSeenMs < PI_TIMEOUT_MS;
  const { piTempC, piThrottled } = freshPiHealth(pi, nowMs);
  const v = pi.values;

  const rows: Array<[string, string, Tone]> = piTempC !== null
    ? [
        piTempC < 0
          ? ['CPU temperature', 'unknown', 'off']
          : ['CPU temperature', `${piTempC.toFixed(0)} °C`, piTempC >= PI_MAX_TEMP_C ? 'bad' : piTempC >= 70 ? 'warn' : 'ok'],
        ['Load (1 min)', (v.PI_LOAD ?? 0).toFixed(2), (v.PI_LOAD ?? 0) > 2 ? 'warn' : 'ok'],
        ['Wi-Fi signal', ...wifi(v.PI_WIFI)],
        ['MAVLink router', v.PI_ROUTER === 1 ? 'running' : 'NOT running', v.PI_ROUTER === 1 ? 'ok' : 'bad'],
        ['Power', ...power(piThrottled)],
      ]
    : [];

  const [state, stateTone]: [string, Tone] = !online
    ? ['offline', 'bad']
    : pi.status === MAV_STATE_ACTIVE
      ? ['ACTIVE (gate open)', 'ok']
      : ['standby', 'warn'];

  return (
    <div className="rounded-lg border border-gray-700/50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Maame Pi companion</span>
        <span className={TONE[stateTone]}>{state}</span>
      </div>
      {online && rows.length === 0 && (
        <p className="mt-1 text-xs text-gray-400">No health data from the Pi yet (needs the updated companion software with maame_status.py).</p>
      )}
      {rows.length > 0 && (
        <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-2 gap-y-0.5 text-xs">
          {rows.map(([k, val, tone]) => (
            <div key={k} className="contents">
              <dt className="text-gray-400">{k}</dt>
              <dd className={TONE[tone]}>{val}</dd>
            </div>
          ))}
        </dl>
      )}
      {pi.lastText && <p className="mt-1 text-xs text-gray-400">Last message: {pi.lastText}</p>}
    </div>
  );
}
