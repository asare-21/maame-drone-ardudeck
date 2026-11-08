import { describe, expect, it } from 'vitest';
import { MAV_CMD } from '../../shared/mission-types';
import { parseCoordinates } from './coordinate-mission';

const opts = { defaultAltM: 20, takeoff: true, returnHome: true };

describe('Maame mission from coordinates', () => {
  it('reads a CSV with a header, mixed separators, optional alt and hover, comments', () => {
    const r = parseCoordinates('lat,lon,alt,hover\n51.6501,-0.0801\n51.6505;-0.0805;30\n51.6509\t-0.0809 25 10  # hover 10 s\n', opts);
    expect(r.errors).toEqual([]);
    expect(r.points).toBe(3);
    expect(r.items.map((i) => i.command)).toEqual([
      MAV_CMD.NAV_TAKEOFF, MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_RETURN_TO_LAUNCH,
    ]);
    expect(r.items.map((i) => i.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(r.items[0]!.altitude).toBe(20); // takeoff to the first point's height
    expect(r.items.slice(1, 4).map((i) => [i.altitude, i.param1])).toEqual([[20, 0], [30, 0], [25, 10]]);
  });

  it('can leave out takeoff and return home', () => {
    const r = parseCoordinates('51.65, -0.08', { ...opts, takeoff: false, returnHome: false });
    expect(r.items.map((i) => i.command)).toEqual([MAV_CMD.NAV_WAYPOINT]);
  });

  it('rejects bad lines with their line numbers and returns no mission', () => {
    const r = parseCoordinates('51.65,-0.08\n91,0\nfoo,bar\n51.65,-0.08,500\n0,0\n51.65,-0.08,20,5,9', opts);
    expect(r.items).toEqual([]);
    expect(r.errors).toEqual([
      'line 2: 91, 0 is not a valid position',
      'line 3: "foo,bar" is not "lat, lon[, alt[, hover]]"',
      'line 4: altitude 500 m must be above 0 and at most 120 m',
      'line 5: 0, 0 is not a real position',
      'line 6: expected at most lat, lon, alt, hover',
    ]);
    expect(parseCoordinates('  \n# nothing\n', opts).errors).toEqual(['no coordinates found']);
  });
});
