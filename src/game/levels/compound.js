import { COLORS } from "../../engine/builders.js";

// "Clear the Compound" — the original level: a small 3-zone walled compound.
export const compound = {
  id: "compound",
  name: "CLEAR THE COMPOUND",
  config: {}, // uses the base config as-is

  build(b) {
    b.spawnAt(0, 16);
    b.setBounds({ minX: -16.4, maxX: 16.4, minZ: -19.4, maxZ: 18.4 });

    b.desertFloor(80, 10, 30);
    b.road(5, 40, 0, -1); // central dirt road toward exfil

    // ---- perimeter walls ----
    b.wall(0, 19, 34, 1, 3.4, COLORS.concrete);     // south (behind spawn)
    b.wall(0, -19.5, 34, 1, 3.4, COLORS.concrete);  // north
    b.wall(-16.5, 0, 1, 39, 3.4, COLORS.concrete);  // west
    b.wall(16.5, 0, 1, 39, 3.4, COLORS.concrete);   // east

    // ---- zone dividers with doorways ----
    b.wall(-7.5, 8, 17, 1, 3.2, COLORS.wall);
    b.wall(11, 8, 11, 1, 3.2, COLORS.wall);
    b.wall(7.5, -6, 17, 1, 3.2, COLORS.wall);
    b.wall(-11, -6, 11, 1, 3.2, COLORS.wall);
    for (const [x, z] of [[2, 8], [5.5, 8], [-5.5, -6], [-2, -6]]) b.bollard(x, z);

    // ZONE A: start
    b.crateStack(-9, 13, "stack"); b.crateStack(9, 14, "pair");
    b.barrels(-11, 10, 3); b.sandbags(-2, 11.5, 4, 0);
    b.enemy({ x: -6, z: 11, patrol: [{ x: -10, z: 12 }, { x: -2, z: 10 }, { x: -6, z: 14 }] });
    b.enemy({ x: 8, z: 11, patrol: [{ x: 11, z: 12 }, { x: 5, z: 10 }] });

    // ZONE B: yard
    b.bunker(-9, 1);
    b.crateStack(7, 3, "stack"); b.crateStack(-2, -2, "pair");
    b.barrels(11, 0, 4); b.sandbags(2, 5, 5, 0); b.sandbags(-6, -3, 4, Math.PI / 2);
    b.enemy({ x: 5, z: 4, patrol: [{ x: 9, z: 5 }, { x: 2, z: 2 }, { x: 6, z: -2 }] });
    b.enemy({ x: -3, z: -1, patrol: [{ x: -6, z: 2 }, { x: 0, z: -3 }, { x: -2, z: 4 }] });
    b.enemy({ x: 11, z: -3, patrol: [{ x: 13, z: -1 }, { x: 9, z: -4 }] });
    b.enemy({ x: -12, z: -3, patrol: [{ x: -13, z: 0 }, { x: -11, z: -4 }, { x: -13, z: -3 }] });
    b.enemy({ x: 2, z: 0, patrol: [{ x: 4, z: 2 }, { x: 0, z: -1 }, { x: 3, z: 1 }] });

    // ZONE C: exfil
    b.objective(0, -16, 3.0);
    b.sandbags(0, -10, 6, 0);
    b.crateStack(-9, -13, "pair"); b.crateStack(9, -14, "stack");
    b.barrels(-12, -16, 3); b.barrels(12, -10, 2);
    b.enemy({ x: -7, z: -12, patrol: [{ x: -10, z: -10 }, { x: -4, z: -13 }, { x: -8, z: -16 }] });
    b.enemy({ x: 7, z: -12, patrol: [{ x: 10, z: -10 }, { x: 4, z: -13 }, { x: 8, z: -16 }] });
    b.enemy({ x: 0, z: -17, patrol: [{ x: -3, z: -17 }, { x: 3, z: -17 }] });

    // watchtowers + posted guards
    b.tower(-15, -17); b.tower(15, 12);
    b.enemy({ x: -15, z: -17, y: 4, patrol: [{ x: -15, z: -17 }] });
    b.enemy({ x: 15, z: 12, y: 4, patrol: [{ x: 15, z: 12 }] });

    // floodlights (2 static + 2 sweeping tower lights)
    b.floodlight(-16, 16, 5.2, -4, 8);
    b.floodlight(16, -18, 5.2, 4, -10);
    b.floodlight(-15, -17, 6.2, 0, -8, true);
    b.floodlight(15, 12, 6.2, 2, 4, true);

    // power lines down both sides
    b.powerLine([[-16, 17], [-16, 4], [-16, -10], [-16, -18]]);
    b.powerLine([[16, 17], [16, 4], [16, -10], [16, -18]]);
  },
};
