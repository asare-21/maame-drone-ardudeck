import { describe, it, expect, afterEach } from 'vitest';
import { createSocket } from 'dgram';
import { UdpTransport } from './udp-transport.js';

describe('UdpTransport receive buffer', () => {
  let t: UdpTransport | null = null;
  afterEach(async () => { await t?.close(); t = null; });

  it('stays bounded when the consumer only listens to data events', async () => {
    const port = 30000 + Math.floor(Math.random() * 20000);
    t = new UdpTransport({ localPort: port });
    let seen = 0;
    t.on('data', (d: Uint8Array) => { seen += d.length; });
    await t.open();
    const tx = createSocket('udp4');
    const chunk = Buffer.alloc(1400, 0xfd);
    for (let i = 0; i < 1100; i++) {
      await new Promise<void>((r) => tx.send(chunk, port, '127.0.0.1', () => r()));
      // Pace the burst so the kernel's socket buffer doesn't drop datagrams.
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 300));
    tx.close();
    expect(seen).toBeGreaterThan(1024 * 1024);
    expect(t.bytesToRead).toBeLessThanOrEqual(1024 * 1024 + 1400);
  });
});

describe('UdpTransport uplink metering', () => {
  let t: UdpTransport | null = null;
  afterEach(async () => { await t?.close(); t = null; });

  /** Two MAVLink2 FILE_TRANSFER_PROTOCOL-sized frames: arrival times at a local listener. */
  async function sendTwoFtpFrames(wideUplink?: boolean): Promise<number[]> {
    const rxPort = 30000 + Math.floor(Math.random() * 20000);
    const rx = createSocket('udp4');
    const arrivals: number[] = [];
    rx.on('message', () => arrivals.push(Date.now()));
    await new Promise<void>((r) => rx.bind(rxPort, () => r()));
    t = new UdpTransport({ localPort: rxPort + 1, remoteHost: '127.0.0.1', remotePort: rxPort, wideUplink });
    await t.open();
    const frame = new Uint8Array(263);
    frame[0] = 0xfd; frame[1] = 251; frame[7] = 110; // msgid FILE_TRANSFER_PROTOCOL
    const start = Date.now();
    void t.write(frame);
    void t.write(frame.slice());
    await new Promise((r) => setTimeout(r, 600));
    rx.close();
    return arrivals.map((a) => a - start);
  }

  it('meters an unproven link (it may be an ELRS backpack): the second bulk frame waits', async () => {
    expect((await sendTwoFtpFrames()).length).toBe(1);
  });

  it('sends at once on a link declared wide (Wi-Fi/LAN), so MAVFTP does not time out', async () => {
    const at = await sendTwoFtpFrames(true);
    expect(at.length).toBe(2);
    expect(Math.max(...at)).toBeLessThan(300);
  });
});

