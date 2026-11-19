// SOLMAR HEAT — boot and the one game loop. Screens: title, intro, play,
// pause, busted, wasted and mission-complete. On foot the player walks,
// runs and jumps; in a car they drive, steal and outrun the police. Missions
// chain from Vic Marlowe's first job to the Solmar Heist.
//
// ?seed=N fixes the city and traffic. ?shot=start|drive|action|city stages a
// screenshot scene instead of running the loop, then sets window.__shotReady.

import * as THREE from 'three';
import { CITY, PLAYER, MISSIONS, CONTROLS } from './config.js';
import { createRandom, clamp, angleDiff } from './random.js';
import { buildCity, resolveColliders } from './city.js';
import { makeCar, driveCar, createTraffic } from './vehicles.js';
import { createPedestrians, createEnemies } from './people.js';
import { createPolice } from './police.js';
import { createMissionManager } from './missions.js';
import { createCombat } from './combat.js';
import { createParticles } from './particles.js';
import { createSoundFX } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RELOAD, ACTION_ENTER_CAR } from './input.js';
import { createHUD } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  statusEl.textContent = `WebGL is unavailable in this browser: ${error.message}`;
  throw error;
}
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd98a68, 180, 720);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

const city = buildCity(scene, rng);
const particles = createParticles(scene);
const sound = createSoundFX();
const input = createInput(canvas);
const hud = createHUD();
const traffic = createTraffic(scene, rng, city.streets);
const pedestrians = createPedestrians(scene, rng, city.streets);
const police = createPolice(scene, rng);
const enemies = createEnemies(scene, rng);
const combat = createCombat(scene, particles, sound);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- The player ------------------------------------------------------------
const playerMesh = new THREE.Group();
{
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.85, 8), jacket);
  body.position.y = 1.05;
  playerMesh.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.75;
  playerMesh.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), jeans);
  legL.position.set(-0.14, 0.32, 0);
  playerMesh.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), jeans);
  legR.position.set(0.14, 0.32, 0);
  playerMesh.add(legR);
}
scene.add(playerMesh);

const player = {
  position: new THREE.Vector3(60, 0, -40),
  vy: 0,
  heading: 0,
  health: PLAYER.maxHealth,
  inCar: false,
  onGround: true,
  walkPhase: 0,
};

const state = {
  screen: 'title',
  cash: 120,
  wanted: 0,
  missionIndex: 0,
  completed: [],
  clock: 17.5 * 3600,
  crimeCooldown: 0,
  lastCrimeAt: -1000,
  bustedTimer: 0,
  elapsed: 0,
};

let playerCar = null;
let camYaw = 0;
let camPitch = 0.12; // low over-the-shoulder angle: the crosshair ray stays near
// chest height for several metres, so close enemies are hittable too
let cameraShake = 0;
let parkedCars = [];

// A few parked cars around the city, including the gold coupe the repo job
// wants and a sedan near the player's start for the first mission.
function parkCar(color, x, z, heading, gold) {
  const car = makeCar(color);
  car.group.position.set(x, 0, z);
  car.group.rotation.y = heading;
  scene.add(car.group);
  const entry = {
    group: car.group, wheels: car.wheels, speed: 0, heading, gold: !!gold,
    position: car.group.position,
  };
  parkedCars.push(entry);
  return entry;
}
parkCar(0x2471a3, 66, -37.4, Math.PI / 2, false); // sedan on the street by the player's start
parkCar(0xf1c40f, -37.4, 40, 0, true); // the gold coupe, street x=-40
parkCar(0x27ae60, -117.4, 100, 0, false);
parkCar(0x8e44ad, 162.6, -40, 0, false);
parkCar(0xecf0f1, 42.6, 160, Math.PI, false);
parkCar(0xe67e22, -180, -117.4, Math.PI / 2, false);

// --- Wanted level ----------------------------------------------------------
function addWanted(stars, reason) {
  if (state.crimeCooldown > 0) return;
  state.crimeCooldown = 3;
  state.wanted = Math.min(5, state.wanted + stars);
  state.lastCrimeAt = state.elapsed;
  if (reason) hud.toast(reason);
}

