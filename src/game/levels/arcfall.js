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
    b.scatterTrees(110, 20, 198);     // GLB forest (birch + palms), seated on the terrain (perf-tuned)
    b.scatterRocks(46, 24, 200);      // GLB rocks (cover + dressing)
    b.palace(40, -64);          // grand temple you can climb the stairs into (glowing relic inside)
    // structures from across the ages, scattered for landmarks + cover
    b.ruin(-44, 82); b.ruin(76, 44); b.ruin(8, -110); b.ruin(-128, 30);
    b.hut(-92, 8); b.hut(52, -92); b.hut(-18, -82); b.hut(104, 8); b.hut(-70, -88);
    b.obelisk(112, -52); b.obelisk(-112, -12); b.obelisk(20, 110); b.obelisk(64, 96); b.obelisk(-96, 70);

    // ── SECTION BARRIERS — each tribe's territory is ringed (with wide GATEWAYS) so the sections read clearly ──
    b.sectionForest(-68, 46, 46, 4);   // NW · SAURIAN BROOD — thick encircling forest (around the pond)
    b.sectionWalls(92, 54, 58, 4);     // NE · IRON LEGION — ancient crenellated walls (a walled war-city)
    b.sectionPylons(66, -44, 48, 3);   // SE · HOLLOW WATCH — glowing sentinel pylons
    b.sectionWalls(-84, -40, 48, 3);   // SW · VAULT GARRISON — ancient fort walls
    // the Iron Legion's inner tech-city: towers + a ruined hull inside the walls
    for (const [x, z] of [[96, 40], [112, 58], [84, 66], [100, 76]]) b.obelisk(x, z);
    b.ruin(106, 48);
    b.car(9, 13, "racefuture"); b.car(-12, 7, "sportscar"); b.car(2, -15, "race"); // fast sports cars in the clear drop zone (press E)

    // the 12 lost arcs, scattered wide (each beams to the sky so it's findable from a hilltop)
    const arcs = [[0, -44], [44, -22], [-38, -26], [74, 22], [-68, 16], [32, 58],
                  [-44, 64], [90, -58], [-86, -52], [118, 42], [-118, -32], [16, 96]];
    for (const [x, z] of arcs) b.arc(x, z);

    // No pre-placed enemies — the island starts empty; reinforcements DROP from the sky every 5s into a
    // rotating section (handled in main._dropReinforcement). THE GUARDIAN boss waits at the palace as the finale.
    b.enemy({ kind: "robot", x: 44, z: -24, hp: 1600, scale: 2.0, boss: true });

    // gift crates (loot: ammo / health / grenades + two sci-fi weapons to find)
    b.giftCrate(8, -22, "ammo"); b.giftCrate(-22, 27, "health"); b.giftCrate(48, 42, "grenade");
    b.giftCrate(-62, -16, "ammo"); b.giftCrate(96, 12, "health"); b.giftCrate(-100, -26, "grenade");
    // ammo caches spread across every region — collect them to resupply ALL weapons
    for (const [x, z] of [[-84, 58], [108, 50], [86, -64], [-96, -46], [20, 98], [56, 8], [-40, -64]]) b.giftCrate(x, z, "ammo");
    // health packs (first-aid kits) + armor plates scattered widely — both are scarce
    for (const [x, z] of [[30, 60], [-60, 30], [80, -20], [-30, -70], [110, 70], [-110, 10], [10, 130], [-20, -10]]) b.giftCrate(x, z, "health");
    for (const [x, z] of [[50, 20], [-70, -20], [95, 35], [-40, 75], [25, -60], [-100, 50]]) b.giftCrate(x, z, "armor");
    b.giftCrate(24, 14, "plasma");   // PLASMA CANNON near the drop
    b.giftCrate(-50, 70, "laser");   // LASER RIFLE out by the lake
  },
};
