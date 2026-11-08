/**
 * Maame hover test, in the Pre-flight panel: take off to 0.5 or 1 m, hover
 * 5-10 s and land in place - the first real flight of a no-RC drone. Same gates
 * as the launch card (ready checks, Pi ready); it replaces the mission on the FC.
 */
import { useEffect, useRef, useState } from 'react';
import { useMessagesStore } from '../stores/messages-store';
import { useMissionStore } from '../stores/mission-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { freshPiHealth, useMaameCompanion } from './companion-store';
import { useMaameBaselineResults } from './MaameSafetyCard';
import { startUploadedMission, useFcParam } from './MaameFlightCard';
import { HOVER_HEIGHTS_M, HOVER_HOLD_S, averageHoverCurrent, hoverTestMission, hoverTestProblem, saveHoverCurrent } from './hover-test';
import { MAV_STATE_ACTIVE, readyChecks } from './ready-checks';
import { peakVibe, vibrationVerdict, type Vibe } from './vibration';
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
  // Vibration over the flight: clipping counted from take-off, per-axis peak kept for after landing.
  const vib = useTelemetryStore((s) => s.vibration) as Vibe | null | undefined;
  const [peak, setPeak] = useState<Vibe | null>(null);
  const takeoffVib = useRef<Vibe | null>(null);
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed && !wasArmed.current) { takeoffVib.current = vib ?? null; setPeak(null); }
    wasArmed.current = armed;
    if (armed && vib) setPeak((p) => peakVibe(p, vib));
  }, [armed, vib]);
  const vibVerdict = peak ? vibrationVerdict(peak, takeoffVib.current) : null;
  // Hover current: sampled while in the air; saved after landing for the battery estimates.
  const current = useTelemetryStore((s) => s.battery.current);
  const altM = useTelemetryStore((s) => s.position?.relativeAlt ?? 0);
  const ampSamples = useRef<number[]>([]);
  const [hoverAmps, setHoverAmps] = useState<number | null>(null);
  const ampArmed = useRef(false);
  useEffect(() => {
    if (armed && !ampArmed.current) ampSamples.current = []; // new flight
    ampArmed.current = armed;
    if (armed && altM > 0.5) ampSamples.current.push(current);
  }, [armed, current, altM]);
  useEffect(() => {
    if (armed) return;
    const avg = averageHoverCurrent(ampSamples.current);
    if (avg !== null) { saveHoverCurrent(avg); setHoverAmps(avg); ampSamples.current = []; }
  }, [armed]);
  const vibTone = { good: 'text-green-400', marginal: 'text-amber-400', bad: 'text-red-400' };

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
      {!armed && fcParam('INS_LOG_BAT_MASK') === 0 && (
        <p className="mt-1 text-xs text-gray-400">
          To tune from this hover, turn on vibration logging first: Setup &gt; Quick Setup &gt; Motor vibration filter (step 1).
        </p>
      )}
      {hoverAmps !== null && !armed && (
        <p className="mt-1 text-xs text-green-400">Hover current {hoverAmps.toFixed(1)} A: saved, battery estimates now use it.</p>
      )}
      {vibVerdict && (
        <div className="mt-2 text-xs">
          <span className="text-gray-400">Vibration {armed ? 'now' : 'this flight'}: </span>
          <span className={vibTone[vibVerdict.level]}>
            {armed && vib ? `${Math.max(vib.x, vib.y, vib.z).toFixed(0)} m/s², ` : ''}peak {vibVerdict.worst.toFixed(0)} m/s² ({vibVerdict.axis.toUpperCase()}) · {vibVerdict.level}
            {vibVerdict.newClips > 0 ? ` · ${vibVerdict.newClips} clipping` : ''}
          </span>
          {!armed && <p className={`mt-0.5 ${vibTone[vibVerdict.level]}`}>{vibVerdict.advice}</p>}
        </div>
      )}

      <button className="btn btn-primary mt-2 w-full" disabled={!canFly} onClick={() => void fly()}>
        {armed ? 'Flying (use the header controls)' : busy ? 'Starting…' : `Hover test: ${heightM} m for ${holdS} s`}
      </button>
    </div>
  );
}
