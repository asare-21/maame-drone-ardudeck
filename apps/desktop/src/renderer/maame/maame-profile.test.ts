import { describe, expect, it } from 'vitest';
import { MAAME, MAAME_WIFI_CONNECTION, maameConnectOptions, maameConnectionSeed } from './maame-profile';

describe('maameConnectOptions', () => {
  it('puts Wi-Fi first and adds SiK at 57600 only when a port is chosen', () => {
    expect(maameConnectOptions().maameLinks?.map((l) => l.name)).toEqual(['Wi-Fi']);
    const both = maameConnectOptions('/dev/cu.usbserial-SIK');
    expect(both.type).toBe('maame');
    expect(both.maameLinks?.map((l) => l.name)).toEqual(['Wi-Fi', 'SiK']);
    expect(both.maameLinks?.[0]?.options).toMatchObject({ type: 'udp', udpMode: 'client', udpRemoteHost: 'maame.local', udpRemotePort: 14550 });
    expect(both.maameLinks?.[1]?.options).toEqual({ type: 'serial', port: '/dev/cu.usbserial-SIK', baudRate: MAAME.sikBaud });
  });

  it('adds 4G (Tailscale) between Wi-Fi and SiK, on its own local port, only when an address is given', () => {
    const all = maameConnectOptions('/dev/cu.usbserial-SIK', '100.101.102.103');
    expect(all.maameLinks?.map((l) => l.name)).toEqual(['Wi-Fi', '4G', 'SiK']);
    expect(all.maameLinks?.[1]?.options).toMatchObject({ type: 'udp', udpRemoteHost: '100.101.102.103', udpRemotePort: 14550, udpWideUplink: true });
    expect(all.maameLinks?.[1]?.options.udpClientLocalPort).not.toBe(all.maameLinks?.[0]?.options.udpClientLocalPort);
    expect(maameConnectOptions(undefined, '  ').maameLinks?.map((l) => l.name)).toEqual(['Wi-Fi']);
  });
});

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
