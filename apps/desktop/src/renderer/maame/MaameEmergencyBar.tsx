/**
 * Maame in-flight controls in the header (no RC, so this is the only way to
 * intervene): Pause (BRAKE holds position and ignores the absent sticks, unlike
 * LOITER), Resume AUTO, RTL, Land, and a motor kill that must be held 1.5 s.
 * Shown only while a Maame multi-link connection is armed.
 */
import { useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { COPTER_MODE } from './MaameFlightCard';

const KILL_HOLD_MS = 1500;

/** Shift+letter while armed; no shortcut for the motor kill on purpose. */
export const MAAME_SHORTCUTS: Record<string, { mode: number; label: string }> = {
  P: { mode: COPTER_MODE.BRAKE, label: 'Pause' },
  A: { mode: COPTER_MODE.AUTO, label: 'Resume' },
  R: { mode: COPTER_MODE.RTL, label: 'RTL' },
  L: { mode: COPTER_MODE.LAND, label: 'Land' },
};

/** Mode for a key event, or null if it is not a Maame shortcut (or the user is typing). */
export function shortcutMode(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>, target: EventTarget | null): number | null {
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return null;
  const el = target as HTMLElement | null;
  if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return null;
  return MAAME_SHORTCUTS[e.key.toUpperCase()]?.mode ?? null;
}

export function MaameEmergencyBar() {
  const maameLinks = useConnectionStore((s) => s.connectionState.maameLinks);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const modeNum = useTelemetryStore((s) => s.flight.modeNum);
  const [holding, setHolding] = useState(false);
  const killTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = Boolean(maameLinks?.length) && armed;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const m = shortcutMode(e, e.target);
      if (m === null) return;
      e.preventDefault();
      void window.electronAPI.mavlinkSetMode(m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  if (!active) return null;

  const mode = (m: number) => () => void window.electronAPI.mavlinkSetMode(m);
  const startKill = () => {
    setHolding(true);
    killTimer.current = setTimeout(() => {
      setHolding(false);
      void window.electronAPI.mavlinkArmDisarm(false, true); // force disarm: motors stop, drone falls
    }, KILL_HOLD_MS);
  };
  const cancelKill = () => {
    if (killTimer.current) clearTimeout(killTimer.current);
    killTimer.current = null;
    setHolding(false);
  };
  const btn = (active: boolean) => `btn px-2 py-1 text-xs ${active ? 'btn-primary' : 'btn-secondary'}`;

  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Maame flight controls">
      <button className={btn(modeNum === COPTER_MODE.BRAKE)} onClick={mode(COPTER_MODE.BRAKE)} title="Stop and hold position (Shift+P)">
        Pause
      </button>
      <button className={btn(modeNum === COPTER_MODE.AUTO)} onClick={mode(COPTER_MODE.AUTO)} title="Continue the mission (Shift+A)">
        Resume
      </button>
      <button className={btn(modeNum === COPTER_MODE.RTL)} onClick={mode(COPTER_MODE.RTL)} title="Return to launch and land (Shift+R)">
        RTL
      </button>
      <button className={btn(modeNum === COPTER_MODE.LAND)} onClick={mode(COPTER_MODE.LAND)} title="Land where it is (Shift+L)">
        Land
      </button>
      <button
        className="btn btn-danger px-2 py-1 text-xs"
        onPointerDown={startKill}
        onPointerUp={cancelKill}
        onPointerLeave={cancelKill}
        title="Hold 1.5 s: stop the motors immediately (the drone falls)"
      >
        {holding ? 'Keep holding…' : 'Hold to kill motors'}
      </button>
    </div>
  );
}
