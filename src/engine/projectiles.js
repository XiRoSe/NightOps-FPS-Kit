import * as THREE from "three";

// A ballistic explosive projectile (grenade or rocket) — an engine-level reusable mechanic.
// Travels under gravity, bounces/sticks on the ground and walls, and detonates on a fuse
// (or on contact, for rockets). The owner decides what happens on detonation.
export class Projectile {
  constructor(scene, mesh, pos, vel, opts = {}) {
    this.scene = scene;
    this.mesh = mesh;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.gravity = opts.gravity ?? 18;
    this.fuse = opts.fuse ?? 2.0;            // seconds to auto-detonate
    this.bounce = opts.bounce ?? 0.4;        // ground restitution (grenades)
    this.detonateOnHit = opts.detonateOnHit ?? false; // rockets blow on contact
    this.spin = opts.spin ?? false;
    this.done = false;
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, level) {
    this.vel.y -= this.gravity * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const ny = this.pos.y + this.vel.y * dt;

    // hit a structure?
    if (level && level.colliders) {
      for (const c of level.colliders) {
        const inAABB = nx > c.minX - 0.2 && nx < c.maxX + 0.2 && nz > c.minZ - 0.2 && nz < c.maxZ + 0.2;
        if (!inAABB) continue;
        // rockets treat tall things (walls/towers/buildings, top>=2.8) as full-height so they always
        // detonate on them; grenades only collide below the top so they can be lobbed over walls.
        const tall = c.top >= 2.8;
        const blocks = this.detonateOnHit ? (tall || (c.top > 1.2 && ny < c.top)) : (c.top > 1.2 && ny < c.top);
        if (blocks) {
          if (this.detonateOnHit) { this.pos.set(nx, Math.max(0.2, ny), nz); this.done = true; return; }
          this.vel.x *= -0.4; this.vel.z *= -0.4; // grenade bounces off
          break;
        }
      }
    }

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;

    // land on the ACTUAL terrain surface (sculpted island), not a flat plane — so grenades bounce/explode on hills
    const gy = (level && level.terrainHeight) ? Math.max(level.terrainHeight(this.pos.x, this.pos.z), level.seaLevel ?? 0) : 0;
    const floor = gy + 0.14;
    if (this.pos.y <= floor) {
      this.pos.y = floor;
      if (this.detonateOnHit) { this.done = true; }
      else { this.vel.y *= -this.bounce; this.vel.x *= 0.6; this.vel.z *= 0.6; }
    }
    this.mesh.position.copy(this.pos);
    if (this.spin) this.mesh.rotation.x += dt * 9;

    this.fuse -= dt;
    if (this.fuse <= 0) this.done = true;
  }

  dispose() { this.scene.remove(this.mesh); }
}

// --- impact system ---------------------------------------------------------
// Given a blast at `center` and a target position, compute the damage + knockback
// IMPULSE with proper distance falloff (sharp near the centre, nothing past the radius).
// Returns null if the target is out of range.
export function blastAt(center, pos, { radius, damage, power }) {
  const dx = pos.x - center.x, dz = pos.z - center.z;
  const dist = Math.hypot(dx, dz);
  if (dist > radius) return null;
  const f = 1 - dist / radius;        // 1 at centre -> 0 at edge
  const falloff = f * f;              // quadratic: close blasts hit much harder
  const nx = dist > 0.01 ? dx / dist : (Math.random() - 0.5);
  const nz = dist > 0.01 ? dz / dist : (Math.random() - 0.5);
  const mag = power * falloff * 0.6;     // horizontal shove
  const up = power * falloff + 2;        // strong vertical pop -> a real arc
  return { dmg: damage * (0.4 + 0.6 * falloff), falloff, impulse: new THREE.Vector3(nx * mag, up, nz * mag) };
}

// Apply an explosion to enemies (damage + launch), the helicopter (damage), and any dynamic
// props (pushed by impulse / their mass — heavy or unregistered objects don't move).
export function applyBlast(center, opts, enemies, heli, dynamics) {
  for (const e of enemies) {
    if (e.dead) continue;
    const r = blastAt(center, e.pos, opts);
    if (!r) continue;
    e.takeDamage(r.dmg);
    if (e.dead) { if (e.applyImpulse) e.applyImpulse(r.impulse); }   // killed -> ragdoll launch
    else if (e.applyKnockback) e.applyKnockback(r.impulse);          // survived -> shoved away
  }
  if (heli && !heli.dead) {
    const r = blastAt(center, heli.pos, { radius: opts.radius * 1.6, damage: opts.damage, power: opts.power });
    if (r) heli.takeDamage(r.dmg);
  }
  if (dynamics) for (const d of dynamics) {
    const r = blastAt(center, d.pos, opts);
    if (!r) continue;
    d.vel.addScaledVector(r.impulse, 1 / d.mass);   // heavier props move less
    d.spin.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
    d.rest = false;
  }
}
