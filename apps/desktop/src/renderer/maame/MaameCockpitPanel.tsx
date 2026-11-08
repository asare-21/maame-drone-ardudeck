/**
 * Maame cockpit: fly Maame by hand from ArduDeck, no RC or gamepad. Everything is a
 * GUIDED target relative to the heading (main/maame/cockpit.ts), so letting go always
 * means "hold here": sticks and keys send ~10x a second while held and a stop on
 * release; ArduCopter also stops on its own ~3 s after the last target.
 * Pause / RTL / Land / kill stay in the header bar as for every Maame flight.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTelemetryStore } from '../stores/telemetry-store';
import { COPTER_MODE } from './MaameFlightCard';
import { useMaameCompanion } from './companion-store';
import { COCKPIT_KEYS, isStill, keysVelocity, stickVelocity, type Stick } from './cockpit-input';
import { useMaameLinkProblem, useMaameLinkUp } from './maame-profile';
import { MAV_STATE_ACTIVE } from './ready-checks';

const GUIDED = 4;
const ZERO: Stick = { x: 0, y: 0 };
const btn = 'btn btn-secondary px-2 py-2 text-xs disabled:opacity-40';

function Pad({ label, value, onChange, disabled }: { label: string; value: Stick; onChange: (s: Stick) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const at = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = 1 - ((e.clientY - r.top) / r.height) * 2;
    onChange({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
  };
  const release = () => onChange(ZERO);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        role="slider"
        aria-label={label}
        aria-disabled={disabled}
        aria-valuetext={`${value.x.toFixed(1)}, ${value.y.toFixed(1)}`}
        className={`relative h-36 w-36 touch-none select-none rounded-full border border-gray-600/60 bg-gray-800/40 ${disabled ? 'opacity-40' : 'cursor-grab'}`}
        onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
        onPointerMove={(e) => { if (!disabled && e.buttons) at(e); }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <div className="absolute left-1/2 top-1/2 h-px w-full -translate-x-1/2 bg-gray-700/60" />
        <div className="absolute left-1/2 top-1/2 h-full w-px -translate-y-1/2 bg-gray-700/60" />
        <div
          className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/80 shadow"
          style={{ left: `${50 + value.x * 40}%`, top: `${50 - value.y * 40}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

export function MaameCockpitPanel() {
  const linkUp = useMaameLinkUp();
  const linkProblem = useMaameLinkProblem();
  const armed = useTelemetryStore((s) => s.flight.armed);
  const modeNum = useTelemetryStore((s) => s.flight.modeNum);
  const mode = useTelemetryStore((s) => s.flight.mode);
  const height = useTelemetryStore((s) => s.position?.relativeAlt ?? 0);
  const pi = useMaameCompanion();
  const [takeoffM, setTakeoffM] = useState(2);
  const [stepM, setStepM] = useState(2);
  const [speed, setSpeed] = useState(1);
  const [keyboard, setKeyboard] = useState(false);
  const [left, setLeft] = useState<Stick>(ZERO);
  const [right, setRight] = useState<Stick>(ZERO);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inGuided = linkUp && armed && modeNum === GUIDED;
  const piActive = pi.status === MAV_STATE_ACTIVE;

  const send = useCallback(async (move: Parameters<typeof window.electronAPI.maameCockpitMove>[0]) => {
    const r = await window.electronAPI.maameCockpitMove(move);
    setNote(r.ok ? null : `Not sent: ${r.error}`);
    return r.ok;
  }, []);

  // Held sticks / keys -> velocity ~10x a second; one stop when released.
  const velocity = keys.size ? keysVelocity(keys, speed) : stickVelocity(left, right, speed);
  const moving = inGuided && !isStill(velocity);
  const velRef = useRef(velocity);
  velRef.current = velocity;
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => void send(velRef.current), 100);
    return () => {
      clearInterval(t);
      void send({ kind: 'velocity', forward: 0, right: 0, up: 0, yawRateDeg: 0 }); // stop now, not in 3 s
    };
  }, [moving, send]);

  // Keyboard flying: plain keys only (Shift+P/A/R/L are the emergency shortcuts), never while typing.
  useEffect(() => {
    if (!keyboard || !inGuided) { setKeys(new Set()); return; }
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (!(e.code in COCKPIT_KEYS) || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      setKeys((k) => (k.has(e.code) ? k : new Set(k).add(e.code)));
    };
    const up = (e: KeyboardEvent) => setKeys((k) => { if (!k.has(e.code)) return k; const n = new Set(k); n.delete(e.code); return n; });
    const blur = () => { setKeys(new Set()); setLeft(ZERO); setRight(ZERO); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [keyboard, inGuided]);

  const takeoff = async () => {
    if (!window.confirm(`Take off to ${takeoffM} m and hold there?\n\nProps on, area clear, people at least 10 m back. Pause / RTL / Land / kill are in the header.`)) return;
    setBusy(true);
    try {
      if (!(await window.electronAPI.mavlinkSetMode(GUIDED))) throw new Error('could not switch to GUIDED');
      if (!(await window.electronAPI.mavlinkArmDisarm(true, false))) throw new Error('arming refused (see Messages / pre-arm)');
      if (!(await window.electronAPI.mavlinkTakeoff(takeoffM))) throw new Error('take-off refused');
      setNote(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const nudge = (forward: number, rightM: number, up: number) => void send({ kind: 'offset', forward, right: rightM, up });

  if (!linkUp) {
    return <div className="p-3 text-sm text-gray-400">Maame cockpit: connect with “Connect to Maame” first.</div>;
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Maame cockpit</span>
        <span className={armed ? 'text-amber-400' : 'text-gray-400'}>
          {armed ? 'ARMED' : 'disarmed'} · {mode ?? '-'} · {height.toFixed(1)} m
        </span>
      </div>
      {linkProblem && <p className="text-xs text-red-400">{linkProblem}</p>}
      {note && <p className="text-xs text-red-400">{note}</p>}

      {!armed && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            Take off to
            <input type="number" min={1} max={10} value={takeoffM}
              onChange={(e) => setTakeoffM(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="input w-14 text-xs" /> m
          </label>
          <button className="btn btn-primary px-3 py-2 text-xs" disabled={busy || !piActive || !!linkProblem} onClick={() => void takeoff()}>
            Take off
          </button>
          {!piActive && (
            <button className={btn} onClick={() => void window.electronAPI.maameCompanionSetReady(true)}>Pi ready (needed to arm)</button>
          )}
        </div>
      )}

      {armed && modeNum !== GUIDED && (
        <button className="btn btn-primary w-full py-2 text-xs" onClick={() => void window.electronAPI.mavlinkSetMode(GUIDED)}>
          Take control (GUIDED: pauses any mission and holds)
        </button>
      )}

      <fieldset disabled={!inGuided} className={inGuided ? '' : 'opacity-50'}>
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="text-gray-400">Nudge step</span>
          {[1, 2, 5].map((s) => (
            <button key={s} className={`btn px-2 py-1 text-xs ${stepM === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStepM(s)}>{s} m</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button className={btn} onClick={() => void send({ kind: 'turn', degrees: -45 })}>⟲ 45°</button>
          <button className={btn} onClick={() => nudge(stepM, 0, 0)}>Forward</button>
          <button className={btn} onClick={() => void send({ kind: 'turn', degrees: 45 })}>45° ⟳</button>
          <button className={btn} onClick={() => nudge(0, -stepM, 0)}>Left</button>
          <button className={btn} onClick={() => nudge(0, 0, stepM)}>Up</button>
          <button className={btn} onClick={() => nudge(0, stepM, 0)}>Right</button>
          <button className={btn} onClick={() => void send({ kind: 'turn', degrees: -90 })}>⟲ 90°</button>
          <button className={btn} onClick={() => nudge(-stepM, 0, 0)}>Back</button>
          <button className={btn} onClick={() => void send({ kind: 'turn', degrees: 90 })}>90° ⟳</button>
          <span />
          <button className={btn} onClick={() => nudge(0, 0, -stepM)}>Down</button>
          <span />
        </div>

        <div className="mt-3 flex justify-around">
          <Pad label="Climb / turn" value={left} onChange={setLeft} disabled={!inGuided} />
          <Pad label="Forward / sideways" value={right} onChange={setRight} disabled={!inGuided} />
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <label htmlFor="maame-cockpit-speed" className="text-gray-400">Max speed</label>
          <input id="maame-cockpit-speed" type="range" min={0.5} max={3} step={0.5} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1" />
          <span className="w-12 text-right">{speed} m/s</span>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={keyboard} onChange={(e) => setKeyboard(e.target.checked)} />
          Keyboard flying: W/S forward-back, A/D sideways, ↑/↓ climb, ←/→ turn (release = hold)
        </label>
      </fieldset>

      {armed && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-secondary py-2 text-xs" onClick={() => void window.electronAPI.mavlinkSetMode(COPTER_MODE.LAND)}>Land here</button>
          <button className="btn btn-secondary py-2 text-xs" onClick={() => void window.electronAPI.mavlinkSetMode(COPTER_MODE.RTL)}>Return home</button>
        </div>
      )}
    </div>
  );
}
