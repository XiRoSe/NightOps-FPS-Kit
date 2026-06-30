import { buildArcfallIsland } from "./arcfall.js";

// MEESEEKS MAYHEM — ARCFALL, re-skinned for Rick & Morty: it's the same island + the 12 arcs + the
// scavenged-weapon economy, but you're RICK (3rd-person, visible, holding a gun) and the guardians are
// Mr. MEESEEKS — regular ones plus HUGE tanky ones. Existing weapons only (Arc Blade + scattered guns).
export const meeseeks = {
  id: "arcfall_rick_and_morty",
  name: "MEESEEKS MAYHEM",
  config: {
    view: "third",                                              // 3rd-person: you see Rick + his gun
    scene: { sky: "day", fog: { color: 0x9a7fb0, near: 240, far: 1300 }, fov: 75 },
    intro: { enabled: true, style: "droppod", spottedCalloutAt: 4.5 }, // same sky-fall drop-pod cinematic + story as the original ARCFALL
    objective: { type: "collect", count: 12 },                  // recover the 12 arcs, same as ARCFALL
    helicopter: { spawnDelay: 99999 },
    // Rick starts with the WHOLE arsenal (Q to cycle) at full ammo; extra ammo caches dot the island to top up
    player: { grenades: 4, startLoadout: ["rifle", "smg", "minigun", "burst", "railgun", "flak", "laser", "plasma", "launcher"] },
    reinforce: "meeseeks",                                      // the sky-drop reinforcements are Meeseeks (mostly regular, some huge)
    messages: { deployHint: "CLICK TO DEPLOY — recover the arcs, survive the Meeseeks", hostileDown: "MEESEEKS POOFED" },
  },

  build(b) {
    buildArcfallIsland(b, { bossKind: "meeseeks" });            // the full ARCFALL island + arcs + weapons, with a HUGE Meeseeks guardian
    // a welcome party near the south-shore drop — a mix of melee swarmers, blaster gunners + a rocketeer
    const party = [[10, 122, "gun"], [-14, 118, "gun"], [22, 104, "rocket"], [-30, 100, "rocket"], [2, 96, "gun"],
                   [36, 110, "gun"], [-44, 106, "rocket"], [16, 108, "gun"], [-6, 112, "gun"]];
    for (const [x, z, weapon] of party) b.enemy({ kind: "meeseeks", x, z, weapon });
    for (const [x, z, weapon] of [[26, 90, "rocket"], [-26, 88, "gun"]]) b.enemy({ kind: "meeseeks", huge: true, x, z, weapon });
    // extra ammo caches dotted across the island (Rick burns through the arsenal fast)
    for (const [x, z] of [[0, 60], [-50, 4], [50, 6], [-30, -40], [42, -42], [-80, 34], [82, 30], [4, -72], [-110, -8], [122, 22], [-22, 130], [62, 112], [102, -50], [-92, 82], [18, 14], [-58, -64]]) b.giftCrate(x, z, "ammo");
  },
};
