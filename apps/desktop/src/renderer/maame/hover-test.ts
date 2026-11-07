/**
 * Maame hover test: a three-item AUTO mission the FC flies by itself -
 * take off to a low height, hover in place, land in place. Flown as a mission
 * (not GUIDED) so the GCS-loss failsafe lets it finish and land on its own.
 */
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../shared/mission-types';
import { buildArduPilotWireMission } from '../../shared/mission-wire';

export const HOVER_HEIGHTS_M = [0.5, 1] as const;
export const HOVER_HOLD_S = { min: 5, max: 10 } as const;

export interface HoverTestPlan {
  heightM: number;
  holdS: number;
  lat: number;
  lon: number;
}

/** Why the plan cannot be flown, or null when it is fine. */
export function hoverTestProblem(p: HoverTestPlan): string | null {
  if (!HOVER_HEIGHTS_M.includes(p.heightM as (typeof HOVER_HEIGHTS_M)[number])) return 'height must be 0.5 m or 1 m';
  if (!(p.holdS >= HOVER_HOLD_S.min && p.holdS <= HOVER_HOLD_S.max)) return `hover time must be ${HOVER_HOLD_S.min}-${HOVER_HOLD_S.max} s`;
  if (!p.lat || !p.lon || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return 'no GPS position';
  return null;
}

function item(command: number, p: HoverTestPlan, extra: Partial<MissionItem> = {}): MissionItem {
  return {
    seq: 0, frame: MAV_FRAME.GLOBAL_RELATIVE_ALT, command, current: false, autocontinue: true,
    param1: 0, param2: 0, param3: 0, param4: 0,
    latitude: p.lat, longitude: p.lon, altitude: p.heightM,
    ...extra,
  };
}

/** Wire mission (HOME + takeoff, hover, land) ready for uploadMission. Throws on a bad plan. */
export function hoverTestMission(p: HoverTestPlan): MissionItem[] {
  const problem = hoverTestProblem(p);
  if (problem) throw new Error(`Hover test: ${problem}`);
  return buildArduPilotWireMission(
    [
      item(MAV_CMD.NAV_TAKEOFF, p),
      item(MAV_CMD.NAV_LOITER_TIME, p, { param1: p.holdS }), // hover here for holdS seconds
      item(MAV_CMD.NAV_LAND, p, { altitude: 0 }), // land right here, then ArduPilot disarms
    ],
    { lat: p.lat, lon: p.lon, alt: 0 },
  );
}
