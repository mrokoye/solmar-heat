// Cars: the factory that builds a low-poly car, arcade driving physics for
// the player's car, and the traffic that fills Solmar's streets.

import * as THREE from 'three';
import { CAR, CITY, PALETTE } from './config.js';
import { clamp, angleDiff } from './random.js';
import { resolveColliders } from './city.js';

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111214 });

// Build a car facing +Z. Returns { group, wheels, bodyMat, length }.
export function makeCar(color, options) {
  const opts = options || {};
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.62;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.65, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1a2733 }),
  );
  cabin.position.set(0, 1.28, -0.25);
  group.add(cabin);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.14, 0.18, 4.42),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
  );
  stripe.position.y = 0.95;
  group.add(stripe);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.42, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights and tail lights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const x of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.1), headMat);
    head.position.set(x, 0.62, 2.22);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    tail.position.set(x, 0.62, -2.22);
    group.add(tail);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.72, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.38, 1.74, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.38, 1.74, -0.25);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
    // "SOLMAR PD" stripe on the doors.
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    door.position.y = 0.62;
    group.add(door);
  }
  group.userData.wheels = wheels;
  return { group, wheels, bodyMat, length: 4.4 };
}

function spinWheels(car, speed, dt) {
  const spin = (speed * dt) / 0.42;
  for (const wheel of car.wheels) wheel.rotation.x += spin;
}

// Arcade driving for the player's car. Returns true when a hard impact hit.
export function driveCar(car, input, dt, colliders, onImpact) {
  const steer = input.moveX();
  const throttle = input.moveY();
  const handbrake = input.handbrake();
  const forward = car.speed >= 0 ? 1 : -1;

  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    car.speed -= car.speed > 0.5 ? CAR.brake * dt : CAR.accel * 0.55 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = clamp(car.speed, -CAR.reverseSpeed, CAR.maxSpeed);
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.drift = clamp((car.drift || 0) + steer * dt * 2, -1, 1);
  } else {
    car.drift = (car.drift || 0) * Math.max(0, 1 - 4 * dt);
  }
  const turnAmount = steer * CAR.turnRate * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * forward;
  car.heading += turnAmount * (handbrake ? 1.6 : 1) + (car.drift || 0) * 0.4 * dt * forward;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.position.x += fx * car.speed * dt;
  car.position.z += fz * car.speed * dt;
  // Soft world edge: the sea stops you, the map edge turns you around.
  if (car.position.x > CITY.beachX + 26) {
    car.position.x = CITY.beachX + 26;
    car.speed *= -0.3;
    if (onImpact) onImpact(6);
  }
  if (Math.abs(car.position.x) > CITY.half + 26 || Math.abs(car.position.z) > CITY.half + 26) {
    car.position.x = clamp(car.position.x, -CITY.half - 26, CITY.half + 26);
    car.position.z = clamp(car.position.z, -CITY.half - 26, CITY.half + 26);
    car.speed *= 0.4;
  }
  const hitWall = resolveColliders(car.position, 1.6, colliders);
  if (hitWall) {
    if (Math.abs(car.speed) > 9 && onImpact) onImpact(Math.abs(car.speed));
    car.speed *= 0.45;
  }
  car.group.position.copy(car.position);
  car.group.rotation.y = car.heading;
  // Body lean into turns and acceleration.
  car.group.rotation.z = -steer * clamp(Math.abs(car.speed) / CAR.maxSpeed, 0, 1) * 0.06;
  car.group.rotation.x = clamp(-car.speed / CAR.maxSpeed, -1, 1) * 0.02;
  spinWheels(car, car.speed, dt);
  return hitWall;
}

// Traffic: cars that cruise the street grid, turn at intersections and wrap.
export function createTraffic(scene, rng, streets) {
  const cars = [];
  const colors = PALETTE.car;
  for (let i = 0; i < 20; i++) {
    const color = rng.pick(colors);
    const car = makeCar(color);
    const axis = rng.next() < 0.5 ? 'x' : 'z';
    const street = rng.pick(streets);
    const dir = rng.next() < 0.5 ? 1 : -1;
    const lane = (rng.next() < 0.5 ? -2.6 : 2.6) * dir;
    const along = rng.range(-CITY.half, CITY.half);
    car.group.position.set(axis === 'x' ? along : street + lane, 0, axis === 'x' ? street + lane : along);
    scene.add(car.group);
    cars.push({
      ...car,
      axis,
      street,
      lane,
      along,
      dir,
      speed: rng.range(7, 13),
      baseSpeed: 10,
      heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    });
  }

  function nearestStreet(value) {
    let best = streets[0];
    for (const s of streets) if (Math.abs(s - value) < Math.abs(best - value)) best = s;
    return best;
  }

  return {
    cars,
    update(dt, playerCar) {
      for (const car of cars) {
        // Slow down for the player's car right ahead.
        let targetSpeed = car.baseSpeed;
        if (playerCar) {
          const dx = playerCar.position.x - car.group.position.x;
          const dz = playerCar.position.z - car.group.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 12) {
            const ahead = car.axis === 'x'
              ? Math.sign(dx) === car.dir && Math.abs(dz) < 4
              : Math.sign(dz) === car.dir && Math.abs(dx) < 4;
            if (ahead) targetSpeed = 0;
          }
        }
        car.speed += clamp(targetSpeed - car.speed, -10 * dt, 6 * dt);
        car.along += car.dir * car.speed * dt;
        // Turn at an intersection sometimes.
        const near = nearestStreet(car.along);
        if (Math.abs(car.along - near) < 1.2 && rng.next() < 0.004) {
          const newAxis = car.axis === 'x' ? 'z' : 'x';
          const oldStreet = car.street;
          car.street = near;
          car.axis = newAxis;
          car.along = oldStreet;
          car.dir = rng.next() < 0.5 ? 1 : -1;
          car.lane = (rng.next() < 0.5 ? -2.6 : 2.6) * car.dir;
        }
        if (car.along > CITY.half + 20) car.along = -CITY.half - 20;
        if (car.along < -CITY.half - 20) car.along = CITY.half + 20;
        const x = car.axis === 'x' ? car.along : car.street + car.lane;
        const z = car.axis === 'x' ? car.street + car.lane : car.along;
        car.group.position.set(x, 0, z);
        const targetHeading = car.axis === 'x'
          ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (car.dir > 0 ? 0 : Math.PI);
        car.group.rotation.y += angleDiff(car.group.rotation.y, targetHeading) * Math.min(1, 6 * dt);
        spinWheels(car, car.speed, dt);
      }
    },
    // Nearest traffic car to a point (for stealing).
    nearest(position, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const car of cars) {
        const dx = car.group.position.x - position.x;
        const dz = car.group.position.z - position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best;
    },
  };
}
