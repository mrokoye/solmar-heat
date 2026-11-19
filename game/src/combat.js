// Pistol combat: mouse-aimed raycast shooting, ammo and reload, muzzle
// flash and impact particles, and the damage enemies deal back.

import * as THREE from 'three';

export function createCombat(scene, particles, sound) {
  const raycaster = new THREE.Raycaster();
  let ammo = 12;
  let reserve = 60;
  let reloadTimer = 0;
  const MAG = 12;

  return {
    get ammo() { return ammo; },
    get reserve() { return reserve; },
    get reloading() { return reloadTimer > 0; },
    reload() {
      if (reloadTimer > 0 || ammo === MAG || reserve <= 0) return false;
      reloadTimer = 1.1;
      return true;
    },
    shoot(camera, enemies, onEnemyHit) {
      if (reloadTimer > 0) return 'reloading';
      if (ammo <= 0) {
        if (reserve > 0) this.reload();
        return 'empty';
      }
      ammo -= 1;
      sound.shoot();
      const origin = camera.position.clone();
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const muzzle = origin.clone().addScaledVector(direction, 1.2);
      muzzle.y -= 0.25;
      particles.muzzle(muzzle, direction);
      raycaster.set(origin, direction);
      raycaster.far = 120;
      const targets = [];
      for (const enemy of enemies.enemies) {
        if (enemy.alive) targets.push(enemy.mesh);
      }
      const hits = raycaster.intersectObjects(targets, true);
      window.__lastShot = {
        hits: hits.length,
        distance: hits.length > 0 ? hits[0].distance : null,
        origin: [origin.x, origin.y, origin.z],
        direction: [direction.x, direction.y, direction.z],
      };
      if (hits.length > 0) {
        const hit = hits[0];
        let node = hit.object;
        while (node && !node.userData.isEnemy) node = node.parent;
        const point = hit.point.clone();
        particles.impact(point);
        sound.hit();
        if (node && node.userData.enemy) {
          const killed = enemies.damage(node.userData.enemy, 34);
          if (onEnemyHit) onEnemyHit(node.userData.enemy, killed, point);
          return 'hit';
        }
        return 'hit';
      }
      const end = origin.clone().addScaledVector(direction, 90);
      end.y = Math.max(end.y, 0.2);
      particles.impact(end);
      return 'miss';
    },
    // An enemy shoots at the player: tracer particles and a damage roll.
    enemyFire(enemy, playerPosition, distance, onDamage) {
      sound.enemyShoot();
      const from = enemy.mesh.position.clone();
      from.y = 1.5;
      const to = playerPosition.clone();
      to.y = 1.2;
      const dir = to.clone().sub(from).normalize();
      particles.muzzle(from, dir);
      const hitChance = Math.max(0.08, 0.5 - distance / 80);
      if (Math.random() < hitChance && onDamage) onDamage(7 + Math.floor(Math.random() * 6));
    },
    update(dt) {
      if (reloadTimer > 0) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) {
          const needed = MAG - ammo;
          const taken = Math.min(needed, reserve);
          ammo += taken;
          reserve -= taken;
        }
      }
    },
    reset() {
      ammo = MAG;
      reserve = 60;
      reloadTimer = 0;
    },
  };
}