function decayWanted(dt) {
  if (state.wanted <= 0) return;
  const quietFor = state.elapsed - state.lastCrimeAt;
  let nearestCop = Infinity;
  for (const cop of police.cops) {
    const dx = cop.group.position.x - player.position.x;
    const dz = cop.group.position.z - player.position.z;
    nearestCop = Math.min(nearestCop, Math.sqrt(dx * dx + dz * dz));
  }
  if (quietFor > 18 && nearestCop > 60) {
    state.wanted = Math.max(0, state.wanted - dt / 12);
  }
}

// --- Missions --------------------------------------------------------------
const missions = createMissionManager(scene, {
  onIntro: (mission) => {
    hud.showIntro(mission);
    state.screen = 'intro';
  },
  onObjective: (text) => hud.setObjective(text),
  onComplete: (mission) => {
    state.cash += mission.reward;
    if (!state.completed.includes(state.missionIndex)) state.completed.push(state.missionIndex);
    sound.missionComplete();
    sound.pickup();
    saveGame({ ...state, player });
    const isLast = state.missionIndex >= MISSIONS.length - 1;
    hud.showComplete(mission, isLast);
    state.screen = 'complete';
    state._lastMissionWasLast = isLast;
  },
  onFail: (reason) => {
    hud.toast(reason, 5000);
    setTimeout(() => {
      if (state.screen === 'play') missions.restart();
    }, 2500);
  },
  onCash: (amount) => { state.cash += amount; },
  setWanted: (n) => { state.wanted = n; },
  spawnEnemies: (points) => enemies.spawnAt(points),
  clearEnemies: () => enemies.clear(),
  toast: (msg) => hud.toast(msg),
});

function startCurrentMission() {
  missions.setIndex(state.missionIndex);
  missions.start();
}

// --- Entering and exiting cars ---------------------------------------------
function nearestStealable(position) {
  let best = null;
  let bestD = 5;
  for (const car of parkedCars) {
    const dx = car.group.position.x - position.x;
    const dz = car.group.position.z - position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) { bestD = d; best = { car, kind: 'parked' }; }
  }
  const trafficCar = traffic.nearest(position, bestD);
  if (trafficCar) {
    const dx = trafficCar.group.position.x - position.x;
    const dz = trafficCar.group.position.z - position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) best = { car: trafficCar, kind: 'traffic' };
  }
  return best;
}

function enterCar() {
  const found = nearestStealable(player.position);
  if (!found) {
    hud.toast('No car close enough — walk up to one and press E');
    return;
  }
  if (found.kind === 'traffic') {
    const idx = traffic.cars.indexOf(found.car);
    if (idx >= 0) traffic.cars.splice(idx, 1);
    addWanted(1, 'Car stolen — Solmar PD is on it!');
  } else {
    const idx = parkedCars.indexOf(found.car);
    if (idx >= 0) parkedCars.splice(idx, 1);
  }
  const car = found.car;
  playerCar = {
    group: car.group, wheels: car.wheels,
    speed: 0, heading: car.group.rotation.y, drift: 0,
    position: car.group.position, gold: !!car.gold,
  };
  player.inCar = true;
  playerMesh.visible = false;
  sound.startEngine();
  camYaw = playerCar.heading;
  hud.toast(car.gold ? 'The gold coupe — get it to the garage' : 'You took the car');
}

function exitCar() {
  if (!playerCar) return;
  const side = new THREE.Vector3(Math.cos(playerCar.heading), 0, -Math.sin(playerCar.heading));
  player.position.copy(playerCar.position).addScaledVector(side, 2.6);
  player.position.y = 0;
  player.inCar = false;
  playerMesh.visible = true;
  parkedCars.push({
    group: playerCar.group, wheels: playerCar.wheels, speed: 0,
    heading: playerCar.heading, gold: playerCar.gold, position: playerCar.group.position,
  });
  playerCar = null;
  sound.stopEngine();
}

