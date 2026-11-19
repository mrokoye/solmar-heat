// Solmar PD: patrol cars that spawn when the wanted level rises, chase the
// player, ram their car, and bust them on foot. Sirens wail as they close in.

import * as THREE from 'three';
import { CITY } from './config.js';
import { clamp, angleDiff } from './random.js';
import { makeCar } from './vehicles.js';

const MAX_COPS = 5;

export function createPolice(scene, rng) {
  const cops = [];
  let sirenTimer = 0;

  function spawnNear(position) {
    if (cops.length >= MAX_COPS) return null;
    const car = makeCar(0x111418, { police: true });
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(55, 80);
    const x = clamp(position.x + Math.cos(angle) * dist, -CITY.half, CITY.half);
    const z = clamp(position.z + Math.sin(angle) * dist, -CITY.half, CITY.half);
    car.group.position.set(x, 0, z);
    scene.add(car.group);
    const cop = {
      ...car,
      speed: 0,
      heading: Math.atan2(position.x - x, position.z - z),
      ramCooldown: 0,
      flash: 0,
    };
    cops.push(cop);
    return cop;
  }

  return {
    cops,
    count() {
      return cops.length;
    },
    clear() {
      for (const cop of cops) scene.remove(cop.group);
      cops.length = 0;
    },
    update(dt, playerPosition, playerSpeed, wanted, callbacks) {
      // Keep the number of pursuit cars matched to the wanted level.
      const want = Math.min(wanted, 3);
      while (cops.length < want) spawnNear(playerPosition);
      while (cops.length > Math.max(wanted, 0)) {
        const cop = cops.pop();
        scene.remove(cop.group);
      }
      sirenTimer -= dt;
      if (sirenTimer <= 0 && cops.length > 0 && callbacks.onSiren) {
        sirenTimer = 2.2;
        let nearest = Infinity;
        for (const cop of cops) {
          const dx = cop.group.position.x - playerPosition.x;
          const dz = cop.group.position.z - playerPosition.z;
          nearest = Math.min(nearest, Math.sqrt(dx * dx + dz * dz));
        }
        callbacks.onSiren(nearest);
      }
      for (const cop of cops) {
        const dx = playerPosition.x - cop.group.position.x;
        const dz = playerPosition.z - cop.group.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const targetHeading = Math.atan2(dx, dz);
        const turn = clamp(angleDiff(cop.heading, targetHeading), -2.2 * dt, 2.2 * dt);
        cop.heading += turn;
        const targetSpeed = wanted > 0 ? Math.min(40, 26 + wanted * 3.5) : 10;
        cop.speed += clamp(targetSpeed - cop.speed, -18 * dt, 12 * dt);
        cop.group.position.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.group.position.z += Math.cos(cop.heading) * cop.speed * dt;
        cop.group.position.x = clamp(cop.group.position.x, -CITY.half - 20, CITY.half + 20);
        cop.group.position.z = clamp(cop.group.position.z, -CITY.half - 20, CITY.half + 20);
        cop.group.rotation.y = cop.heading;
        // Flashing light bar.
        cop.flash += dt;
        const on = Math.floor(cop.flash * 6) % 2 === 0;
        if (cop.group.userData.lightRed) cop.group.userData.lightRed.visible = on;
        if (cop.group.userData.lightBlue) cop.group.userData.lightBlue.visible = !on;
        // Ram the player.
        cop.ramCooldown -= dt;
        if (dist < 3.6 && cop.ramCooldown <= 0) {
          cop.ramCooldown = 1.2;
          if (callbacks.onRam) callbacks.onRam(dist, cop);
        }
        // Wheels spin with speed.
        const spin = (cop.speed * dt) / 0.42;
        for (const wheel of cop.wheels) wheel.rotation.x += spin;
      }
    },
  };
}
