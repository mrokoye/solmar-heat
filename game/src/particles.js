// A small particle pool built on THREE.Points: muzzle flashes, crash
// sparks, smoke, blood-free impact puffs and explosion embers.

import * as THREE from 'three';

const MAX = 600;

export function createParticles(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.55,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({ alive: false, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, gravity: 0 });
    positions[i * 3 + 1] = -100;
  }

  let cursor = 0;
  function spawn(x, y, z, vx, vy, vz, life, r, g, b, gravity) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    p.alive = true;
    p.life = life;
    p.maxLife = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.gravity = gravity || 0;
    const i = pool.indexOf(p);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  function burst(position, count, speed, life, color, gravity) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = (Math.random() - 0.3) * speed;
      spawn(
        position.x, position.y, position.z,
        Math.cos(a) * speed * Math.random(), up, Math.sin(a) * speed * Math.random(),
        life * (0.5 + Math.random() * 0.5),
        color[0], color[1], color[2], gravity,
      );
    }
  }

  return {
    muzzle(position, direction) {
      for (let i = 0; i < 8; i++) {
        spawn(
          position.x, position.y, position.z,
          direction.x * 14 + (Math.random() - 0.5) * 4,
          direction.y * 14 + (Math.random() - 0.5) * 4,
          direction.z * 14 + (Math.random() - 0.5) * 4,
          0.12 + Math.random() * 0.08, 1, 0.8, 0.25, 0,
        );
      }
    },
    sparks(position) {
      burst(position, 18, 7, 0.5, [1, 0.65, 0.15], -12);
    },
    smoke(position) {
      burst(position, 10, 2, 1.4, [0.5, 0.5, 0.55], 2);
    },
    impact(position) {
      burst(position, 10, 4, 0.35, [0.9, 0.85, 0.7], -6);
    },
    explosion(position) {
      burst(position, 60, 12, 0.9, [1, 0.5, 0.1], -4);
      burst(position, 30, 5, 1.6, [0.25, 0.25, 0.28], 1.5);
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = pool[i];
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          positions[i * 3 + 1] = -100;
          continue;
        }
        p.vy += p.gravity * dt;
        positions[i * 3] += p.vx * dt;
        positions[i * 3 + 1] += p.vy * dt;
        positions[i * 3 + 2] += p.vz * dt;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}
