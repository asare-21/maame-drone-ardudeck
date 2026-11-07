/**
 * Maame mission from coordinates, in the Pre-flight panel: paste or load a CSV of
 * "lat, lon[, alt[, hover]]" and make it the planned mission. The launch card's
 * Mission safety check and Upload button take it from there.
 */
import { useState } from 'react';
import { buildArduPilotWireMission } from '../../shared/mission-wire';
import { fcSeqOffsetNow, useMissionStore } from '../stores/mission-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { parseCoordinates } from './coordinate-mission';

export function MaameCoordinateMissionCard() {
  const [text, setText] = useState('');
  const [defaultAltM, setDefaultAltM] = useState(20);
  const [takeoff, setTakeoff] = useState(true);
  const [returnHome, setReturnHome] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const gps = useTelemetryStore((s) => s.gps);
  const planned = useMissionStore((s) => s.missionItems.length);

  const parsed = text.trim() ? parseCoordinates(text, { defaultAltM, takeoff, returnHome }) : null;

  const loadFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };

  const apply = () => {
    if (!parsed || parsed.errors.length) return;
    if (planned > 0 && !window.confirm(`Replace the planned mission (${planned} items) with these ${parsed.points} points?`)) return;
    const home = gps?.lat ? { lat: gps.lat, lon: gps.lon, alt: 0 } : null;
    // ArduPilot keeps HOME at seq 0 and the store strips it, so give it one.
    const items = fcSeqOffsetNow() ? buildArduPilotWireMission(parsed.items, home) : parsed.items;
    useMissionStore.getState().setMissionItems(items);
    setNote(`Planned ${parsed.items.length} items. Check "Mission safety" above, then "1. Upload mission".`);
  };

  return (
    <div className="rounded-lg border border-gray-700/50 p-3 text-sm">
      <div className="font-medium">Mission from coordinates</div>
      <p className="mt-1 text-xs text-gray-400">One point per line: lat, lon[, altitude m[, hover s]]. CSV header rows and # comments are skipped.</p>
      <textarea
        aria-label="Coordinates"
        className="mt-2 h-24 w-full rounded border border-gray-700/50 bg-transparent p-2 font-mono text-xs"
        placeholder={'51.6501, -0.0801\n51.6505, -0.0805, 30\n51.6509, -0.0809, 25, 10'}
        value={text}
        onChange={(e) => { setText(e.target.value); setNote(null); }}
      />
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <label className="cursor-pointer text-blue-400">
          Load CSV…
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void loadFile(e.target.files?.[0])} />
        </label>
        <label className="flex items-center gap-1">
          Default altitude
          <input
            type="number" min={1} max={120} value={defaultAltM}
            onChange={(e) => setDefaultAltM(Number(e.target.value))}
            className="w-14 rounded border border-gray-700/50 bg-transparent px-1"
          />
          m
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={takeoff} onChange={(e) => setTakeoff(e.target.checked)} /> Take off first</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={returnHome} onChange={(e) => setReturnHome(e.target.checked)} /> Return home at the end</label>
      </div>
      {parsed && parsed.errors.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-red-400">
          {parsed.errors.slice(0, 6).map((e) => <li key={e}>✗ {e}</li>)}
          {parsed.errors.length > 6 && <li>… and {parsed.errors.length - 6} more</li>}
        </ul>
      )}
      {note && <p className="mt-1 text-xs text-green-400">{note}</p>}
      <button className="btn btn-secondary mt-2 w-full" disabled={!parsed || parsed.errors.length > 0 || armed} onClick={apply}>
        {parsed && !parsed.errors.length ? `Use these ${parsed.points} points as the mission` : 'Use as the mission'}
      </button>
    </div>
  );
}
