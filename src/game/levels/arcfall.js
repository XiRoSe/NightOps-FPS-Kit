// ARCFALL — a sculpted daytime island: parachute in, hunt the 12 lost arcs, survive the monsters and
// giant robots guarding them. A different game on the same engine/kit (Fortnite-drop × Helldivers-solo).
export const arcfall = {
  id: "arcfall",
  name: "ARCFALL",
  config: {
    scene: { sky: "day", fog: { color: 0xbfe0f4, near: 160, far: 700 }, fov: 75 },
    intro: { enabled: true, style: "parachute", spottedCalloutAt: 4.5 },
    objective: { type: "collect", count: 12 },
    helicopter: { spawnDelay: 99999 }, // no gunship boss on the island (for now)
    player: { grenades: 4 },
    messages: { deployHint: "PARACHUTE DROP — click to skip" },
  },

  build(b) {
    b.spawnAt(0, 0);
    b.setBounds({ minX: -205, maxX: 205, minZ: -205, maxZ: 205 });
    b.lake(-46, 20, 18, 1.5); b.lake(70, -64, 22, 1.6); b.lake(30, 90, 16, 1.4); // shallow wadeable lakes (carved first)
    b.islandTerrain({ size: 460 });   // hills → beach → sea → distant mountains
    b.scatterTrees(260, 20, 198);     // thick GLB forest (birch + palms), seated on the terrain
    b.scatterRocks(55, 26, 198);      // GLB rocks (cover + dressing)
    b.palace(40, -64);          // grand temple you can climb the stairs into (glowing relic inside)
    b.lookout(-58, 30);         // a climbable lookout for high ground / sniping
    // structures from across the ages, scattered for landmarks + cover
    b.ruin(-44, 82); b.ruin(76, 44);
    b.hut(-92, 8); b.hut(52, -92); b.hut(-18, -82);
    b.obelisk(112, -52); b.obelisk(-112, -12); b.obelisk(20, 110);
    b.car(9, 13, "racefuture"); b.car(-12, 7, "sportscar"); b.car(2, -15, "race"); // fast sports cars in the clear drop zone (press E)

    // the 12 lost arcs, scattered wide (each beams to the sky so it's findable from a hilltop)
    const arcs = [[0, -44], [44, -22], [-38, -26], [74, 22], [-68, 16], [32, 58],
                  [-44, 64], [90, -58], [-86, -52], [118, 42], [-118, -32], [16, 96]];
    for (const [x, z] of arcs) b.arc(x, z);

    // gift crates (loot: ammo / health / grenades + two sci-fi weapons to find)
    b.giftCrate(8, -22, "ammo"); b.giftCrate(-22, 27, "health"); b.giftCrate(48, 42, "grenade");
    b.giftCrate(-62, -16, "ammo"); b.giftCrate(96, 12, "health"); b.giftCrate(-100, -26, "grenade");
    b.giftCrate(24, 14, "plasma");   // PLASMA CANNON near the drop
    b.giftCrate(-50, 70, "arc");     // ARC LANCE out by the lake

    // hostiles — kept clear of the ~55m drop zone, spread around the island so you pick your fights
    const raptors = [[62, -34], [-72, 22], [42, 84], [-54, -74], [98, 44]];   // 5 raptors, well spread
    for (const [x, z] of raptors) b.enemy({ kind: "monster", x, z });
    const spiders = [[-92, -32], [82, -72], [-32, 98], [112, -12]];           // 4 spiders elsewhere
    for (const [x, z] of spiders) b.enemy({ kind: "spider", x, z });
    b.enemy({ kind: "trex", x: -122, z: 70 });   // T-Rex mini-boss roaming the far side
    // robots — ranged, non-dino: walking gun-bots, hovering drones, a heavy, and the giant mech
    const sentries = [[70, 10], [-40, -60], [20, -90]];
    for (const [x, z] of sentries) b.enemy({ kind: "sentry", x, z });
    const drones = [[-20, 64], [86, -20]];
    for (const [x, z] of drones) b.enemy({ kind: "drone", x, z });
    b.enemy({ kind: "heavy", x: -96, z: 30 });   // tanky gun-bot
    b.enemy({ kind: "robot", x: 126, z: 56 });   // giant mech guarding a far arc
  },
};
