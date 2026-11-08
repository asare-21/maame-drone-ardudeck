/**
 * Maame autonomous launch, in the Pre-flight panel: ready-to-fly checklist, then
 * three confirmed steps: upload mission -> Pi ready (opens the FC arming gate) ->
 * AUTO + arm (AUTO_OPTIONS lets ArduPilot arm and take off by itself).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMessagesStore } from '../stores/messages-store';
import { useMissionStore } from '../stores/mission-store';
import { useParameterStore } from '../stores/parameter-store';
import { fenceWarningForPoint } from '../utils/fence-check';
import { checkMission } from './mission-check';
import { loadHoverCurrent } from './hover-test';
import { MAAME_WIND_LEVEL_M, windAtLaunch } from './wind-check';
import type { WindField } from '../../shared/wind-types';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { freshPiHealth, useMaameCompanion } from './companion-store';
import { useMaameBaselineResults } from './MaameSafetyCard';
import { MAV_STATE_ACTIVE, readyChecks } from './ready-checks';
import { useMaameLinkProblem, useMaameLinkUp } from './maame-profile';

export const COPTER_MODE = { STABILIZE: 0, AUTO: 3, RTL: 6, LAND: 9, BRAKE: 17 } as const;

/**
 * Start the mission already on the FC: re-enter AUTO so it starts from the top
 * (entering AUTO starts the mission once; setting AUTO while in AUTO does nothing,
 * leaving the drone to arm, sit and auto-disarm), then arm. STABILIZE is always
 * allowed while disarmed; AUTO_OPTIONS lets ArduPilot arm and take off by itself.
 */
export async function startUploadedMission(): Promise<boolean> {
  if (!(await window.electronAPI.mavlinkSetMode(COPTER_MODE.STABILIZE))) return false;
  if (!(await window.electronAPI.mavlinkSetMode(COPTER_MODE.AUTO))) return false;
  return window.electronAPI.mavlinkArmDisarm(true, false);
}

/** FC parameter as the FC holds it (not an unsaved local edit), null when not loaded. */
export function useFcParam(): (name: string) => number | null {
  const parameters = useParameterStore((s) => s.parameters);
  return useMemo(
    () => (name: string) => {
      const p = parameters.get(name);
      if (!p) return null;
      return p.isModified ? (p.originalValue ?? p.value) : p.value;
    },
    [parameters],
  );
}

