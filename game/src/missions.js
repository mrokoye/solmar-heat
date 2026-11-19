// Missions and the story of SOLMAR HEAT. One mission at a time: a beacon in
// the world, an objective line on the HUD, and a cash reward when it lands.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

function makeBeacon(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 8;
  group.add(diamond);
  group.userData = { ring, diamond };
  return group;
}

export function createMissionManager(scene, callbacks) {
  let index = 0;
  let active = false;
  let phase = 'go'; // go | return | done
  let timer = 0;
  let checkpoint = 0;
  let beacon = null;
  let pulse = 0;

  function clearBeacon() {
    if (beacon) {
      scene.remove(beacon);
      beacon = null;
    }
  }

  function placeBeacon(x, z, color) {
    clearBeacon();
    beacon = makeBeacon(color || 0xffd23f);
    beacon.position.set(x, 0, z);
    scene.add(beacon);
  }

  function currentTarget() {
    const mission = MISSIONS[index];
    if (!mission) return null;
    if (mission.type === 'timed') return mission.targets[checkpoint];
    if (phase === 'return' && mission.returnTo) return mission.returnTo;
    return mission.target;
  }

  function complete() {
    const mission = MISSIONS[index];
    active = false;
    clearBeacon();
    if (callbacks.setWanted) callbacks.setWanted(0);
    if (callbacks.onComplete) callbacks.onComplete(mission);
  }

  return {
    get index() { return index; },
    get active() { return active; },
    get mission() { return MISSIONS[index] || null; },
    get timer() { return timer; },
    get checkpoint() { return checkpoint; },
    target() { return currentTarget(); },
    setIndex(i) {
      index = Math.max(0, Math.min(i, MISSIONS.length - 1));
      active = false;
      phase = 'go';
      clearBeacon();
    },
    start() {
      const mission = MISSIONS[index];
      if (!mission) return;
      active = true;
      phase = 'go';
      checkpoint = 0;
      timer = mission.timeLimit || 0;
      const target = currentTarget();
      if (target) placeBeacon(target[0], target[1]);
      if (mission.wanted && callbacks.setWanted) callbacks.setWanted(mission.wanted);
      if (mission.type === 'combat' && callbacks.spawnEnemies) {
        // Rivals stand on the street through the target, never inside a
        // building: spread them along that street line.
        const points = [];
        const alongZStreet = Math.abs(mission.target[1] % 40) < 0.01;
        for (let i = 0; i < mission.enemies; i++) {
          const off = (i - (mission.enemies - 1) / 2) * 14;
          points.push(alongZStreet
            ? [mission.target[0] + off, mission.target[1]]
            : [mission.target[0], mission.target[1] + off]);
        }
        callbacks.spawnEnemies(points);
      }
      if (callbacks.onIntro) callbacks.onIntro(mission);
      if (callbacks.onObjective) callbacks.onObjective(mission.objective);
    },
    restart() {
      if (callbacks.clearEnemies) callbacks.clearEnemies();
      this.start();
    },
    update(dt, playerPosition, enemiesAlive, extra) {
      if (!active) return;
      const mission = MISSIONS[index];
      pulse += dt;
      if (beacon) {
        beacon.userData.ring.scale.setScalar(1 + Math.sin(pulse * 4) * 0.12);
        beacon.userData.diamond.rotation.y += dt * 2;
        beacon.userData.diamond.position.y = 8 + Math.sin(pulse * 2) * 0.8;
      }
      if (mission.type === 'timed') {
        timer -= dt;
        if (timer <= 0) {
          active = false;
          clearBeacon();
          if (callbacks.onFail) callbacks.onFail('Out of time — the drops went cold. Try again from the pause menu.');
          return;
        }
      }
      if (mission.type === 'combat') {
        if (enemiesAlive === 0) {
          if (callbacks.toast) callbacks.toast('Area clear.');
          complete();
        }
        return;
      }
      const target = currentTarget();
      if (!target) return;
      const dx = playerPosition.x - target[0];
      const dz = playerPosition.z - target[1];
      if (dx * dx + dz * dz < 49) {
        if (mission.type === 'steal' && phase === 'go') {
          if (!(extra && extra.inTargetCar)) return;
          phase = 'return';
          placeBeacon(mission.returnTo[0], mission.returnTo[1], 0x22d3ee);
          if (callbacks.onObjective) callbacks.onObjective('Gold coupe secured — deliver it to the garage');
          if (callbacks.toast) callbacks.toast('Gold coupe secured');
          return;
        }
        if (mission.type === 'fetch' && phase === 'go') {
          phase = 'return';
          placeBeacon(mission.returnTo[0], mission.returnTo[1], 0x22d3ee);
          if (callbacks.onObjective) callbacks.onObjective('Package collected — bring it back to Vic');
          if (callbacks.toast) callbacks.toast('Package collected');
          return;
        }
        if (mission.type === 'timed') {
          checkpoint += 1;
          if (callbacks.toast) callbacks.toast(`Checkpoint ${checkpoint} of ${mission.targets.length}`);
          if (checkpoint >= mission.targets.length) {
            complete();
            return;
          }
          const next = currentTarget();
          placeBeacon(next[0], next[1]);
          return;
        }
        if (mission.type === 'heist' && phase === 'go') {
          phase = 'return';
          placeBeacon(mission.returnTo[0], mission.returnTo[1], 0x22d3ee);
          if (callbacks.setWanted) callbacks.setWanted(4);
          if (callbacks.onObjective) callbacks.onObjective('Vault cash grabbed — escape to the boat at the beach!');
          if (callbacks.toast) callbacks.toast('Vault cash grabbed — run!');
          return;
        }
        complete();
      }
    },
    // The gold coupe for the repo job sits parked at the mission target.
    stealTarget() {
      const mission = MISSIONS[index];
      return mission && mission.type === 'steal' ? mission.target : null;
    },
  };
}

export { MISSIONS };
