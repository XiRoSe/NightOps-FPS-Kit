// ARCFALL — a sculpted daytime island: parachute in, hunt the 12 lost arcs, survive the monsters and
// giant robots guarding them. A different game on the same engine/kit (Fortnite-drop × Helldivers-solo).
export const arcfall = {
  id: "arcfall",
  name: "ARCFALL",
  config: {
    scene: { sky: "day", fog: { color: 0x9a7fb0, near: 240, far: 1300 }, fov: 75 }, // purple horizon haze; far enough to read the open ocean
    intro: { enabled: true, style: "droppod", spottedCalloutAt: 4.5 },
    objective: { type: "collect", count: 12 },
    helicopter: { spawnDelay: 99999 }, // no gunship boss on the island (for now)
    player: { grenades: 4 },
    messages: { deployHint: "DROP POD INBOUND — click to skip" },
  },

  build(b) {
    b.spawnAt(0, 156);   // dry south shore (terrain ~1.4) just above the waterline — close to the sea, not in it
    b.setBounds({ minX: -320, maxX: 320, minZ: -320, maxZ: 320 }); // extends into the sea so you can swim around the island
    b.lake(-46, 20, 18, 1.5); b.lake(70, -64, 22, 1.6); b.lake(30, 90, 16, 1.4); // shallow wadeable lakes (carved first)
    b.lake(-78, 50, 20, 1.7); // the Saurian Brood's forest pond (NW)
    b.islandTerrain({ size: 460 });   // hills → beach → sea → distant mountains
    b.scatterTrees(150, 20, 198);     // GLB forest (birch + palms), seated on the terrain (perf-tuned)
    b.scatterRocks(46, 24, 200);      // GLB rocks (cover + dressing)
    b.palace(40, -64);          // grand temple you can climb the stairs into (glowing relic inside)
    // structures from across the ages, scattered for landmarks + cover
    b.ruin(-44, 82); b.ruin(76, 44); b.ruin(8, -110); b.ruin(-128, 30);
    b.hut(-92, 8); b.hut(52, -92); b.hut(-18, -82); b.hut(104, 8); b.hut(-70, -88);
    b.obelisk(112, -52); b.obelisk(-112, -12); b.obelisk(20, 110); b.obelisk(64, 96); b.obelisk(-96, 70);

    // ── THEMED REGIONS — different look per tribe's territory ──
    // NW · SAURIAN FOREST — a dense ring of trees around the forest pond
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2 + i, r = 26 + (i % 4) * 12; b.tree(-78 + Math.cos(a) * r, 50 + Math.sin(a) * r, 0.9 + (i % 3) * 0.22); }
    // NE · IRON LEGION TECH-CITY — clustered towers (obelisks) + ruined hulls (ruins)
    for (const [x, z] of [[96, 40], [112, 58], [84, 66], [120, 32], [100, 76], [128, 50]]) b.obelisk(x, z);
    b.ruin(106, 48); b.ruin(120, 66);
    // SE · HOLLOW WATCH FLATS — sparse lookout posts (kept open) — extra rocks for cover
    for (const [x, z] of [[80, -48], [56, -82], [100, -56]]) b.rock(x, z, 1.6);
    b.car(9, 13, "racefuture"); b.car(-12, 7, "sportscar"); b.car(2, -15, "race"); // fast sports cars in the clear drop zone (press E)

    // the 12 lost arcs, scattered wide (each beams to the sky so it's findable from a hilltop)
    const arcs = [[0, -44], [44, -22], [-38, -26], [74, 22], [-68, 16], [32, 58],
                  [-44, 64], [90, -58], [-86, -52], [118, 42], [-118, -32], [16, 96]];
    for (const [x, z] of arcs) b.arc(x, z);

    // ── EVERY ARC IS GUARDED by its region's tribe — guardians ring the Arc within ~22m (the story) ──
    const quad = (x, z) => (x < 0 ? (z >= 0 ? "NW" : "SW") : (z >= 0 ? "NE" : "SE"));
    const TRIBES = {
      NW: [{ kind: "monster" }, { kind: "monster" }, { kind: "monster" }],   // Saurian Brood (beasts)
      NE: [{ kind: "heavy" }, { kind: "robot" }],                            // Iron Legion (war machines)
      SE: [{ kind: "sentry" }, { kind: "drone" }],                          // Hollow Watch (sentinels)
      SW: [{ hp: 100, speed: 2.6 }, { hp: 100, speed: 2.6 }],               // Vault Garrison (soldiers)
    };
    for (const [ax, az] of arcs) {
      const specs = TRIBES[quad(ax, az)];
      specs.forEach((s, i) => {
        const ang = (ax * 0.7 + az * 1.3) + (i / specs.length) * Math.PI * 2, rr = 12 + (i % 3) * 5; // 12-22m out
        let gx = ax + Math.cos(ang) * rr, gz = az + Math.sin(ang) * rr;
        const dS = Math.hypot(gx, gz); // keep a wide clear landing bubble so nothing engages at spawn
        if (dS < 58) { const m = 58 / (dS || 1); gx *= m; gz *= m; }
        b.enemy({ ...s, x: gx, z: gz });
      });
    }
    b.enemy({ kind: "trex", x: -58, z: 30 });   // the Saurian Brood's apex predator, prowling the NW arcs
    // THE GUARDIAN — a colossal boss mech standing in the OPEN before the palace stairs (clear of the
    // structure), guarding the approach + the nearby SE arc (the finale)
    b.enemy({ kind: "robot", x: 44, z: -24, hp: 1600, scale: 2.0, boss: true });

    // gift crates (loot: ammo / health / grenades + two sci-fi weapons to find)
    b.giftCrate(8, -22, "ammo"); b.giftCrate(-22, 27, "health"); b.giftCrate(48, 42, "grenade");
    b.giftCrate(-62, -16, "ammo"); b.giftCrate(96, 12, "health"); b.giftCrate(-100, -26, "grenade");
    // ammo caches spread across every region — collect them to resupply ALL weapons
    for (const [x, z] of [[-84, 58], [108, 50], [86, -64], [-96, -46], [20, 98], [56, 8], [-40, -64]]) b.giftCrate(x, z, "ammo");
    b.giftCrate(24, 14, "plasma");   // PLASMA CANNON near the drop
    b.giftCrate(-50, 70, "laser");   // LASER RIFLE out by the lake
    b.giftCrate(64, 30, "shotgun");  // PULSE SHOTGUN
  },
};