export function MaameFlightCard() {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const connected = useMaameLinkUp();
  const linkProblem = useMaameLinkProblem();
  const maameLinks = useConnectionStore((s) => s.connectionState.maameLinks);
  const radio = useTelemetryStore((s) => s.radioStatus);
  const sikLink = maameLinks?.find((l) => l.name === 'SiK');
  const sik = sikLink ? { alive: sikLink.alive && !!radio, rssi: radio?.rssi ?? 0, noise: radio?.noise ?? 0, remRssi: radio?.remRssi ?? 0, remNoise: radio?.remNoise ?? 0 } : null;
  const gps = useTelemetryStore((s) => s.gps);
  const battery = useTelemetryStore((s) => s.battery);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const messages = useMessagesStore((s) => s.messages);
  const missionItems = useMissionStore((s) => s.missionItems);
  const uploadedAt = useMissionStore((s) => s.lastUploadedAt);
  const uploadedCount = useMissionStore((s) => s.lastUploadedItemCount);
  const uploadMission = useMissionStore((s) => s.uploadMission);
  const pi = useMaameCompanion();
  const baseline = useMaameBaselineResults();
  const fcParam = useFcParam();
  const homePosition = useMissionStore((s) => s.homePosition);
  const home = homePosition ?? (gps?.lat ? { lat: gps.lat, lon: gps.lon } : null);
  // Forecast wind at home (80 m), refetched at most every 15 min; offline -> null (reported, not blocking).
  const [wind, setWind] = useState<{ field: WindField | null; at: number } | null>(null);
  const homeKey = home ? `${home.lat.toFixed(2)},${home.lon.toFixed(2)}` : null;
  useEffect(() => {
    if (!home || (wind && Date.now() - wind.at < 15 * 60_000)) return;
    const d = 0.05;
    void window.electronAPI
      .getWindField({ bbox: { south: home.lat - d, north: home.lat + d, west: home.lon - d, east: home.lon + d }, altitudeM: MAAME_WIND_LEVEL_M })
      .then((field) => setWind({ field, at: Date.now() }), () => setWind({ field: null, at: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per home cell, not per render
  }, [homeKey, nowMs]);
  const windMs = !home || !wind ? undefined : windAtLaunch(wind.field, home.lat, home.lon, nowMs);
  const missionCheck = missionItems.length
    ? checkMission({ items: missionItems, home, param: fcParam, outsideFence: fenceWarningForPoint, hoverCurrentA: loadHoverCurrent() })
    : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checks = readyChecks({
    nowMs,
    connected,
    linkProblem,
    sik,
    windMs,
    baselineFailures: baseline.filter((r) => !r.ok).length,
    gpsFixType: gps?.fixType ?? 0,
    gpsSats: gps?.satellites ?? 0,
    batteryVoltage: battery?.voltage ?? 0,
    armVoltage: fcParam('BATT_ARM_VOLT'),
    piLastSeenMs: pi.lastSeenMs,
    piStatus: pi.status, ...freshPiHealth(pi, nowMs),
    messages,
    missionItems: missionItems.length,
    uploadedItems: uploadedAt === null ? null : uploadedCount,
    missionCheck,
  });
  const ok = (id: string) => checks.find((c) => c.id === id)!.ok;
  const allOk = checks.every((c) => c.ok);
  const piActive = pi.status === MAV_STATE_ACTIVE && ok('pi');

  const run = async (label: string, fn: () => Promise<boolean>) => {
    setBusy(label);
    setError(null);
    try {
      if (!(await fn())) setError(`${label} failed`);
    } catch (e) {
      setError(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const launch = () =>
    run('Launch', async () => {
      const go = window.confirm(
        'Start the mission?\n\nThe drone will arm, take off and fly the mission on its own (no RC).\n' +
          'Props on, area clear, people back. Emergency controls appear in the header once armed.',
      );
      if (!go) return true;
      return startUploadedMission();
    });

  return (
    <div className={`rounded-lg border p-3 text-sm ${allOk ? 'border-green-500/50' : 'border-gray-700/50'}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Maame autonomous launch</span>
        <span className={allOk ? 'text-green-400' : 'text-gray-400'}>
          {checks.filter((c) => c.ok).length}/{checks.length} ready
        </span>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span className={c.ok ? 'text-green-400' : 'text-red-400'} aria-hidden>
              {c.ok ? '✓' : '✗'}
            </span>
            <span className="w-28 shrink-0">{c.label}</span>
            <span className="text-gray-400">{c.detail}</span>
          </li>
        ))}
      </ul>
      {pi.lastText && <p className="mt-1 text-xs text-gray-400">Pi: {pi.lastText}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

      <div className="mt-2 grid gap-2">
        <button
          className="btn btn-secondary w-full"
          disabled={!connected || armed || busy !== null || missionItems.length === 0}
          onClick={() => void run('Upload mission', uploadMission)}
        >
          1. {ok('mission') ? 'Mission uploaded (upload again)' : 'Upload mission'}
        </button>
        <button
          className="btn btn-secondary w-full"
          disabled={!ok('pi') || armed || busy !== null}
          onClick={() => void run(piActive ? 'Pi standby' : 'Pi ready', () => window.electronAPI.maameCompanionSetReady(!piActive))}
        >
          2. {piActive ? 'Pi ready ✓ (set standby)' : 'Pi ready'}
        </button>
        <button
          className="btn btn-primary w-full"
          disabled={!allOk || !piActive || armed || busy !== null}
          onClick={() => void launch()}
        >
          3. {armed ? 'Armed, flying' : 'Arm and start mission'}
        </button>
      </div>
    </div>
  );
}
