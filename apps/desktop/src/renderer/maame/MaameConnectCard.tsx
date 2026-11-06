/**
 * "Connect to Maame": one click opens Wi-Fi and (optionally) the SiK radio as a
 * single connection with automatic failover.
 */
import { useEffect, useState } from 'react';
import type { SerialPortInfo } from '@ardudeck/comms';
import { useConnectionStore } from '../stores/connection-store';
import { MAAME, maameConnectOptions } from './maame-profile';

export function MaameConnectCard() {
  const { isConnecting, connect } = useConnectionStore();
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [sikPort, setSikPort] = useState('');

  const refresh = async () => setPorts(await window.electronAPI.listPorts());
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-2 rounded-lg border border-gray-700/50 p-3">
      <div className="text-sm font-medium">Maame drone</div>
      <div className="text-xs text-gray-400">
        Wi-Fi {MAAME.wifiHost}:{MAAME.wifiPort}
        {sikPort ? ` + SiK ${sikPort} @ ${MAAME.sikBaud}` : ''}, automatic failover
      </div>
      <div className="flex gap-2">
        <select
          value={sikPort}
          onChange={(e) => setSikPort(e.target.value)}
          onFocus={() => void refresh()}
          className="select flex-1"
          aria-label="SiK radio port"
        >
          <option value="">No SiK radio (Wi-Fi only)</option>
          {ports.map((p) => (
            <option key={p.path} value={p.path}>
              {p.path}
              {p.manufacturer ? ` (${p.manufacturer})` : ''}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={() => void connect(maameConnectOptions(sikPort || undefined))}
        disabled={isConnecting}
        className="btn btn-primary w-full"
      >
        {isConnecting ? 'Connecting…' : 'Connect to Maame'}
      </button>
    </div>
  );
}
