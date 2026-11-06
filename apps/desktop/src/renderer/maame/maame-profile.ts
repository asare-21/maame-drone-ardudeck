/**
 * Maame drone profile: the fixed facts about the one vehicle this build flies,
 * and first-run connection presets. Kept out of upstream files so upstream
 * ArduDeck merges stay easy.
 */
import type { ConnectionMemory, SavedConnection } from '../stores/settings-store';
import { useSettingsStore } from '../stores/settings-store';

export const MAAME = {
  fcSysid: 1,
  companionCompid: 191,
  /** SiK radio on FC UART4 (SERIAL4_BAUD = 57). */
  sikBaud: 57600,
  /** Pi mavlink-router UDP server, reachable by mDNS on its own network or its hotspot. */
  wifiHost: 'maame.local',
  wifiPort: 14550,
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
