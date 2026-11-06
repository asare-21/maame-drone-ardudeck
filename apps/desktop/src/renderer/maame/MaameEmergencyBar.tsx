/**
 * Maame in-flight controls in the header (no RC, so this is the only way to
 * intervene): Pause (BRAKE holds position and ignores the absent sticks, unlike
 * LOITER), Resume AUTO, RTL, Land, and a motor kill that must be held 1.5 s.
 * Shown only while a Maame multi-link connection is armed.
 */
import { useRef, useState } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { COPTER_MODE } from './MaameFlightCard';

const KILL_HOLD_MS = 1500;

export function MaameEmergencyBar() {
  const maameLinks = useConnectionStore((s) => s.connectionState.maameLinks);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const modeNum = useTelemetryStore((s) => s.flight.modeNum);
  const [holding, setHolding] = useState(false);
  const killTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!maameLinks?.length || !armed) return null;

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
      <button className={btn(modeNum === COPTER_MODE.BRAKE)} onClick={mode(COPTER_MODE.BRAKE)} title="Stop and hold position">
        Pause
      </button>
      <button className={btn(modeNum === COPTER_MODE.AUTO)} onClick={mode(COPTER_MODE.AUTO)} title="Continue the mission">
        Resume
      </button>
      <button className={btn(modeNum === COPTER_MODE.RTL)} onClick={mode(COPTER_MODE.RTL)} title="Return to launch and land">
        RTL
      </button>
      <button className={btn(modeNum === COPTER_MODE.LAND)} onClick={mode(COPTER_MODE.LAND)} title="Land where it is">
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
