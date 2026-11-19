// Keyboard and mouse state. The game listens on the window; the canvas
// asks for pointer lock on click so the mouse orbits the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RELOAD = 4;
export const ACTION_ENTER_CAR = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  // Chromium can fire one phantom mousemove when pointer lock engages; the
  // first move after a lock change is ignored so it never spins the camera.
  let ignoreNextMove = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    if (event.code === 'KeyE') actions |= ACTION_ENTER_CAR;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    mouseDown = true;
    mouseClicked = true;
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      if (ignoreNextMove) {
        ignoreNextMove = false;
        return;
      }
      // A single mousemove event jumping hundreds of pixels is a phantom
      // (for example a scripted click re-moving a locked cursor), never a
      // real hand movement: ignore it instead of spinning the camera.
      const dx = event.movementX || 0;
      const dy = event.movementY || 0;
      if (Math.abs(dx) > 200 || Math.abs(dy) > 200) return;
      mouseDX += dx;
      mouseDY += dy;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) ignoreNextMove = true;
  });

  return {
    // -1..1 on each axis from WASD / arrows.
    moveX() {
      return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    },
    moveY() {
      return (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    handbrake() {
      return keys.has('Space');
    },
    isMouseDown() {
      return mouseDown;
    },
    // True once per click; consumed by takeClick().
    takeClick() {
      const was = mouseClicked;
      mouseClicked = false;
      return was;
    },
    takeMouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    has(keyCode) {
      return keys.has(keyCode);
    },
  };
}
