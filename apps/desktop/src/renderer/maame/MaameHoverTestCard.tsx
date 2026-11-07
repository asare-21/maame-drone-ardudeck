/**
 * Maame hover test, in the Pre-flight panel: take off to 0.5 or 1 m, hover
 * 5-10 s and land in place - the first real flight of a no-RC drone. Same gates
 * as the launch card (ready checks, Pi ready); it replaces the mission on the FC.
 */
import { useEffect, useState } from 'react';
import { useMessagesStore } from '../stores/messages-store';
import { useMissionStore } from '../stores/mission-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { freshPiHealth, useMaameCompanion } from './companion-store';
import { useMaameBaselineResults } from './MaameSafetyCard';
import { startUploadedMission, useFcParam } from './MaameFlightCard';
import { HOVER_HEIGHTS_M, HOVER_HOLD_S, hoverTestMission, hoverTestProblem } from './hover-test';
import { MAV_STATE_ACTIVE, readyChecks } from './ready-checks';
import { useMaameLinkProblem, useMaameLinkUp } from './maame-profile';

const LAND_SPEED_MS = 0.5; // ArduCopter LAND_SPEED default (50 cm/s)

export function MaameHoverTestCard() {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const [heightM, setHeightM] = useState<number>(1);
  const [holdS, setHoldS] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = useMaameLinkUp();
  const linkProblem = useMaameLinkProblem();
  const gps = useTelemetryStore((s) => s.gps);
  const battery = useTelemetryStore((s) => s.battery);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const messages = useMessagesStore((s) => s.messages);
  const pi = useMaameCompanion();
  const baseline = useMaameBaselineResults();
  const fcParam = useFcParam();

  // The test brings its own mission, so the planned-mission checks do not apply.
  const checks = readyChecks({
    nowMs, connected, linkProblem,
    baselineFailures: baseline.filter((r) => !r.ok).length,
    gpsFixType: gps?.fixType ?? 0, gpsSats: gps?.satellites ?? 0,
    batteryVoltage: battery?.voltage ?? 0, armVoltage: fcParam('BATT_ARM_VOLT'),
    piLastSeenMs: pi.lastSeenMs, piStatus: pi.status, ...freshPiHealth(pi, nowMs),
    messages, missionItems: 1, uploadedItems: 1, missionCheck: null,
  }).filter((c) => c.id !== 'mission' && c.id !== 'missionSafe');
  const failing = checks.filter((c) => !c.ok);
  const piActive = pi.status === MAV_STATE_ACTIVE && !failing.some((c) => c.id === 'pi');
  const plan = { heightM, holdS, lat: gps?.lat ?? 0, lon: gps?.lon ?? 0 };
  const problem = hoverTestProblem(plan);
  // Airborne time seen in SITL: 1 m/8 s -> 13.6 s, 0.5 m/5 s -> 11.4 s (takeoff always climbs to ~1 m first).
  const totalS = Math.round(holdS + 1 / LAND_SPEED_MS + 3.5 + (1 - heightM) * 2);
  const canFly = connected && !armed && !busy && failing.length === 0 && piActive && !problem;

  const fly = async () => {
    const go = window.confirm(
      `Hover test: take off, hover at ${heightM} m for ${holdS} s, land on the spot (about ${totalS} s in the air).\n\n` +
        'This replaces the mission on the drone. Props on, area clear, people at least 10 m back.\n' +
        'Pause / Land / Hold-to-kill appear in the header once armed.',
    );
    if (!go) return;
    setBusy(true);
    setError(null);
    try {
      const up = await window.electronAPI.uploadMission(hoverTestMission(plan));
      if (!up?.success) throw new Error(up?.error || 'upload failed');
      // The FC now holds the hover test, not the planned mission: make the launch card upload again.
      useMissionStore.setState({ lastUploadedAt: null });
      if (!(await startUploadedMission())) throw new Error('could not switch to AUTO and arm (see Messages)');
    } catch (e) {
      setError(`Hover test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const choice = (on: boolean) => `btn px-2 py-1 text-xs ${on ? 'btn-primary' : 'btn-secondary'}`;

  return (
    <div className="rounded-lg border border-gray-700/50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Maame hover test</span>
        <span className="text-xs text-gray-400">about {totalS} s in the air</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">Take off, hover in place, land on the spot. Flown by the FC as a mission.</p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="w-14">Height</span>
        {HOVER_HEIGHTS_M.map((h) => (
          <button key={h} className={choice(heightM === h)} disabled={busy || armed} onClick={() => setHeightM(h)}>
            {h} m
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label htmlFor="maame-hover-hold" className="w-14">Hover</label>
        <input
          id="maame-hover-hold"
          type="range"
          min={HOVER_HOLD_S.min}
          max={HOVER_HOLD_S.max}
          step={1}
          value={holdS}
          disabled={busy || armed}
          onChange={(e) => setHoldS(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-8 text-right">{holdS} s</span>
      </div>

      {(failing.length > 0 || !piActive || problem) && !armed && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-400">
          {failing.map((c) => (
            <li key={c.id}>✗ {c.label}: {c.detail}</li>
          ))}
          {!failing.some((c) => c.id === 'pi') && !piActive && <li>✗ Pi not ready: press "2. Pi ready" above</li>}
          {problem && <li>✗ {problem}</li>}
        </ul>
      )}
      {heightM < 1 && (
        <p className="mt-1 text-xs text-amber-400">
          ArduPilot takes off to at least 1 m, then settles to 0.5 m for the hover. 0.5 m is in ground effect: expect some bobbing.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

      <button className="btn btn-primary mt-2 w-full" disabled={!canFly} onClick={() => void fly()}>
        {armed ? 'Flying (use the header controls)' : busy ? 'Starting…' : `Hover test: ${heightM} m for ${holdS} s`}
      </button>
    </div>
  );
}
