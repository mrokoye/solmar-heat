// Staged scenes for screenshots: ?shot=start|drive|action|city with &seed=N
// builds a fixed, readable moment of the game, paints it, and sets
// window.__shotReady so the screenshot runner knows the frame is ready.
// Every shot is a real render of the game's own code — never a still image.

export function stageShot(name, G) {
  if (name === 'start') {
    G.teleportPlayer(60, -40);
    G.setCamera(200, 95, 200, 0, 15, 0);
    G.showScreen('title');
    G.setObjective('Welcome to Solmar');
    return 'title';
  }
  if (name === 'drive') {
    G.startMission(2); // Getaway: wanted 2, hideout to the north.
    G.setWanted(3);
    // East along street z=0 from x=80: the camera looks away from the
    // setting sun, so the building faces ahead are sunlit instead of the
    // shaded wall that filled the frame at the (0,0) intersection, and
    // the Solmar Tower block is far behind the camera.
    G.giveCar(0xc0392b, 80, 0, Math.PI / 2);
    G.teleportPlayer(80, 0);
    // Two Solmar PD cars flanking the player in the adjacent lanes, just
    // ahead of the rear bumper — close enough to read, far enough forward
    // that their sides (white doors, light bars) show instead of only
    // their flat rear decks. (Cops spawned directly behind the car sit
    // behind the chase camera and never show.)
    G.placeCop(82, -3.0, Math.PI / 2);
    G.placeCop(80.5, 3.0, Math.PI / 2);
    // Roadblock ahead, pulled close enough to read.
    G.spawnRoadblock(2, 16);
    G.placeTraffic(0, 'x', 0, 115, -1);
    G.placeTraffic(1, 'x', 0, 150, 1);
    G.placeTraffic(2, 'x', 0, 130, -1); // oncoming headlights
    G.setCameraBehindCar();
    G.showScreen('play');
    G.setObjective('Escape the police and reach the hideout');
    return 'play';
  }
  if (name === 'action') {
    G.startMission(5); // Street Heat: rivals at the warehouse.
    G.teleportPlayer(-70, 66);
    G.face(-0.8);
    G.spawnEnemiesAt([[-94, 80], [-66, 80], [-108, 80]]);
    G.setCamera(-65, 3.5, 61, -78, 1.5, 80);
    G.showScreen('play');
    G.setObjective('Eliminate the four rivals at the warehouse');
    return 'play';
  }
  if (name === 'city') {
    G.teleportPlayer(120, 60);
    G.setCamera(260, 130, 220, -40, 10, -40);
    G.showScreen('play');
    G.setObjective('Free roam — Solmar at dusk');
    return 'play';
  }
  return null;
}
