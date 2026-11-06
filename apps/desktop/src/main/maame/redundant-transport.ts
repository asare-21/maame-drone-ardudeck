/**
 * RedundantTransport: one vehicle reached over several links (Maame: Wi-Fi via
 * the Pi's mavlink-router, SiK radio, later 4G). To the rest of ArduDeck it is a
 * single primary transport, so missions, params and FTP keep working across a
 * switch.
 *
 *   - RX: only the active link's bytes are emitted; every link's bytes count
 *     towards that link's liveness. No duplicate packets reach the parser.
 *   - TX: only on the active link, except GCS HEARTBEATs, which go on every open
 *     link so standby links stay registered with the far end (mavlink-router UDP
 *     server only replies to a GCS that has sent to it) and feed the FC's GCS
 *     failsafe on each port.
 *   - Failover: leave the active link once it has been silent for staleMs;
 *     return to a higher-priority link once it has been alive for recoverMs.
 */
import { BaseTransport, type Transport } from '@ardudeck/comms';

export interface RedundantLink {
  /** Shown in logs/UI, e.g. "Wi-Fi", "SiK". */
  name: string;
  transport: Transport;
}

export interface LinkHealth {
  /** Last time any byte arrived, or null if none yet. */
  lastRxMs: number | null;
  /** Start of the current unbroken alive stretch, or null while silent. */
  aliveSinceMs: number | null;
}

export interface FailoverTiming {
  staleMs: number;
  recoverMs: number;
}

export const DEFAULT_TIMING: FailoverTiming = { staleMs: 3000, recoverMs: 5000 };

export interface LinkChange {
  from: string;
  to: string;
  reason: 'active-stale' | 'preferred-recovered';
}

export function isLinkAlive(h: LinkHealth, nowMs: number, t: FailoverTiming): boolean {
  return h.lastRxMs !== null && nowMs - h.lastRxMs < t.staleMs;
}

/**
 * Which link should be active. Links are in priority order (index 0 = best).
 * Pure, so the switching rule is unit-tested without sockets.
 */
export function chooseActiveLink(
  links: LinkHealth[],
  active: number,
  nowMs: number,
  t: FailoverTiming = DEFAULT_TIMING,
): { index: number; reason: LinkChange['reason'] | null } {
  // a better link that has been steady long enough wins back
  for (let i = 0; i < active; i++) {
    const h = links[i]!;
    if (isLinkAlive(h, nowMs, t) && h.aliveSinceMs !== null && nowMs - h.aliveSinceMs >= t.recoverMs) {
      return { index: i, reason: 'preferred-recovered' };
    }
  }
  if (isLinkAlive(links[active]!, nowMs, t)) return { index: active, reason: null };
  const best = links.findIndex((h) => isLinkAlive(h, nowMs, t));
  // nothing alive: stay put rather than hop between dead links
  return best === -1 || best === active ? { index: active, reason: null } : { index: best, reason: 'active-stale' };
}

/** True for a whole MAVLink v1/v2 HEARTBEAT frame (msgid 0). */
export function isHeartbeatFrame(data: Uint8Array): boolean {
  if (data[0] === 0xfd && data.length >= 10) return (data[7]! | (data[8]! << 8) | (data[9]! << 16)) === 0;
  if (data[0] === 0xfe && data.length >= 6) return data[5] === 0;
  return false;
}

export class RedundantTransport extends BaseTransport {
  private readonly links: RedundantLink[];
  private readonly health: LinkHealth[];
  private readonly timing: FailoverTiming;
  private readonly now: () => number;
  private active = 0;
  private timer: NodeJS.Timeout | null = null;
  private opened = false;

  constructor(links: RedundantLink[], timing: FailoverTiming = DEFAULT_TIMING, now: () => number = Date.now) {
    super();
    if (links.length === 0) throw new Error('RedundantTransport needs at least one link');
    this.links = links;
    this.health = links.map(() => ({ lastRxMs: null, aliveSinceMs: null }));
    this.timing = timing;
    this.now = now;
  }

  get isOpen(): boolean {
    return this.links.some((l) => l.transport.isOpen);
  }
  get bytesToRead(): number {
    return 0;
  }
  get bytesToWrite(): number {
    return this.links[this.active]!.transport.bytesToWrite;
  }
  get portName(): string {
    return this.links.map((l, i) => (i === this.active ? `[${l.name}]` : l.name)).join(' + ');
  }
  get activeLinkName(): string {
    return this.links[this.active]!.name;
  }

  /** Per-link status for the UI. */
  status(): Array<{ name: string; open: boolean; alive: boolean; active: boolean; lastRxAgoMs: number | null }> {
    const now = this.now();
    return this.links.map((l, i) => ({
      name: l.name,
      open: l.transport.isOpen,
      alive: isLinkAlive(this.health[i]!, now, this.timing),
      active: i === this.active,
      lastRxAgoMs: this.health[i]!.lastRxMs === null ? null : now - this.health[i]!.lastRxMs!,
    }));
  }

  async open(): Promise<void> {
    this.links.forEach((link, i) => {
      link.transport.on('data', (data: Uint8Array) => this.onLinkData(i, data));
      // a failing standby link must not tear down the session; surface it for logs only
      link.transport.on('error', (err: Error) => this.emit('linkerror', { name: link.name, error: err }));
      link.transport.on('close', () => {
        this.health[i] = { lastRxMs: null, aliveSinceMs: null };
        if (this.opened && !this.isOpen) {
          this.opened = false;
          this.stopTimer();
          this.emit('close');
        }
      });
    });
    const results = await Promise.allSettled(this.links.map((l) => l.transport.open()));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length === results.length) {
      throw new Error(`No Maame link could be opened: ${failed.map((r) => String(r.reason?.message ?? r.reason)).join('; ')}`);
    }
    results.forEach((r, i) => {
      if (r.status === 'rejected') this.emit('linkerror', { name: this.links[i]!.name, error: r.reason });
    });
    this.opened = true;
    this.timer = setInterval(() => this.evaluate(), 250);
    this.emit('open');
  }

  async close(): Promise<void> {
    this.opened = false;
    this.stopTimer();
    await Promise.allSettled(this.links.map((l) => (l.transport.isOpen ? l.transport.close() : Promise.resolve())));
    this.emit('close');
  }

  async write(data: Uint8Array): Promise<void> {
    if (isHeartbeatFrame(data)) {
      await Promise.allSettled(this.links.filter((l) => l.transport.isOpen).map((l) => l.transport.write(data)));
      return;
    }
    await this.links[this.active]!.transport.write(data);
  }

  async read(): Promise<number> {
    return 0; // consumers use 'data' events
  }
  async readByte(): Promise<number> {
    return -1;
  }
  async discardInBuffer(): Promise<void> {
    await Promise.allSettled(this.links.map((l) => l.transport.discardInBuffer()));
  }

  /** Re-run the failover rule now (also runs every 250 ms while open). */
  evaluate(): void {
    const now = this.now();
    const { index, reason } = chooseActiveLink(this.health, this.active, now, this.timing);
    if (reason === null || index === this.active) return;
    const change: LinkChange = { from: this.links[this.active]!.name, to: this.links[index]!.name, reason };
    this.active = index;
    this.emit('linkchange', change);
  }

  private onLinkData(i: number, data: Uint8Array): void {
    const now = this.now();
    const h = this.health[i]!;
    if (!isLinkAlive(h, now, this.timing)) h.aliveSinceMs = now;
    h.lastRxMs = now;
    if (i === this.active) this.emit('data', data);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
