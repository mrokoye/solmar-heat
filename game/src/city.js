// Solmar: a procedural coastal city. A grid of streets and blocks, a beach
// and the sea to the east, palms, lamps, neon signs and a sunset sky. Every
// building also registers an axis-aligned collider for cars and feet.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function makeWindowTexture(rng, baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // Lit and dark windows in a grid.
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng.next();
      if (lit < 0.28) g.fillStyle = '#ffd27a';
      else if (lit < 0.36) g.fillStyle = '#7dd3fc';
      else g.fillStyle = '#20242e';
      g.fillRect(x, y, 10, 11);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRoadTexture(horizontal) {
  // One asphalt tile with a white centre dash, repeated along the road.
  const canvas = document.createElement('canvas');
  canvas.width = horizontal ? 256 : 64;
  canvas.height = horizontal ? 64 : 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#3a3e46';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#f5f0dc';
  if (horizontal) g.fillRect(88, 28, 80, 8);
  else g.fillRect(28, 88, 8, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(horizontal ? 20 : 1, horizontal ? 1 : 20);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#1d3a6e');
  gradient.addColorStop(0.45, '#7a6a9a');
  gradient.addColorStop(0.72, '#ff9a5c');
  gradient.addColorStop(1, '#ffc98a');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Sunset sky dome.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);

  // Sun disc low in the west, so the streets catch long golden light.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(-820, 120, -220);
  sun.lookAt(0, 60, 0);
  group.add(sun);

  // Lights: warm low sun + soft ambient hemisphere.
  const sunLight = new THREE.DirectionalLight(0xffb36b, 1.65);
  sunLight.position.set(-300, 160, -120);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x8a7bb8, 0x3a2f28, 1.05));

  // Ground: grass base for the whole island.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(CITY.half * 2 + 120, 1, CITY.half * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
  );
  ground.position.set(0, -0.5, 0);
  ground.receiveShadow = false;
  group.add(ground);

  // Centre lines: dashed white strips down each street, painted into the
  // asphalt texture so they cost two meshes per street, not hundreds.
  const streets = [];
  for (let c = -CITY.half; c <= CITY.half; c += CITY.streetEvery) streets.push(c);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const dashH = makeRoadTexture(true);
  const dashV = makeRoadTexture(false);
  for (const c of streets) {
    const alongX = new THREE.Mesh(
      new THREE.BoxGeometry(CITY.half * 2 + 40, 0.2, CITY.streetWidth),
      new THREE.MeshLambertMaterial({ map: dashH }),
    );
    alongX.position.set(0, 0.1, c);
    group.add(alongX);
    const alongZ = new THREE.Mesh(
      new THREE.BoxGeometry(CITY.streetWidth, 0.2, CITY.half * 2 + 40),
      new THREE.MeshLambertMaterial({ map: dashV }),
    );
    alongZ.position.set(c, 0.1, 0);
    group.add(alongZ);
    // Sidewalk edging on both sides of each street.
    for (const off of [-CITY.streetWidth / 2 - 1.5, CITY.streetWidth / 2 + 1.5]) {
      const walkX = new THREE.Mesh(new THREE.BoxGeometry(CITY.half * 2 + 40, 0.22, 3), sidewalkMat);
      walkX.position.set(0, 0.11, c + off);
      group.add(walkX);
      const walkZ = new THREE.Mesh(new THREE.BoxGeometry(3, 0.22, CITY.half * 2 + 40), sidewalkMat);
      walkZ.position.set(c + off, 0.11, 0);
      group.add(walkZ);
    }
  }

  // Buildings: one or two per block, varied heights and colours, with a
  // rooftop box and, on some, a glowing neon sign.
  const buildingGeoms = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const neonMats = PALETTE.neon.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  let buildingCount = 0;
  for (let bx = -CITY.half; bx < CITY.half; bx += CITY.streetEvery) {
    for (let bz = -CITY.half; bz < CITY.half; bz += CITY.streetEvery) {
      const cx = bx + CITY.streetEvery / 2;
      const cz = bz + CITY.streetEvery / 2;
      if (cx > CITY.beachX - 30) continue; // beachfront stays open
      const roll = rng.next();
      if (roll < 0.14) {
        // Park: grass block with palms and a bench.
        addPalms(group, rng, cx, cz, 5);
        continue;
      }
      if (roll < 0.2) continue; // empty lot / car park
      const color = rng.pick(PALETTE.building);
      const hex = `#${color.toString(16).padStart(6, '0')}`;
      const mat = new THREE.MeshLambertMaterial({ map: makeWindowTexture(rng, hex) });
      const w = rng.range(14, 24);
      const d = rng.range(14, 24);
      const h = rng.range(9, 58) * (Math.abs(cx) < 60 && Math.abs(cz) < 60 ? 1.5 : 1);
      const building = new THREE.Mesh(buildingGeoms, mat);
      building.scale.set(w, h, d);
      building.position.set(cx, h / 2, cz);
      group.add(building);
      const roof = new THREE.Mesh(buildingGeoms, roofMat);
      roof.scale.set(w * 0.5, 1.6, d * 0.5);
      roof.position.set(cx, h + 0.8, cz);
      group.add(roof);
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      buildingCount += 1;
      if (rng.next() < 0.35) {
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 2.2, rng.range(5, 9)),
          rng.pick(neonMats),
        );
        sign.position.set(cx + w / 2 + 0.4, Math.min(h - 2, 14), cz);
        group.add(sign);
      }
    }
  }

  // Landmark towers downtown: the Marlin Club hotel and the Solmar Tower.
  addTower(group, colliders, rng, 120, -120, 26, 78, '#e8b04b', 'MARLIN CLUB');
  addTower(group, colliders, rng, -20, -20, 30, 95, '#7a8ba0', 'SOLMAR TOWER');

  // Palms along the beachfront and a few downtown.
  for (let z = -220; z <= 220; z += 28) addPalms(group, rng, 212, z, 1);
  for (let z = -180; z <= 180; z += 90) addPalms(group, rng, -180, z, 2);

  // Beach sand and the sea to the east.
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.4, CITY.half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.position.set(CITY.beachX + 15, 0.2, 0);
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, CITY.half * 2 + 200),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.seaX + 160, 0.35, 0);
  group.add(sea);
  // Pier reaching into the sea.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(70, 0.8, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6b45 }),
  );
  pier.position.set(CITY.seaX + 20, 0.8, 0);
  group.add(pier);
  colliders.push({ minX: CITY.seaX - 12, maxX: CITY.seaX + 52, minZ: -4, maxZ: 4 });

  // Street lamps at intersections.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const sx of streets) {
    for (const sz of streets) {
      if ((sx + sz) % 80 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), lampMat);
      pole.position.set(sx + 6, 3.5, sz + 6);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
      bulb.position.set(sx + 6, 7.1, sz + 6);
      group.add(bulb);
    }
  }

  // A few drifting clouds.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffe3d0, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(8, 16), 8, 6), cloudMat);
      puff.position.set(j * 12 - 12, rng.range(-2, 2), rng.range(-4, 4));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-500, 500), rng.range(120, 200), rng.range(-500, 300));
    group.add(cloud);
  }

  return { colliders, streets, buildingCount };
}

