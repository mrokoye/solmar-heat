// SOLMAR HEAT — every tuning number, colour and story beat in one place.
// The city is a 480 x 480 unit grid of streets and blocks on the coast of
// the fictional city of Solmar, with the beach and the sea to the east.

export const CITY = {
  half: 240, // city extends -240..240 on x and z
  streetEvery: 40, // streets every 40 units
  streetWidth: 10,
  beachX: 222, // sand starts here, sea beyond x = 252
  seaX: 252,
};

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12,
  jumpSpeed: 8,
  gravity: 22,
  radius: 0.6,
  maxHealth: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseSpeed: 12,
  maxSpeed: 42,
  turnRate: 1.9,
  grip: 6,
};

export const WANTED = {
  decayQuietSeconds: 18,
  decayStepSeconds: 12,
  bustedHoldSeconds: 1.6,
};

export const PALETTE = {
  skyTop: 0x2b4a7a,
  skyBottom: 0xff9a5c,
  sun: 0xffd27a,
  sea: 0x1e6f8e,
  sand: 0xe8c98f,
  asphalt: 0x2e3138,
  sidewalk: 0x9a938a,
  grass: 0x4d7a3a,
  building: [0xd9a05b, 0xc97b4a, 0x8fa3b8, 0xe0cfa8, 0x7a8ba0, 0xb85c5c, 0x5f7a6a, 0xd8d3c3],
  neon: [0xff2e88, 0x22d3ee, 0xfacc15, 0xa3e635, 0xfb7185],
  car: [0xc0392b, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x1c1c1e, 0xe67e22],
  police: 0x1f6feb,
};

export const SAVE_KEY = 'solmar-heat.save.v1';

// The story: Rae Delgado comes home to Solmar owing money to the Marlin Club.
// Fixer Vic Marlowe offers one job after another until the big one — the
// Solmar Heist. Each mission pays cash and unlocks the next.
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    intro: 'Vic Marlowe: "You are back in Solmar, Rae. Need wheels? Take the sedan by the garage and drive it to me."',
    objective: 'Drive the marked sedan to Vic at the Marlin Club',
    type: 'goto',
    target: [100, -120],
    reward: 150,
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    intro: 'Vic: "A package is waiting at the docks, east side. Bring it back. No questions, no stops."',
    objective: 'Collect the package at the docks, then return to Vic',
    type: 'fetch',
    target: [200, 80],
    returnTo: [100, -120],
    reward: 250,
  },
  {
    id: 'getaway',
    title: 'Getaway',
    intro: 'Vic: "The crew tripped an alarm. Solmar PD is on you. Lose them and get to the hideout on the north side."',
    objective: 'Escape the police and reach the hideout',
    type: 'chase',
    target: [-140, -160],
    wanted: 2,
    reward: 400,
  },
  {
    id: 'repo-job',
    title: 'Repo Job',
    intro: 'Vic: "A debtor parked a gold coupe near the plaza. Take it — quietly — and bring it to the garage."',
    objective: 'Steal the gold coupe and deliver it to the garage',
    type: 'steal',
    target: [-40, 40],
    returnTo: [100, -120],
    reward: 350,
  },
  {
    id: 'beach-run',
    title: 'Beach Run',
    intro: 'Vic: "Three drops, one sunset, ninety seconds. The boardwalk, the pier, the lifeguard hut. Go."',
    objective: 'Hit all three checkpoints before the timer runs out',
    type: 'timed',
    targets: [[200, -160], [200, 0], [200, 160]],
    timeLimit: 100,
    reward: 500,
  },
  {
    id: 'street-heat',
    title: 'Street Heat',
    intro: 'Vic: "Rivals took the warehouse on 5th. Clear them out, Rae. All four. Then it is ours."',
    objective: 'Eliminate the four rivals at the warehouse',
    type: 'combat',
    target: [-80, 80],
    enemies: 4,
    reward: 600,
  },
  {
    id: 'the-exchange',
    title: 'The Exchange',
    intro: 'Vic: "Cash handoff at the marina. It will not stay friendly. Take the money and make it out alive."',
    objective: 'Survive the ambush and take the cash',
    type: 'combat',
    target: [180, 160],
    enemies: 3,
    reward: 750,
  },
  {
    id: 'solmar-heist',
    title: 'The Solmar Heist',
    intro: 'Vic: "The big one. Grab the Marlin Club vault cash, then run for the boat at the beach. Every cop in Solmar will be coming."',
    objective: 'Grab the vault cash and escape to the boat',
    type: 'heist',
    target: [100, -120],
    returnTo: [235, 40],
    wanted: 4,
    reward: 2000,
  },
];

export const CONTROLS = [
  ['W A S D', 'Move / drive'],
  ['Mouse', 'Look around / aim'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / handbrake (in car)'],
  ['E', 'Enter / exit car'],
  ['Click', 'Shoot pistol'],
  ['R', 'Reload'],
  ['M', 'Toggle mission list'],
  ['P / Esc', 'Pause'],
];
