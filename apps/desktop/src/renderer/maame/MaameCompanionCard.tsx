/**
 * Maame Pi companion, in the Pre-flight panel: gate state from its heartbeat and
 * health from maame_status.py (temperature, load, Wi-Fi, router, power).
 * Display only; "Pi ready" lives in the launch card.
 */
import { useEffect, useState } from 'react';
import { MAAME_GATE_VERSION } from '../../shared/maame-gate';
import { useConnectionStore } from '../stores/connection-store';
import { useParameterStore } from '../stores/parameter-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useFcParam } from './MaameFlightCard';
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
      <GateRow />
    </div>
  );
}

/** The arming gate Lua on the FC: running version (PIG_VER) and install/update. */
function GateRow() {
  const connected = useConnectionStore((s) => s.connectionState.isConnected);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const running = useFcParam()('PIG_VER');
  const [phase, setPhase] = useState<string | null>(null);
  const [result, setResult] = useState<[string, Tone] | null>(null);

  useEffect(() => window.electronAPI.onMaameGateProgress((p) => setPhase(p.phase)), []);

  const [label, tone]: [string, Tone] =
    running === null
      ? ['not detected (older gate, not running, or parameters not loaded)', 'warn']
      : running >= MAAME_GATE_VERSION
        ? [`v${running} running (latest)`, 'ok']
        : [`v${running} running, v${MAAME_GATE_VERSION} available`, 'warn'];

  const install = async () => {
    const go = window.confirm(
      `Install arming gate v${MAAME_GATE_VERSION} on the flight controller?\n\n` +
        'It uploads the script and REBOOTS the flight controller (about a minute). Disarmed, props off.',
    );
    if (!go) return;
    setResult(null);
    setPhase('checking');
    const r = await window.electronAPI.maameInstallGate();
    setPhase(null);
    if (r.status === 'installed') {
      setResult([`v${MAAME_GATE_VERSION} installed and running`, 'ok']);
      void useParameterStore.getState().fetchParameters({ force: true });
    } else if (r.status === 'manual') {
      setResult([`could not upload (${r.reason}): copy it to ${r.targetPath} on the SD card`, 'bad']);
    } else {
      setResult([r.message, 'bad']);
    }
  };

  return (
    <div className="mt-2 border-t border-gray-700/50 pt-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-400">Arming gate script</span>
        <span className={TONE[tone]}>{label}</span>
      </div>
      {result && <p className={`mt-1 ${TONE[result[1]]}`}>{result[0]}</p>}
      <button
        className="btn btn-secondary mt-1 w-full px-2 py-1 text-xs"
        disabled={!connected || armed || phase !== null}
        onClick={() => void install()}
      >
        {phase ? `Installing: ${phase}…` : running !== null && running >= MAAME_GATE_VERSION ? `Reinstall gate v${MAAME_GATE_VERSION}` : `Install gate v${MAAME_GATE_VERSION}`}
      </button>
    </div>
  );
}