function addTower(group, colliders, rng, x, z, w, h, color, label) {
  const mat = new THREE.MeshLambertMaterial({ map: makeWindowTexture(rng, color) });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
  tower.position.set(x, h / 2, z);
  group.add(tower);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - w / 2, maxZ: z + w / 2 });
  // Glowing rooftop sign letters as a bright bar.
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.9, 2.4, 0.8),
    new THREE.MeshBasicMaterial({ color: 0xff2e88 }),
  );
  sign.position.set(x, h + 1.2, z);
  group.add(sign);
}

function addPalms(group, rng, x, z, count) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a });
  for (let i = 0; i < count; i++) {
    const px = x + rng.range(-10, 10);
    const pz = z + rng.range(-10, 10);
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = rng.range(-0.12, 0.12);
    palm.add(trunk);
    // Two overlapping cones read as a palm canopy at street level.
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 7), leafMat);
    canopy.position.y = 7.6;
    palm.add(canopy);
    const canopy2 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 7), leafMat);
    canopy2.position.set(0.9, 6.8, 0.6);
    canopy2.rotation.z = -0.35;
    palm.add(canopy2);
    palm.position.set(px, 0, pz);
    group.add(palm);
  }
}

// Circle (player / car) vs building AABB: push the circle out and report hit.
// A circle whose centre is inside the box is pushed out through the nearest
// face (the shortest way out), not shoved sideways every frame.
export function resolveColliders(position, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(position.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(position.z, c.maxZ));
    const dx = position.x - nx;
    const dz = position.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        position.x = nx + (dx / d) * radius;
        position.z = nz + (dz / d) * radius;
      } else {
        const toLeft = position.x - c.minX;
        const toRight = c.maxX - position.x;
        const toTop = position.z - c.minZ;
        const toBottom = c.maxZ - position.z;
        const min = Math.min(toLeft, toRight, toTop, toBottom);
        if (min === toLeft) position.x = c.minX - radius;
        else if (min === toRight) position.x = c.maxX + radius;
        else if (min === toTop) position.z = c.minZ - radius;
        else position.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

export function insideCity(x, z) {
  return Math.abs(x) < CITY.half + 30 && Math.abs(z) < CITY.half + 30;
}
