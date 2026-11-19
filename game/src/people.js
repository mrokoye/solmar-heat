// People of Solmar: pedestrians strolling the sidewalks (who flee from
// gunfire) and the armed rivals who show up in combat missions.

import * as THREE from 'three';
import { CITY } from './config.js';
import { clamp } from './random.js';

const SKIN = [0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0];
const SHIRT = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e];

function makePerson(rng, shirtColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKIN) });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor || rng.pick(SHIRT) });
  const legs = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.85, 8), shirt);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.75;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), legs);
  legL.position.set(-0.14, 0.32, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), legs);
  legR.position.set(0.14, 0.32, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armL.position.set(-0.45, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armR.position.set(0.45, 1.05, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export function createPedestrians(scene, rng, streets) {
  const peds = [];
  for (let i = 0; i < 34; i++) {
    const mesh = makePerson(rng);
    scene.add(mesh);
    const axis = rng.next() < 0.5 ? 'x' : 'z';
    const street = rng.pick(streets);
    peds.push({
      mesh,
      axis,
      street,
      along: rng.range(-CITY.half, CITY.half),
      dir: rng.next() < 0.5 ? 1 : -1,
      speed: rng.range(1.2, 2.4),
      flee: 0,
      walkPhase: rng.range(0, Math.PI * 2),
    });
  }

  return {
    peds,
    // Gunfire at a point sends nearby pedestrians running.
    scare(position, radius) {
      for (const ped of peds) {
        const dx = ped.mesh.position.x - position.x;
        const dz = ped.mesh.position.z - position.z;
        if (dx * dx + dz * dz < radius * radius) ped.flee = 6;
      }
    },
    update(dt) {
      for (const ped of peds) {
        const speed = ped.flee > 0 ? 5.5 : ped.speed;
        if (ped.flee > 0) ped.flee -= dt;
        ped.along += ped.dir * speed * dt;
        if (ped.along > CITY.half + 10) ped.along = -CITY.half - 10;
        if (ped.along < -CITY.half - 10) ped.along = CITY.half + 10;
        const off = (ped.dir > 0 ? 7.5 : -7.5);
        const x = ped.axis === 'x' ? ped.along : ped.street + off;
        const z = ped.axis === 'x' ? ped.street + off : ped.along;
        ped.mesh.position.set(x, 0, z);
        const heading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
        ped.mesh.rotation.y = heading;
        ped.walkPhase += dt * speed * 3;
        const swing = Math.sin(ped.walkPhase) * 0.5;
        ped.mesh.userData.legL.rotation.x = swing;
        ped.mesh.userData.legR.rotation.x = -swing;
        ped.mesh.userData.armL.rotation.x = -swing * 0.7;
        ped.mesh.userData.armR.rotation.x = swing * 0.7;
      }
    },
  };
}

// Armed rivals for combat missions. They stand their ground, take cover
// behind nothing, and shoot at the player on a timer.
export function createEnemies(scene, rng) {
  const enemies = [];

  function spawn(x, z) {
    const mesh = makePerson(rng, 0x1a1a1a);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    // A dark visor so rivals read as hostile at a glance.
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    visor.position.set(0, 1.78, 0.24);
    mesh.add(visor);
    const enemy = {
      mesh, health: 100, alive: true, shootTimer: rng.range(0.8, 2), x, z,
    };
    mesh.userData.isEnemy = true;
    mesh.userData.enemy = enemy;
    enemies.push(enemy);
    return enemy;
  }

  return {
    enemies,
    spawnAt(points) {
      for (const [x, z] of points) spawn(x + (Math.random() - 0.5) * 8, z + (Math.random() - 0.5) * 8);
    },
    aliveCount() {
      return enemies.filter((e) => e.alive).length;
    },
    clear() {
      for (const e of enemies) scene.remove(e.mesh);
      enemies.length = 0;
    },
    damage(enemy, amount) {
      enemy.health -= amount;
      if (enemy.health <= 0 && enemy.alive) {
        enemy.alive = false;
        enemy.mesh.rotation.x = -Math.PI / 2;
        enemy.mesh.position.y = 0.35;
        return true;
      }
      return false;
    },
    update(dt, playerPosition, onShoot) {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = playerPosition.x - enemy.mesh.position.x;
        const dz = playerPosition.z - enemy.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        enemy.mesh.rotation.y = Math.atan2(dx, dz);
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0 && dist < 55) {
          enemy.shootTimer = 1.4 + Math.random() * 1.2;
          if (onShoot) onShoot(enemy, dist);
        }
        // Step sideways a little so they do not stand perfectly still.
        enemy.mesh.position.x += Math.sin(performance.now() / 900 + enemy.x) * dt * 0.4;
      }
    },
  };
}
