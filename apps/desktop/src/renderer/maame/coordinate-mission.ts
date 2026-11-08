/**
 * Maame mission from coordinates: one point per line, "lat, lon[, alt m[, hover s]]"
 * (comma, semicolon, tab or space separated; header rows and # comments skipped).
 * Pure, so it is tested; MaameCoordinateMissionCard turns the result into the plan.
 */
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../shared/mission-types';

export interface CoordinateOptions {
  defaultAltM: number;
  /** Take off to the first point's height before the first waypoint. */
  takeoff: boolean;
  /** Return to launch (and land) after the last waypoint. */
  returnHome: boolean;
}

export interface CoordinateParse {
  items: MissionItem[];
  points: number;
  errors: string[];
}

const MAX_ALT_M = 120; // UK open-category ceiling; the fence check still applies on top

function item(command: number, lat: number, lon: number, alt: number, param1 = 0): MissionItem {
  return {
    seq: 0, frame: MAV_FRAME.GLOBAL_RELATIVE_ALT, command, current: false, autocontinue: true,
    param1, param2: 0, param3: 0, param4: 0, latitude: lat, longitude: lon, altitude: alt,
  };
}

export function parseCoordinates(text: string, o: CoordinateOptions): CoordinateParse {
  const errors: string[] = [];
  const points: MissionItem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const cells = line.split(/[,;\t ]+/).filter(Boolean);
    const nums = cells.map(Number);
    if (nums.slice(0, 2).some(Number.isNaN)) {
      if (points.length === 0 && errors.length === 0 && /[a-z]/i.test(line)) return; // header row
      errors.push(`line ${i + 1}: "${raw.trim()}" is not "lat, lon[, alt[, hover]]"`);
      return;
    }
    const [lat, lon, alt = o.defaultAltM, hold = 0] = nums as [number, number, number?, number?];
    if (cells.length > 4 || Number.isNaN(alt) || Number.isNaN(hold)) errors.push(`line ${i + 1}: expected at most lat, lon, alt, hover`);
    else if (Math.abs(lat) > 90 || Math.abs(lon) > 180) errors.push(`line ${i + 1}: ${lat}, ${lon} is not a valid position`);
    else if (lat === 0 && lon === 0) errors.push(`line ${i + 1}: 0, 0 is not a real position`);
    else if (!(alt > 0 && alt <= MAX_ALT_M)) errors.push(`line ${i + 1}: altitude ${alt} m must be above 0 and at most ${MAX_ALT_M} m`);
    else if (!(hold >= 0 && hold <= 600)) errors.push(`line ${i + 1}: hover ${hold} s must be 0-600`);
    else points.push(item(MAV_CMD.NAV_WAYPOINT, lat, lon, alt, hold));
  });
  if (points.length === 0 && errors.length === 0) errors.push('no coordinates found');
  if (errors.length) return { items: [], points: points.length, errors };

  const items = [
    ...(o.takeoff ? [item(MAV_CMD.NAV_TAKEOFF, 0, 0, points[0]!.altitude)] : []),
    ...points,
    ...(o.returnHome ? [item(MAV_CMD.NAV_RETURN_TO_LAUNCH, 0, 0, 0)] : []),
  ].map((it, seq) => ({ ...it, seq }));
  return { items, points: points.length, errors: [] };
}
