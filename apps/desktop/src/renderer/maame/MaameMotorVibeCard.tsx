/**
 * Maame props-off motor vibration test, in the Pre-flight panel. Spins each motor
 * alone (MAV_CMD_DO_MOTOR_TEST, so no GPS lock or arming needed) and compares the
 * vibration each one puts into the frame. Props must be off: it stops on its own
 * if the battery current says otherwise.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useParameterStore } from '../stores/parameter-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { buildGenericLayout, findFrameLayout, getFrameClassType } from '../components/mavlink-config/motor-test/motor-layout-utils';
import { peakVibe, type Vibe } from './vibration';
import {
  MOTOR_VIBE_STEP_S, MOTOR_VIBE_THROTTLE, PROPS_OFF_MAX_A, clampThrottle, motorVibeReport, motorVibeSteps,
  propsLikelyOn, type MotorVibeResult,
} from './motor-vibe-test';

const tone = { good: 'text-green-400', marginal: 'text-amber-400', bad: 'text-red-400' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MaameMotorVibeCard() {
  const connected = useConnectionStore((s) => s.connectionState.isConnected && s.connectionState.protocol === 'mavlink');
  const armed = useTelemetryStore((s) => s.flight.armed);
  const parameters = useParameterStore((s) => s.parameters);
  const steps = useMemo(() => {
    const frame = getFrameClassType((k) => parameters.get(k)?.value);
    const layout = (frame && findFrameLayout(frame.frameClass, frame.frameType)) ?? buildGenericLayout(4);
    return motorVibeSteps(layout.motors);
  }, [parameters]);

  const [propsOff, setPropsOff] = useState(false);
  const [throttle, setThrottle] = useState(MOTOR_VIBE_THROTTLE.default);
  const [running, setRunning] = useState<number | null>(null); // motor now spinning
  const [results, setResults] = useState<MotorVibeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<string | null>(null);
  const busy = useRef(false);

  const stopMotors = () => void window.electronAPI?.motorTestStop?.(steps.length).catch(() => { /* link gone */ });
  // Leaving the panel mid-test stops the motors.
  useEffect(() => () => { if (busy.current) { abort.current = 'Stopped: panel closed.'; stopMotors(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = (why: string) => { abort.current = why; stopMotors(); };

  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    abort.current = null;
    setError(null);
    setResults([]);
    const out: MotorVibeResult[] = [];
    try {
      for (const step of steps) {
        // ArduCopter reports itself armed while a motor test spins: wait for the last one to end.
        const until = Date.now() + 4000;
        while (useTelemetryStore.getState().flight.armed && Date.now() < until && !abort.current) await sleep(200);
        if (abort.current) break;
        if (useTelemetryStore.getState().flight.armed) { stop('Stopped: the drone is armed (not by this test).'); break; }
        const start = (useTelemetryStore.getState().vibration as Vibe | null) ?? null;
        setRunning(step.motor);
        const res = await window.electronAPI.motorTestStart({
          motor: step.testOrder, throttle: clampThrottle(throttle), duration: MOTOR_VIBE_STEP_S, throttleType: 'percent',
        });
        if (!res?.success) throw new Error(res?.error ?? 'The FC refused the motor test.');
        let peak: Vibe | null = null;
        const end = Date.now() + MOTOR_VIBE_STEP_S * 1000;
        while (Date.now() < end && !abort.current) {
          await sleep(200);
          const s = useTelemetryStore.getState();
          if (!useConnectionStore.getState().connectionState.isConnected) stop('Stopped: link lost.');
          else if (propsLikelyOn(s.battery.current))
            stop(`Stopped: ${s.battery.current.toFixed(1)} A drawn (limit ${PROPS_OFF_MAX_A} A with no props). Are the propellers still on?`);
          else if (s.vibration) peak = peakVibe(peak, s.vibration as Vibe);
        }
        out.push({ motor: step.motor, peak, start });
        setResults([...out]);
        if (abort.current) break;
        await sleep(1500); // let the motor stop and the FC's vibration filter settle
      }
    } catch (e) {
      stopMotors();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abort.current) setError(abort.current);
      setRunning(null);
      busy.current = false;
    }
  };

  const report = motorVibeReport(results);
  const canRun = connected && !armed && propsOff && running === null;

  return (
    <div className="rounded-lg border border-gray-700/50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Motor vibration test (props off)</span>
        <span className="text-xs text-gray-400">no GPS needed · about {steps.length * (MOTOR_VIBE_STEP_S + 1.5)} s</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">Spins each motor alone and compares how much it shakes the frame. Finds a bad bearing, bent shaft or loose bell.</p>

      <label className="mt-2 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={propsOff} disabled={running !== null} onChange={(e) => setPropsOff(e.target.checked)} />
        <span className="font-medium text-amber-400">Propellers are OFF, the drone is held down, nobody is near the motors</span>
      </label>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label htmlFor="maame-motor-vibe-throttle" className="w-14">Throttle</label>
        <input
          id="maame-motor-vibe-throttle" type="range" className="flex-1"
          min={MOTOR_VIBE_THROTTLE.min} max={MOTOR_VIBE_THROTTLE.max} step={1} value={throttle}
          disabled={running !== null} onChange={(e) => setThrottle(Number(e.target.value))}
        />
        <span className="w-8 text-right">{throttle} %</span>
      </div>

      {report && (
        <div className="mt-2 text-xs">
          <table className="w-full">
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.motor}>
                  <td className="w-16 text-gray-400">Motor {r.motor}</td>
                  <td className={r.outlier ? tone.marginal : tone[r.level]}>
                    {r.worst.toFixed(0)} m/s²{r.newClips ? ` · ${r.newClips} clipping` : ''}{r.outlier ? ' · stands out' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {running === null && <p className={`mt-1 ${tone[report.level]}`}>{report.advice}</p>}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {!connected && <p className="mt-1 text-xs text-gray-400">Connect to the drone first.</p>}
      {armed && running === null && <p className="mt-1 text-xs text-red-400">Disarm first: the motor test only runs disarmed.</p>}
      <p className="mt-1 text-xs text-gray-400">To spin one motor by hand: Setup &gt; Motor Test.</p>

      {running === null ? (
        <button className="btn btn-primary mt-2 w-full" disabled={!canRun} onClick={() => void run()}>
          Spin motors one by one at {throttle} %
        </button>
      ) : (
        <button className="btn mt-2 w-full bg-red-600 text-white hover:bg-red-500" onClick={() => stop('Stopped.')}>
          Stop motors (motor {running} spinning)
        </button>
      )}
    </div>
  );
}
