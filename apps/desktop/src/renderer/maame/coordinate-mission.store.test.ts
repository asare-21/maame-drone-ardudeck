import { describe, expect, it } from 'vitest';
import { MAV_CMD } from '../../shared/mission-types';
import { buildArduPilotWireMission } from '../../shared/mission-wire';
import { fcSeqOffsetNow, useMissionStore } from '../stores/mission-store';
import { parseCoordinates } from './coordinate-mission';

describe('coordinate mission into the planner', () => {
  it('keeps the takeoff: the HOME slot added for ArduPilot is the one the store strips', () => {
    const { items } = parseCoordinates('51.65,-0.08\n51.651,-0.081', { defaultAltM: 20, takeoff: true, returnHome: true });
    const wire = fcSeqOffsetNow() ? buildArduPilotWireMission(items, { lat: 51.6, lon: -0.07, alt: 0 }) : items;
    useMissionStore.getState().setMissionItems(wire);
    const planned = useMissionStore.getState().missionItems.map((i) => i.command);
    expect(planned).toEqual([MAV_CMD.NAV_TAKEOFF, MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_RETURN_TO_LAUNCH]);
  });
});