// --- Damage, busted, wasted -------------------------------------------------
function damagePlayer(amount) {
  if (state.screen !== 'play') return;
  player.health -= amount;
  hud.flashDamage();
  cameraShake = Math.min(0.5, cameraShake + 0.2);
  if (player.health <= 0) {
    player.health = 0;
    sound.busted();
    police.clear();
    state.wanted = 0;
    hud.showWasted();
    state.screen = 'wasted';
  }
}

function bustPlayer() {
  sound.busted();
  police.clear();
  state.wanted = 0;
  state.cash = Math.max(0, state.cash - 100);
  hud.showBusted();
  state.screen = 'busted';
  if (playerCar) exitCar();
}

function respawn() {
  player.health = PLAYER.maxHealth;
  player.position.set(80, 0, -120);
  player.vy = 0;
  enemies.clear();
  missions.setIndex(state.missionIndex);
  startCurrentMission();
  state.screen = 'play';
  hud.showScreen('play');
  hud.setObjective(missions.mission ? missions.mission.objective : 'Free roam');
}

// --- Camera ------------------------------------------------------------------
function updateCamera(dt) {
  const delta = input.takeMouseDelta();
  camYaw -= delta.x * 0.0032;
  camPitch = clamp(camPitch + delta.y * 0.0028, -0.15, 1.1);
  let base;
  let forward;
  let distance;
  if (player.inCar && playerCar) {
    // Chase camera: ease behind the car's heading, wider at speed.
    camYaw += angleDiff(camYaw, playerCar.heading) * Math.min(1, 2.2 * dt);
    base = playerCar.position;
    forward = new THREE.Vector3(Math.sin(playerCar.heading), 0, Math.cos(playerCar.heading));
    distance = 9 + Math.abs(playerCar.speed) * 0.12;
  } else {
    base = player.position;
    forward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    distance = 7.5;
  }
  // The camera looks at a point ahead of the player, not at the player, so
  // the crosshair aims where the player is looking — including at distant
  // enemies — instead of diving into the ground past their feet.
  const lookAt = base.clone().addScaledVector(forward, 10);
  lookAt.y = base.y + 1.6;
  const camPos = base.clone().addScaledVector(forward, -distance);
  camPos.y = base.y + 1.6 + Math.sin(camPitch) * distance;
  camera.position.copy(camPos);
  if (cameraShake > 0) {
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake;
    cameraShake = Math.max(0, cameraShake - dt * 1.4);
  }
  camera.lookAt(lookAt);
}

// --- On-foot movement --------------------------------------------------------
function updateOnFoot(dt) {
  const speed = input.sprint() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const mx = input.moveX();
  const my = input.moveY();
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  const vx = (sin * my + cos * mx) * speed;
  const vz = (cos * my - sin * mx) * speed;
  player.position.x += vx * dt;
  player.position.z += vz * dt;
  const moving = Math.abs(vx) + Math.abs(vz) > 0.1;
  if (moving) {
    const targetHeading = Math.atan2(vx, vz);
    player.heading += angleDiff(player.heading, targetHeading) * Math.min(1, 12 * dt);
    player.walkPhase += dt * speed * 1.6;
  }
  // Jump and gravity.
  if (player.onGround && input.has('Space')) {
    player.vy = PLAYER.jumpSpeed;
    player.onGround = false;
  }
  player.vy -= PLAYER.gravity * dt;
  player.position.y += player.vy * dt;
  if (player.position.y <= 0) {
    player.position.y = 0;
    player.vy = 0;
    player.onGround = true;
  }
  player.position.x = clamp(player.position.x, -CITY.half - 28, CITY.beachX + 24);
  player.position.z = clamp(player.position.z, -CITY.half - 28, CITY.half + 28);
  resolveColliders(player.position, PLAYER.radius, city.colliders);
  playerMesh.position.copy(player.position);
  playerMesh.rotation.y = player.heading;
  const bob = moving ? Math.abs(Math.sin(player.walkPhase)) * 0.08 : 0;
  playerMesh.position.y = player.position.y + bob;
  playerMesh.rotation.z = moving ? Math.sin(player.walkPhase) * 0.04 : 0;
}

