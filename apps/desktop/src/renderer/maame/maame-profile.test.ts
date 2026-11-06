import { describe, expect, it } from 'vitest';
import { MAAME, MAAME_WIFI_CONNECTION, maameConnectionSeed } from './maame-profile';

describe('maameConnectionSeed', () => {
  it('seeds the Wi-Fi preset and SiK baud on a fresh install', () => {
    expect(maameConnectionSeed({ lastBaudRate: 115200, lastConnectionType: 'serial' })).toEqual({
      recentConnections: [MAAME_WIFI_CONNECTION],
      lastBaudRate: MAAME.sikBaud,
    });
  });

  it('keeps a baud the user chose or a port they used', () => {
    expect(maameConnectionSeed({ lastBaudRate: 921600, recentConnections: [MAAME_WIFI_CONNECTION] })).toBeNull();
    expect(
      maameConnectionSeed({ lastBaudRate: 115200, lastSerialPort: '/dev/cu.usbmodem1', recentConnections: [MAAME_WIFI_CONNECTION] }),
    ).toBeNull();
  });

  it('adds the preset once, after existing recents', () => {
    const other = { ...MAAME_WIFI_CONNECTION, label: '10.0.0.5:14550 (UDP MAVLINK)', host: '10.0.0.5' };
    const out = maameConnectionSeed({ lastBaudRate: 57600, recentConnections: [other] });
    expect(out?.recentConnections?.map((c) => c.label)).toEqual([other.label, MAAME_WIFI_CONNECTION.label]);
    expect(maameConnectionSeed({ lastBaudRate: 57600, recentConnections: out!.recentConnections })).toBeNull();
  });
});
