/**
 * Maame safety baseline: the ArduCopter 4.7 settings a drone flying autonomous
 * missions with NO RC transmitter must have. With no pilot to take over, these
 * failsafes are the only safety net. Names/values checked against Copter-4.7.2
 * (RTL_ALT is RTL_ALT_M, SYSID_MYGCS is MAV_GCS_SYSID in 4.7).
 */

export type BaselineRule =
  | { kind: 'eq'; value: number }
  | { kind: 'oneOf'; values: number[]; fix: number }
  | { kind: 'bitsSet'; bits: number }
  | { kind: 'max'; value: number; fix: number }
  | { kind: 'min'; value: number; fix: number };

export interface BaselineItem {
  param: string;
  rule: BaselineRule;
  why: string;
  /** Change only takes effect after an FC reboot. */
  reboot?: boolean;
}

export function maameBaseline(gcsSysid: number): BaselineItem[] {
  return [
    { param: 'ARMING_SKIPCHK', rule: { kind: 'eq', value: 64 }, why: 'Skip only the RC check (no transmitter); every other pre-arm check stays on' },
    { param: 'FS_THR_ENABLE', rule: { kind: 'eq', value: 0 }, why: 'No RC: the throttle failsafe would trigger immediately' },
    { param: 'FS_GCS_ENABLE', rule: { kind: 'oneOf', values: [1, 3], fix: 1 }, why: 'Lost ground link: return to launch' },
    { param: 'FS_GCS_TIMEOUT', rule: { kind: 'max', value: 10, fix: 5 }, why: 'React to a lost ground link within seconds' },
    { param: 'FS_OPTIONS', rule: { kind: 'eq', value: 10 }, why: 'On lost link keep flying an AUTO mission and keep landing; not in pilot modes (there is no pilot)' },
    { param: 'FS_EKF_ACTION', rule: { kind: 'oneOf', values: [1, 3], fix: 1 }, why: 'Position estimate failure: land (never AltHold without a pilot)' },
    { param: 'AUTO_OPTIONS', rule: { kind: 'bitsSet', bits: 3 }, why: 'Arm and take off in AUTO without raising a throttle stick' },
    { param: 'FENCE_ENABLE', rule: { kind: 'eq', value: 1 }, why: 'Geofence on' },
    { param: 'FENCE_TYPE', rule: { kind: 'bitsSet', bits: 3 }, why: 'Fence on maximum altitude and a circle around home' },
    { param: 'FENCE_ACTION', rule: { kind: 'oneOf', values: [1, 3], fix: 1 }, why: 'Fence breach: return to launch (or land)' },
    { param: 'FENCE_ALT_MAX', rule: { kind: 'max', value: 120, fix: 120 }, why: 'Stay under 120 m (check your local limit)' },
    { param: 'RTL_ALT_M', rule: { kind: 'min', value: 10, fix: 15 }, why: 'Return home high enough to clear obstacles' },
    { param: 'BATT_MONITOR', rule: { kind: 'oneOf', values: [3, 4], fix: 4 }, why: 'Battery voltage/current monitored', reboot: true },
    { param: 'BATT_FS_LOW_ACT', rule: { kind: 'oneOf', values: [1, 2, 3], fix: 2 }, why: 'Low battery: land or return to launch' },
    { param: 'BATT_FS_CRT_ACT', rule: { kind: 'oneOf', values: [1, 2, 3, 4, 6], fix: 1 }, why: 'Critical battery: land (never "none" or "terminate")' },
    { param: 'SCR_ENABLE', rule: { kind: 'eq', value: 1 }, why: 'Lua scripting on for the Pi arming gate', reboot: true },
    { param: 'SCR_USER1', rule: { kind: 'eq', value: 0 }, why: 'Pi arming gate not bypassed' },
    { param: 'SCR_USER2', rule: { kind: 'oneOf', values: [1, 2], fix: 1 }, why: 'Pi lost in GUIDED: return to launch' },
    { param: 'MAV_GCS_SYSID', rule: { kind: 'eq', value: gcsSysid }, why: 'Lost-link failsafe watches this ground station' },
    { param: 'BRD_ALT_CONFIG', rule: { kind: 'eq', value: 1 }, why: 'R6/T6 as a UART for the GPS', reboot: true },
  ];
}

export interface BaselineResult {
  item: BaselineItem;
  /** Current FC value, or null if the FC does not have the parameter. */
  current: number | null;
  ok: boolean;
  /** Value to write to pass, or null when ok or the parameter is missing. */
  fix: number | null;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-4;

export function checkItem(item: BaselineItem, current: number | null): BaselineResult {
  if (current === null) return { item, current, ok: false, fix: null };
  const r = item.rule;
  let ok: boolean;
  let fix: number;
  switch (r.kind) {
    case 'eq':
      ok = same(current, r.value);
      fix = r.value;
      break;
    case 'oneOf':
      ok = r.values.some((v) => same(current, v));
      fix = r.fix;
      break;
    case 'bitsSet':
      ok = (Math.trunc(current) & r.bits) === r.bits;
      fix = Math.trunc(current) | r.bits; // keep the user's other bits
      break;
    case 'max':
      ok = current <= r.value + 1e-4;
      fix = r.fix;
      break;
    case 'min':
      ok = current >= r.value - 1e-4;
      fix = r.fix;
      break;
  }
  return { item, current, ok, fix: ok ? null : fix };
}

export function checkBaseline(items: BaselineItem[], read: (param: string) => number | null): BaselineResult[] {
  return items.map((item) => checkItem(item, read(item.param)));
}