// --- HUD snapshot ------------------------------------------------------------
function hudState() {
  return {
    health: player.health,
    cash: state.cash,
    wanted: Math.ceil(state.wanted),
    ammo: combat.ammo,
    reserve: combat.reserve,
    speed: playerCar ? playerCar.speed : 0,
    clock: state.clock,
    inCar: player.inCar,
    mission: missions.mission,
    missionIndex: state.missionIndex,
    timer: missions.active && missions.mission && missions.mission.type === 'timed' ? missions.timer : 0,
    streets: city.streets,
    traffic: traffic.cars,
    cops: police.cops,
    enemies: enemies.enemies,
    target: missions.active ? missions.target() : null,
    playerX: player.position.x,
    playerZ: player.position.z,
    heading: player.inCar && playerCar ? playerCar.heading : camYaw,
  };
}

// --- Buttons -----------------------------------------------------------------
function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
bind('btn-start', () => {
  sound.unlock();
  sound.startMusic();
  state.screen = 'play';
  hud.showScreen('play');
  startCurrentMission();
  hud.toast('Welcome to Solmar, Rae. Follow the gold beacon.');
});
bind('btn-continue', () => {
  const saved = loadGame();
  if (!saved) return;
  sound.unlock();
  sound.startMusic();
  state.cash = saved.cash;
  state.missionIndex = saved.missionIndex;
  state.completed = saved.completed;
  player.health = saved.health;
  player.position.set(saved.position[0], 0, saved.position[1]);
  state.clock = saved.clock || state.clock;
  state.screen = 'play';
  hud.showScreen('play');
  startCurrentMission();
  hud.toast('Save loaded — back on the streets.');
});
bind('btn-begin', () => {
  sound.unlock();
  state.screen = 'play';
  hud.showScreen('play');
});
bind('btn-next', () => {
  if (state._lastMissionWasLast) {
    state.screen = 'title';
    hud.showScreen('title');
    return;
  }
  state.missionIndex = Math.min(state.missionIndex + 1, MISSIONS.length - 1);
  state.screen = 'play';
  hud.showScreen('play');
  startCurrentMission();
});
bind('btn-resume', () => {
  state.screen = 'play';
  hud.showScreen('play');
});
bind('btn-restart-mission', () => {
  missions.restart();
  state.screen = 'play';
  hud.showScreen('play');
  hud.toast('Mission restarted');
});
bind('btn-save', () => {
  if (saveGame({ ...state, player })) hud.toast('Game saved');
  else hud.toast('Save failed — storage unavailable');
});
bind('btn-quit', () => {
  if (playerCar) exitCar();
  state.screen = 'title';
  hud.showScreen('title');
  refreshTitle();
});
bind('btn-busted-free', () => respawn());
bind('btn-wasted-retry', () => respawn());

function refreshTitle() {
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = hasSave() ? 'inline-block' : 'none';
  const info = document.getElementById('title-save-info');
  if (info) {
    const saved = loadGame();
    info.textContent = saved
      ? `Save found: $${saved.cash}, job ${saved.missionIndex + 1} of ${MISSIONS.length}`
      : 'No save yet — start a new story.';
  }
}
refreshTitle();
hud.fillMissionList(state.missionIndex, state.completed);
hud.setObjective('Press Start to begin');
hud.showScreen('title');
statusEl.textContent = 'SOLMAR HEAT. Press Start, or click to begin.';

