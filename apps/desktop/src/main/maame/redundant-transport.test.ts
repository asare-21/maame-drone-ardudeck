import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Transport } from '@ardudeck/comms';
import { RedundantTransport, chooseActiveLink, isHeartbeatFrame, type LinkHealth } from './redundant-transport';

const T = { staleMs: 3000, recoverMs: 5000 };
const alive = (lastRxMs: number, aliveSinceMs: number): LinkHealth => ({ lastRxMs, aliveSinceMs });
const silent: LinkHealth = { lastRxMs: null, aliveSinceMs: null };

describe('chooseActiveLink', () => {
  it('keeps a live active link', () => {
    expect(chooseActiveLink([alive(9000, 0), alive(9000, 0)], 0, 10000, T)).toEqual({ index: 0, reason: null });
  });
  it('fails over to the best live link when the active one goes silent', () => {
    expect(chooseActiveLink([alive(6000, 0), silent, alive(9900, 0)], 0, 10000, T)).toEqual({ index: 2, reason: 'active-stale' });
  });
  it('stays put when nothing is alive', () => {
    expect(chooseActiveLink([silent, alive(1000, 0)], 1, 10000, T)).toEqual({ index: 1, reason: null });
  });
  it('returns to the preferred link only after it has been steady for recoverMs', () => {
    expect(chooseActiveLink([alive(9900, 6000), alive(9900, 0)], 1, 10000, T).index).toBe(1); // 4 s steady
    expect(chooseActiveLink([alive(9900, 5000), alive(9900, 0)], 1, 10000, T)).toEqual({ index: 0, reason: 'preferred-recovered' });
  });
});

describe('isHeartbeatFrame', () => {
  it('detects v2 and v1 heartbeats only', () => {
    expect(isHeartbeatFrame(Uint8Array.from([0xfd, 9, 0, 0, 1, 255, 190, 0, 0, 0, 0]))).toBe(true);
    expect(isHeartbeatFrame(Uint8Array.from([0xfd, 9, 0, 0, 1, 255, 190, 76, 0, 0, 0]))).toBe(false); // COMMAND_LONG
    expect(isHeartbeatFrame(Uint8Array.from([0xfe, 9, 1, 255, 190, 0, 0]))).toBe(true);
    expect(isHeartbeatFrame(Uint8Array.from([0x00, 1, 2]))).toBe(false);
  });
});

class FakeLink extends EventEmitter {
  isOpen = false;
  writes: Uint8Array[] = [];
  constructor(private readonly failOpen = false) {
    super();
  }
  bytesToRead = 0;
  bytesToWrite = 0;
  portName = 'fake';
  async open() {
    if (this.failOpen) throw new Error('no such port');
    this.isOpen = true;
  }
  async close() {
    this.isOpen = false;
    this.emit('close');
  }
  async write(d: Uint8Array) {
    this.writes.push(d);
  }
  async discardInBuffer() {}
  rx(...bytes: number[]) {
    this.emit('data', Uint8Array.from(bytes));
  }
}

describe('RedundantTransport', () => {
  let rt: RedundantTransport | null = null;
  afterEach(async () => {
    await rt?.close();
    rt = null;
  });

  const make = (links: FakeLink[]) => {
    let now = 0;
    rt = new RedundantTransport(
      links.map((l, i) => ({ name: ['Wi-Fi', 'SiK', '4G'][i]!, transport: l as unknown as Transport })),
      T,
      () => now,
    );
    return { rt, tick: (ms: number) => { now += ms; rt!.evaluate(); } };
  };

  const HB = Uint8Array.from([0xfd, 9, 0, 0, 1, 255, 190, 0, 0, 0]);
  const CMD = Uint8Array.from([0xfd, 33, 0, 0, 2, 255, 190, 76, 0, 0]);

  it('passes only the active link up, sends commands on it alone and heartbeats on all', async () => {
    const wifi = new FakeLink(), sik = new FakeLink();
    const { rt } = make([wifi, sik]);
    const got: number[] = [];
    rt.on('data', (d: Uint8Array) => got.push(d[0]!));
    await rt.open();
    wifi.rx(1);
    sik.rx(2);
    expect(got).toEqual([1]);
    await rt.write(CMD);
    await rt.write(HB);
    expect(wifi.writes).toEqual([CMD, HB]);
    expect(sik.writes).toEqual([HB]);
  });

  it('fails over to SiK when Wi-Fi goes silent and comes back once Wi-Fi is steady', async () => {
    const wifi = new FakeLink(), sik = new FakeLink();
    const { rt, tick } = make([wifi, sik]);
    const changes: string[] = [];
    rt.on('linkchange', (c: { to: string; reason: string }) => changes.push(`${c.to}:${c.reason}`));
    await rt.open();
    wifi.rx(1);
    sik.rx(2);
    tick(2000);
    sik.rx(2);
    tick(1500); // Wi-Fi silent 3.5 s, SiK heard 1.5 s ago
    expect(rt.activeLinkName).toBe('SiK');
    await rt.write(CMD);
    expect(sik.writes).toContain(CMD);
    for (let i = 0; i < 6; i++) {
      wifi.rx(1);
      sik.rx(2);
      tick(1000);
    }
    expect(rt.activeLinkName).toBe('Wi-Fi');
    expect(changes).toEqual(['SiK:active-stale', 'Wi-Fi:preferred-recovered']);
  });

  it('emits status only when a link changes state', async () => {
    const wifi = new FakeLink(), sik = new FakeLink();
    const { rt, tick } = make([wifi, sik]);
    const seen: string[] = [];
    rt.on('status', (s: Array<{ name: string; alive: boolean; active: boolean }>) =>
      seen.push(s.map((l) => `${l.name}${l.alive ? '+' : '-'}${l.active ? '*' : ''}`).join(' ')));
    await rt.open();
    wifi.rx(1);
    tick(100);
    tick(100); // no change, no event
    tick(3500); // Wi-Fi silent
    expect(seen).toEqual(['Wi-Fi+* SiK-', 'Wi-Fi-* SiK-']);
  });

  it('keeps the session open and reopens a link that closes', async () => {
    vi.useFakeTimers();
    try {
      const wifi = new FakeLink(), sik = new FakeLink();
      const { rt } = make([wifi, sik]);
      let closed = false;
      rt.on('close', () => { closed = true; });
      await rt.open();
      await wifi.close();
      await sik.close(); // every link gone at once
      expect(closed).toBe(false);
      await vi.advanceTimersByTimeAsync(3100);
      expect(wifi.isOpen && sik.isOpen).toBe(true);
      expect(closed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens when one link is missing, and fails only when every link fails', async () => {
    const { rt } = make([new FakeLink(true), new FakeLink()]);
    const errors: string[] = [];
    rt.on('linkerror', (e: { name: string }) => errors.push(e.name));
    await rt.open();
    expect(rt.isOpen).toBe(true);
    expect(errors).toEqual(['Wi-Fi']);
    await rt.close();
    const all = new RedundantTransport([{ name: 'a', transport: new FakeLink(true) as unknown as Transport }]);
    await expect(all.open()).rejects.toThrow(/No Maame link could be opened/);
  });
});
