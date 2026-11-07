/**
 * Maame mission safety check, before launch: no waypoint above the fence
 * ceiling or outside the fence (horizontal check is utils/fence-check), return
 * height under the ceiling, and enough battery to fly it and come home.
 * Pure: MaameFlightCard feeds it the planned mission, home and FC parameters.
 */
import { MAV_CMD, type MissionItem } from '../../shared/mission-types';

export const MAAME_PACK_MAH = 10_000;
/** Share of the pack a mission may plan to use; the rest is the landing reserve. */
export const USABLE_FRACTION = 0.7;
/**
 * shortcut: estimated hover current of the 6S 10 Ah Maame (~25 A for a ~3 kg 10" quad);
 * replace with the average current measured in the first real hover test.
 */
export const HOVER_CURRENT_A = 25;

const NAV_WITH_POSITION = new Set<number>([
  MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_LOITER_UNLIM, MAV_CMD.NAV_LOITER_TURNS, MAV_CMD.NAV_LOITER_TIME,
  MAV_CMD.NAV_LAND, MAV_CMD.NAV_TAKEOFF, MAV_CMD.NAV_SPLINE_WAYPOINT,
]);

export interface MissionCheckInput {
  items: MissionItem[];
  home: { lat: number; lon: number } | null;
  /** FC parameter value, or null when not loaded. */
  param: (name: string) => number | null;
  /** Horizontal fence verdict for a point (circle + polygons), null when inside. */
  outsideFence: (lat: number, lon: number) => string | null;
}

export interface MissionCheck {
  ok: boolean;
  problems: string[];
  /** Estimated flight time, launch to touchdown at home. */
  minutes: number;
  /** Estimated share of the pack the flight uses (0-1). */
  packUse: number;
}

function metres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function checkMission({ items, home, param, outsideFence }: MissionCheckInput): MissionCheck {
  if (!home || (!home.lat && !home.lon)) return { ok: false, problems: ['no home position yet (needs GPS)'], minutes: 0, packUse: 0 };
  const problems: string[] = [];
  const altMax = param('FENCE_ENABLE') === 1 && (param('FENCE_TYPE') ?? 0) & 1 ? param('FENCE_ALT_MAX') : null;
  const rtlAlt = param('RTL_ALT_M');
  const speed = (param('WPNAV_SPEED') ?? 1000) / 100; // m/s
  const up = (param('WPNAV_SPEED_UP') ?? 250) / 100;
  const down = (param('LAND_SPEED') ?? 50) / 100;

  if (altMax !== null && rtlAlt !== null && rtlAlt >= altMax) {
    problems.push(`return height (RTL_ALT_M ${rtlAlt} m) is at or above the fence ceiling ${altMax} m`);
  }

  let seconds = 0;
  let at = { lat: home.lat, lon: home.lon, alt: 0 };
  let endsLanded = false;
  const fly = (lat: number, lon: number, alt: number) => {
    const climb = alt - at.alt;
    seconds += metres(at.lat, at.lon, lat, lon) / speed + (climb > 0 ? climb / up : -climb / down);
    at = { lat, lon, alt };
  };
  items.forEach((it, i) => {
    if (it.command === MAV_CMD.NAV_RETURN_TO_LAUNCH) {
      fly(home.lat, home.lon, 0);
      endsLanded = true;
      return;
    }
    if (!NAV_WITH_POSITION.has(it.command)) return;
    const lat = it.latitude || at.lat; // 0,0 means "where it is now" in ArduPilot
    const lon = it.longitude || at.lon;
    const alt = it.command === MAV_CMD.NAV_LAND ? 0 : it.altitude || at.alt;
    if (altMax !== null && alt >= altMax) problems.push(`item ${i + 1}: ${alt} m is at or above the fence ceiling ${altMax} m`);
    const fence = outsideFence(lat, lon);
    if (fence) problems.push(`item ${i + 1}: ${fence}`);
    fly(lat, lon, alt);
    if (it.command === MAV_CMD.NAV_LOITER_TIME || it.command === MAV_CMD.NAV_WAYPOINT) seconds += Math.max(it.param1, 0);
    endsLanded = it.command === MAV_CMD.NAV_LAND;
  });
  if (!endsLanded) fly(home.lat, home.lon, 0); // the failsafe brings it home anyway

  const mah = (seconds / 3600) * HOVER_CURRENT_A * 1000 * 1.15; // +15% for forward flight and wind
  const packUse = mah / (param('BATT_CAPACITY') || MAAME_PACK_MAH);
  if (packUse > USABLE_FRACTION) {
    problems.push(`needs about ${Math.round(packUse * 100)}% of the battery (limit ${USABLE_FRACTION * 100}%)`);
  }
  return { ok: problems.length === 0, problems, minutes: seconds / 60, packUse };
}
