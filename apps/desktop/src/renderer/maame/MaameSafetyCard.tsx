/**
 * Maame safety baseline check, shown at the top of the Pre-flight panel:
 * compares the FC's parameters with the no-RC baseline and applies the fixes.
 */
import { useMemo, useState } from 'react';
import { useParameterStore } from '../stores/parameter-store';
import { useSettingsStore } from '../stores/settings-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { checkBaseline, maameBaseline } from './safety-baseline';

export function MaameSafetyCard() {
  const parameters = useParameterStore((s) => s.parameters);
  const downloadState = useParameterStore((s) => s.downloadState);
  const fetchParameters = useParameterStore((s) => s.fetchParameters);
  const setParameterImmediate = useParameterStore((s) => s.setParameterImmediate);
  const gcsSysid = useSettingsStore((s) => s.gcsSysid);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const [applying, setApplying] = useState(false);
  const [writeErrors, setWriteErrors] = useState<string[]>([]);
  const [needsReboot, setNeedsReboot] = useState(false);

  const results = useMemo(
    () =>
      checkBaseline(maameBaseline(gcsSysid), (id) => {
        const p = parameters.get(id);
        if (!p) return null;
        return p.isModified ? (p.originalValue ?? p.value) : p.value; // what the FC holds
      }),
    [parameters, gcsSysid],
  );
  const failing = results.filter((r) => !r.ok);
  const fixable = failing.filter((r) => r.fix !== null);

  if (downloadState !== 'complete') {
    return (
      <div className="rounded-lg border border-gray-700/50 p-3 text-sm">
        <div className="font-medium">Maame safety baseline</div>
        <p className="text-xs text-gray-400">Needs the full parameter list from the FC.</p>
        <button className="btn btn-secondary mt-2 w-full" disabled={downloadState === 'loading'} onClick={() => void fetchParameters()}>
          {downloadState === 'loading' ? 'Downloading parameters…' : 'Download parameters'}
        </button>
      </div>
    );
  }

  const apply = async () => {
    setApplying(true);
    const errors: string[] = [];
    let reboot = false;
    for (const r of fixable) {
      const okWrite = await setParameterImmediate(r.item.param, r.fix!);
      if (!okWrite) errors.push(r.item.param);
      else if (r.item.reboot) reboot = true;
    }
    setWriteErrors(errors);
    setNeedsReboot(reboot);
    setApplying(false);
  };

  const reboot = async () => {
    if (!window.confirm('Reboot the flight controller now? The link drops for a few seconds.')) return;
    await window.electronAPI.mavlinkReboot();
    setNeedsReboot(false);
  };

  return (
    <div className={`rounded-lg border p-3 text-sm ${failing.length ? 'border-red-500/60' : 'border-green-500/50'}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Maame safety baseline (no RC)</span>
        <span className={failing.length ? 'text-red-400' : 'text-green-400'}>
          {failing.length ? `${failing.length} of ${results.length} not safe` : `all ${results.length} OK`}
        </span>
      </div>
      {failing.length > 0 && (
        <ul className="mt-2 space-y-1">
          {failing.map((r) => (
            <li key={r.item.param} className="text-xs">
              <span className="font-mono">{r.item.param}</span>{' '}
              {r.current === null ? (
                <span className="text-red-400">missing on this firmware</span>
              ) : (
                <span>
                  {r.current} → <span className="text-green-400">{r.fix}</span>
                  {r.item.reboot ? ' (reboot)' : ''}
                </span>
              )}
              <div className="text-gray-400">{r.item.why}</div>
            </li>
          ))}
        </ul>
      )}
      {writeErrors.length > 0 && <p className="mt-2 text-xs text-red-400">Not written: {writeErrors.join(', ')}</p>}
      {fixable.length > 0 && (
        <button className="btn btn-primary mt-2 w-full" disabled={applying || armed} onClick={() => void apply()}>
          {armed ? 'Disarm to apply fixes' : applying ? 'Writing…' : `Apply ${fixable.length} fix${fixable.length > 1 ? 'es' : ''}`}
        </button>
      )}
      {needsReboot && (
        <button className="btn btn-secondary mt-2 w-full" disabled={armed} onClick={() => void reboot()}>
          Reboot FC to finish
        </button>
      )}
    </div>
  );
}
