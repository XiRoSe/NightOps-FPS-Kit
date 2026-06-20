import { COLORS } from "../../engine/builders.js";

// "Sand Viper" — a larger forward operating base: gated approach, motor pool, central HQ,
// and a defended exfil at the rear. Bigger footprint, more guards (some tougher).
export const desertBase = {
  id: "desert-base",
  name: "RAID THE DESERT BASE",
  config: {
    helicopter: { spawnDelay: 12 },                 // longer approach before the gunship
    scene: { fog: { color: 0x0e1626, near: 45, far: 200 } }, // see across the bigger base
  },

  build(b) {
    b.spawnAt(0, 54);
    b.setBounds({ minX: -38.5, maxX: 38.5, minZ: -65.5, maxZ: 57.5 });

    b.desertFloor(170, 16, 90);
    b.road(6, 120, 0, -4); // main road from the gate to the rear

    // ---- perimeter wall (gate gap at the front) ----
    b.wall(-21.5, 57, 37, 1, 3.6, COLORS.concrete);  // front-left
    b.wall(21.5, 57, 37, 1, 3.6, COLORS.concrete);   // front-right (gate gap x≈-3..3)
    b.wall(0, -65, 80, 1, 3.6, COLORS.concrete);     // rear
    b.wall(-38, -4, 1, 124, 3.6, COLORS.concrete);   // west
    b.wall(38, -4, 1, 124, 3.6, COLORS.concrete);    // east
    for (const [x, z] of [[-3, 57], [3, 57]]) b.bollard(x, z); // gate posts

    // ============ APPROACH / CHECKPOINT (z 40..54) ============
    b.sandbags(-6, 46, 6, 0); b.sandbags(6, 46, 6, 0);
    b.vehicle(-15, 49, 0.25, "jeep");
    b.tower(-30, 46); b.tower(30, 46);
    b.enemy({ x: -30, z: 46, y: 4, patrol: [{ x: -30, z: 46 }] });
    b.enemy({ x: 30, z: 46, y: 4, patrol: [{ x: 30, z: 46 }] });
    b.enemy({ x: -9, z: 42, patrol: [{ x: -12, z: 44 }, { x: -5, z: 40 }] });
    b.enemy({ x: 9, z: 42, patrol: [{ x: 12, z: 44 }, { x: 5, z: 40 }] });

    // ============ MOTOR POOL (left, z 8..34) ============
    b.vehicle(-27, 28, 0.3, "truck"); b.vehicle(-31, 15, -0.15, "truck"); b.vehicle(-19, 22, 1.4, "jeep");
    b.fuelTanks(-35, 32, 2);
    b.crateStack(-20, 31, "stack"); b.barrels(-14, 12, 4);
    b.enemy({ x: -26, z: 20, patrol: [{ x: -30, z: 24 }, { x: -20, z: 16 }, { x: -27, z: 28 }] });
    b.enemy({ x: -19, z: 30, patrol: [{ x: -22, z: 32 }, { x: -15, z: 28 }] });

    // ============ STORAGE (right, z 8..34) ============
    b.building(27, 24, 11, 9);
    b.crateStack(20, 14, "pair"); b.sandbags(29, 9, 6, Math.PI / 2); b.barrels(33, 26, 3);
    b.enemy({ x: 24, z: 17, patrol: [{ x: 28, z: 14 }, { x: 20, z: 20 }] });
    b.enemy({ x: 31, z: 28, patrol: [{ x: 33, z: 30 }, { x: 28, z: 26 }] });

    // ============ CENTRAL HQ + YARD (z -22..6) ============
    b.building(0, -8, 16, 11, 4.0, COLORS.concrete); // HQ — doorway faces the approach
    b.bunker(-24, -4); b.bunker(24, -6);
    b.crateStack(-9, 3, "stack"); b.crateStack(9, 3, "pair");
    b.sandbags(0, 6, 9, 0); b.barrels(13, -2, 4); b.barrels(-13, -2, 3);
    // tougher HQ guards
    b.enemy({ x: -7, z: -1, hp: 140, speed: 2.6, patrol: [{ x: -11, z: 2 }, { x: -4, z: -4 }, { x: -8, z: 4 }] });
    b.enemy({ x: 7, z: -1, hp: 140, speed: 2.6, patrol: [{ x: 11, z: 2 }, { x: 4, z: -4 }, { x: 8, z: 4 }] });
    b.enemy({ x: 0, z: -16, hp: 140, patrol: [{ x: -5, z: -16 }, { x: 5, z: -16 }] });
    b.tower(-32, -10); b.tower(32, -10);
    b.enemy({ x: -32, z: -10, y: 4, patrol: [{ x: -32, z: -10 }] });
    b.enemy({ x: 32, z: -10, y: 4, patrol: [{ x: 32, z: -10 }] });

    // ============ EXFIL (rear, z -62..-26) ============
    b.objective(0, -60, 3.5);
    b.sandbags(0, -52, 10, 0);
    b.crateStack(-12, -50, "pair"); b.crateStack(12, -52, "stack");
    b.barrels(-22, -58, 3); b.barrels(22, -54, 2);
    b.vehicle(-16, -44, 0.6, "truck");
    // elite rear guard
    b.enemy({ x: -10, z: -50, hp: 160, speed: 2.7, patrol: [{ x: -14, z: -48 }, { x: -6, z: -53 }] });
    b.enemy({ x: 10, z: -50, hp: 160, speed: 2.7, patrol: [{ x: 14, z: -48 }, { x: 6, z: -53 }] });
    b.enemy({ x: 0, z: -58, hp: 160, patrol: [{ x: -4, z: -58 }, { x: 4, z: -58 }] });
    b.tower(-33, -58); b.tower(33, -58);
    b.enemy({ x: -33, z: -58, y: 4, patrol: [{ x: -33, z: -58 }] });
    b.enemy({ x: 33, z: -58, y: 4, patrol: [{ x: 33, z: -58 }] });

    // ---- lighting ----
    b.floodlight(-37, 40, 5.6, -20, 30);
    b.floodlight(37, 40, 5.6, 20, 30);
    b.floodlight(-37, -30, 5.6, -18, -20);
    b.floodlight(37, -30, 5.6, 18, -20);
    b.floodlight(-30, 46, 6.4, 0, 30, true);   // tower searchlights (sweep)
    b.floodlight(30, 46, 6.4, 0, 30, true);
    b.floodlight(-32, -10, 6.4, 0, -10, true);
    b.floodlight(32, -10, 6.4, 0, -10, true);

    // ---- perimeter dressing ----
    b.fence(-38, 57, -38, -65); b.fence(38, 57, 38, -65);
    b.powerLine([[-37, 50], [-37, 20], [-37, -12], [-37, -44], [-37, -64]]);
    b.powerLine([[37, 50], [37, 20], [37, -12], [37, -44], [37, -64]]);
  },
};
