/**
 * Maame drone profile: the fixed facts about the one vehicle this build flies,
 * and first-run connection presets. Kept out of upstream files so upstream
 * ArduDeck merges stay easy.
 */
import type { ConnectionMemory, SavedConnection } from '../stores/settings-store';
import { useSettingsStore } from '../stores/settings-store';
import type { ConnectOptions } from '../../shared/ipc-channels';
import { startCompanionWatch } from './companion-store';
import { useConnectionStore } from '../stores/connection-store';

export const MAAME = {
  fcSysid: 1,
  companionCompid: 191,
  /** SiK radio on FC UART4 (SERIAL4_BAUD = 57). */
  sikBaud: 57600,
  /** Pi mavlink-router UDP server, reachable by mDNS on its own network or its hotspot. */
  wifiHost: 'maame.local',
  wifiPort: 14550,
  /** 4G over Tailscale reaches the same router port; its own local port so it never fights Wi-Fi for 14550. */
  lteLocalPort: 14560,
} as const;

/** Upstream's factory serial baud; only this value is replaced by the SiK baud. */
const UPSTREAM_DEFAULT_BAUD = 115200;

// Same label format as settings-store updateConnectionMemory, so using the
// preset does not add a second entry for the same link.
export const MAAME_WIFI_CONNECTION: SavedConnection = {
  type: 'udp',
  label: `${MAAME.wifiHost}:${MAAME.wifiPort} (UDP MAVLINK)`,
  host: MAAME.wifiHost,
  port: MAAME.wifiPort,
  protocol: 'mavlink',
  udpMode: 'client',
  udpRemoteHost: MAAME.wifiHost,
  udpRemotePort: MAAME.wifiPort,
  udpClientLocalPort: MAAME.wifiPort,
  lastUsed: 0,
};

/**
 * One connection to Maame over every available link, best first: Wi-Fi (Pi
 * mavlink-router), then the SiK radio when a port is chosen. The main process
 * fails over between them (main/maame/redundant-transport.ts).
 */
export function maameConnectOptions(sikPort?: string, lteHost?: string): ConnectOptions {
  const maameLinks: NonNullable<ConnectOptions['maameLinks']> = [
    {
      name: 'Wi-Fi',
      options: {
        type: 'udp',
        udpMode: 'client',
        udpRemoteHost: MAAME.wifiHost,
        udpRemotePort: MAAME.wifiPort,
        udpClientLocalPort: MAAME.wifiPort,
        udpWideUplink: true, // the Pi's Wi-Fi is never an ELRS backpack; metering broke gate uploads
      },
    },
  ];
  const lte = lteHost?.trim();
  if (lte) {
    maameLinks.push({
      name: '4G',
      options: {
        type: 'udp', udpMode: 'client', udpRemoteHost: lte, udpRemotePort: MAAME.wifiPort,
        udpClientLocalPort: MAAME.lteLocalPort, udpWideUplink: true,
      },
    });
  }
  if (sikPort) maameLinks.push({ name: 'SiK', options: { type: 'serial', port: sikPort, baudRate: MAAME.sikBaud } });
  return { type: 'maame', protocol: 'mavlink', maameLinks };
}

/**
 * Connection-memory changes that give a fresh install Maame defaults.
 * Never overrides a choice the user has made: the baud is only changed while it
 * is still upstream's default and no serial port has ever been used.
 * Returns null when nothing needs to change.
 */
export function maameConnectionSeed(mem: ConnectionMemory): Partial<ConnectionMemory> | null {
  const updates: Partial<ConnectionMemory> = {};
  const recent = mem.recentConnections ?? [];
  if (!recent.some((c) => c.label === MAAME_WIFI_CONNECTION.label)) {
    updates.recentConnections = [...recent, MAAME_WIFI_CONNECTION].slice(0, 10);
  }
  if (!mem.lastSerialPort && (mem.lastBaudRate ?? UPSTREAM_DEFAULT_BAUD) === UPSTREAM_DEFAULT_BAUD) {
    updates.lastBaudRate = MAAME.sikBaud;
  }
  return Object.keys(updates).length ? updates : null;
}

/** Apply the seed once settings have loaded from disk (seeding earlier would be overwritten). */
export function installMaameProfile(): void {
  startCompanionWatch();
  const apply = () => {
    const { connectionMemory } = useSettingsStore.getState();
    const updates = maameConnectionSeed(connectionMemory);
    // set directly: updateConnectionMemory would rewrite recentConnections from last* fields
    if (updates) useSettingsStore.setState({ connectionMemory: { ...connectionMemory, ...updates } });
  };
  if (useSettingsStore.getState()._isInitialized) {
    apply();
    return;
  }
  const unsubscribe = useSettingsStore.subscribe(
    (s) => s._isInitialized,
    (ready) => {
      if (!ready) return;
      unsubscribe();
      apply();
    },
  );
}

/**
 * True only on the Maame primary link (Connect to Maame). A fleet/multi-vehicle
 * link also shows as connected, but it has no Maame failover, no emergency bar
 * and no script installer, so the Maame launch controls must not use it.
 */
export function useMaameLinkUp(): boolean {
  return useConnectionStore(
    (s) => s.connectionState.isConnected && !!s.connectionState.maameLinks?.length && !s.connectionState.focus?.viaFleet,
  );
}

/** 4G (over the internet) may only fly with MAVLink signing on; null when the link is fine. */
export function useMaameLinkProblem(): string | null {
  return useConnectionStore((s) =>
    s.connectionState.maameLinks?.some((l) => l.name === '4G') && !s.connectionState.fcSigning
      ? '4G link without signing: turn signing on first (Settings > Signing)'
      : null,
  );
}