// --- Main loop ---------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state.screen !== 'play') {
    // Title screen: slow drift over the city so the menu feels alive.
    if (state.screen === 'title') {
      const t = now / 1000;
      camera.position.set(Math.sin(t * 0.05) * 180, 70, Math.cos(t * 0.05) * 180);
      camera.lookAt(0, 10, 0);
      traffic.update(dt, null);
      pedestrians.update(dt);
      particles.update(dt);
    }
    renderer.render(scene, camera);
    return;
  }
  state.elapsed += dt;
  state.clock += dt * 30;
  state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);

  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    state.screen = 'pause';
    hud.fillMissionList(state.missionIndex, state.completed);
    hud.showScreen('pause');
    return;
  }
  if (actions & ACTION_ENTER_CAR) {
    if (player.inCar) exitCar();
    else enterCar();
  }
  if (actions & ACTION_RELOAD) combat.reload();

  if (player.inCar && playerCar) {
    const hitWall = driveCar(playerCar, input, dt, city.colliders, (speed) => {
      particles.sparks(playerCar.position);
      sound.crash();
      cameraShake = Math.min(0.6, cameraShake + 0.3);
    });
    sound.setEngine(playerCar.speed, 42);
    // Bumping traffic cars shoves them aside and sparks fly.
    for (const car of traffic.cars) {
      const dx = car.group.position.x - playerCar.position.x;
      const dz = car.group.position.z - playerCar.position.z;
      if (dx * dx + dz * dz < 9 && Math.abs(playerCar.speed) > 6) {
        car.along += (car.dir > 0 ? 1 : -1) * 0;
        particles.sparks(playerCar.position);
        sound.crash();
        playerCar.speed *= 0.7;
        break;
      }
    }
  } else {
    updateOnFoot(dt);
    // Pistol fire on foot.
    if (input.takeClick() || input.isMouseDown()) {
      const result = combat.shoot(camera, enemies, (enemy, killed) => {
        if (killed) {
          hud.toast('Rival down');
          state.cash += 25;
        }
      });
      if (result === 'hit' || result === 'miss') {
        addWanted(1, 'Shots fired — the cops heard that');
        pedestrians.scare(player.position, 45);
      }
    }
  }

  traffic.update(dt, playerCar);
  pedestrians.update(dt);
  particles.update(dt);
  combat.update(dt);

  // Police pursuit and busted check.
  police.update(dt, player.position, playerCar ? playerCar.speed : 0, Math.ceil(state.wanted), {
    onSiren: (distance) => sound.siren(distance),
    onRam: () => {
      if (playerCar) {
        playerCar.speed *= 0.45;
        particles.sparks(playerCar.position);
        sound.crash();
        cameraShake = 0.5;
      } else {
        damagePlayer(10);
      }
    },
  });
  decayWanted(dt);
  if (!player.inCar && state.wanted > 0) {
    let nearestCop = Infinity;
    for (const cop of police.cops) {
      const dx = cop.group.position.x - player.position.x;
      const dz = cop.group.position.z - player.position.z;
      nearestCop = Math.min(nearestCop, Math.sqrt(dx * dx + dz * dz));
    }
    if (nearestCop < 4) {
      state.bustedTimer += dt;
      if (state.bustedTimer > 1.6) {
        state.bustedTimer = 0;
        bustPlayer();
        return;
      }
    } else {
      state.bustedTimer = 0;
    }
  }

  enemies.update(dt, player.position, (enemy, dist) => {
    combat.enemyFire(enemy, player.position, dist, (amount) => damagePlayer(amount));
  });
  missions.update(dt, player.position, enemies.aliveCount(), {
    inTargetCar: player.inCar && !!playerCar && !!playerCar.gold,
  });

  updateCamera(dt);
  hud.update(hudState());
  renderer.render(scene, camera);
}

// --- Screenshot staging ------------------------------------------------------
function runShot(name) {
  const G = {
    teleportPlayer(x, z) {
      player.position.set(x, 0, z);
      playerMesh.position.copy(player.position);
    },
    face(heading) {
      player.heading = heading;
      camYaw = heading;
    },
    setCamera(x, y, z, lx, ly, lz) {
      camera.position.set(x, y, z);
      camera.lookAt(lx, ly, lz);
    },
    setCameraBehindCar() {
      if (!playerCar) return;
      // Close, low chase camera for the drive shot: the car fills the
      // lower centre of the frame instead of reading as a distant box.
      camYaw = playerCar.heading;
      const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
      const target = playerCar.position.clone();
      camera.position.set(
        target.x - fwd.x * 7,
        2.6,
        target.z - fwd.z * 7,
      );
      camera.lookAt(target.x + fwd.x * 9, 1.3, target.z + fwd.z * 9);
    },
    placeTraffic(i, axis, street, along, dir) {
      const car = traffic.cars[i];
      if (!car) return;
      car.axis = axis;
      car.street = street;
      car.along = along;
      car.dir = dir;
      car.lane = 2.6 * dir;
      car.speed = 10;
      car.baseSpeed = 10;
    },
    giveCar(color, x, z, heading) {
      const car = makeCar(color);
      car.group.position.set(x, 0, z);
      car.group.rotation.y = heading;
      scene.add(car.group);
      playerCar = {
        group: car.group, wheels: car.wheels, speed: 24, heading,
        drift: 0, position: car.group.position, gold: false,
      };
      player.inCar = true;
      playerMesh.visible = false;
      player.position.set(x, 0, z);
    },
    // A police car at an exact spot (for the drive shot): a cop flanking
    // the player, close enough to read at a glance, light bar on top.
    placeCop(x, z, heading) {
      const car = makeCar(0x111418, { police: true });
      car.group.position.set(x, 0, z);
      car.group.rotation.y = heading;
      scene.add(car.group);
      police.cops.push({
        ...car, speed: 24, heading, ramCooldown: 0, flash: 0.25,
      });
    },
    setWanted(n) { state.wanted = n; },
    spawnCops(n, dist) {
      for (let i = 0; i < n; i++) {
        const car = makeCar(0x111418, { police: true });
        const behind = playerCar ? playerCar.position : player.position;
        const heading = playerCar ? playerCar.heading : 0;
        car.group.position.set(
          behind.x - Math.sin(heading) * (dist + i * 9) + (i - 0.5) * 5,
          0,
          behind.z - Math.cos(heading) * (dist + i * 9),
        );
        car.group.rotation.y = heading;
        scene.add(car.group);
        police.cops.push({
          ...car, speed: 24, heading, ramCooldown: 0, flash: i * 0.5,
        });
      }
    },
    // Police ahead on the road, facing the player: a roadblock the chase is
    // heading into, visible in the frame.
    spawnRoadblock(n, dist) {
      for (let i = 0; i < n; i++) {
        const car = makeCar(0x111418, { police: true });
        const at = playerCar ? playerCar.position : player.position;
        const heading = playerCar ? playerCar.heading : 0;
        const ahead = dist + i * 10;
        car.group.position.set(
          at.x + Math.sin(heading) * ahead + (i === 0 ? -3 : 3),
          0,
          at.z + Math.cos(heading) * ahead,
        );
        car.group.rotation.y = heading + Math.PI;
        scene.add(car.group);
        police.cops.push({
          ...car, speed: 0, heading: heading + Math.PI, ramCooldown: 0, flash: i * 0.5,
        });
      }
    },
    startMission(i) {
      state.missionIndex = i;
      missions.setIndex(i);
      missions.start();
    },
    spawnEnemiesAt(points) { enemies.spawnAt(points); },
    fireMuzzle() {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const muzzle = player.position.clone();
      muzzle.y = 1.5;
      muzzle.addScaledVector(dir, 2);
      particles.muzzle(muzzle, dir);
      particles.impact(new THREE.Vector3(player.position.x + 8, 1.2, player.position.z + 8));
    },
    showScreen(name) { hud.showScreen(name); },
    setObjective(text) { hud.setObjective(text); },
  };
  stageShot(name, G);
  // Let traffic, pedestrians and particles move a little so the scene lives.
  for (let i = 0; i < 24; i++) {
    traffic.update(1 / 60, playerCar);
    pedestrians.update(1 / 60);
    particles.update(1 / 60);
  }
  // Muzzle flash must be fresh at render time: it only lives ~0.2 s.
  if (name === 'action') G.fireMuzzle();
  hud.update(hudState());
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// Debug handle for playtests: read state, move the player, force screens.
window.__game = {
  state,
  player,
  camera,
  get playerCar() { return playerCar; },
  get screen() { return state.screen; },
  missions,
  enemies,
  police,
  traffic,
};

if (shotName) {
  runShot(shotName);
} else {
  requestAnimationFrame(frame);
}
