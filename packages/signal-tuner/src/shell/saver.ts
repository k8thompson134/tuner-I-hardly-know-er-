// The screen saver: a starfield after a minute of no input. One star pulses
// in a fixed spot, like a beacon. Once the player has solved three
// transmissions something small and green drifts across now and then.
// Knows the DOM, not the game; main.ts says how far along the player is.

const IDLE_MS = 60_000;
// Input right after it starts is ignored, so the click that happened to land
// as it opened doesn't close it again.
const ARM_MS = 500;
const STARS = 220;
const ALIEN_EVERY_S = 20;
const ALIEN_FROM_SOLVED = 3;

interface Star {
  x: number;
  y: number;
  z: number;
}

export function createSaver({ solved }: { solved: () => number }) {
  const root = document.getElementById("saver") as HTMLElement;
  const canvas = root.querySelector("canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ?idle=5 starts it after 5 seconds, for trying it out.
  const idleParam = Number(new URLSearchParams(location.search).get("idle"));
  const idleMs = idleParam > 0 ? idleParam * 1000 : IDLE_MS;

  let idleTimer: number | undefined;
  let running = false;
  let startedAt = 0;
  let last = 0;
  let raf = 0;
  let alienAt = 0;
  let alienOn = false;
  let alienX = 0;
  let alienY = 0;
  let stars: Star[] = [];

  const spawn = (deep: boolean): Star => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: deep ? Math.random() : 1,
  });

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawAlien(x: number, y: number, t: number) {
    const p = 3;
    const bob = Math.sin(t * 2) * p;
    ctx.save();
    ctx.translate(x, y + bob);
    // Body, eyes.
    ctx.fillStyle = "#9fe870";
    ctx.beginPath();
    ctx.arc(0, 0, 5 * p, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14301a";
    ctx.fillRect(-2.5 * p, -p, p, 1.6 * p);
    ctx.fillRect(1.5 * p, -p, p, 1.6 * p);
    // Headphones.
    ctx.strokeStyle = "#ff5ccd";
    ctx.lineWidth = p * 0.8;
    ctx.beginPath();
    ctx.arc(0, -p, 5.6 * p, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = "#ff5ccd";
    ctx.fillRect(-6.4 * p, -p, 1.8 * p, 3 * p);
    ctx.fillRect(4.6 * p, -p, 1.8 * p, 3 * p);
    // A little dish on a stalk.
    ctx.strokeStyle = "#c8d6e5";
    ctx.lineWidth = p * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -5 * p);
    ctx.lineTo(0, -8 * p);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -9 * p, 2.2 * p, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  function draw(now: number, dt: number) {
    const w = innerWidth;
    const h = innerHeight;
    const t = (now - startedAt) / 1000;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const reach = Math.max(w, h) * 0.55;
    for (const s of stars) {
      s.z -= dt * 0.22;
      const sx = w / 2 + (s.x / Math.max(s.z, 0.02)) * reach * 0.35;
      const sy = h / 2 + (s.y / Math.max(s.z, 0.02)) * reach * 0.35;
      if (s.z <= 0.02 || sx < 0 || sx > w || sy < 0 || sy > h) {
        Object.assign(s, spawn(false));
        continue;
      }
      const near = 1 - s.z;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + near * 0.65})`;
      const size = 0.6 + near * 2.2;
      ctx.fillRect(sx, sy, size, size);
    }

    // The beacon: a star that doesn't move, fading in and out every six seconds.
    const glow = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 6);
    ctx.fillStyle = `rgba(190,255,200,${0.15 + glow * 0.85})`;
    ctx.fillRect(w * 0.72, h * 0.28, 3, 3);
    ctx.fillRect(w * 0.72 - 3, h * 0.28 + 1, 9, 1);
    ctx.fillRect(w * 0.72 + 1, h * 0.28 - 3, 1, 9);

    if (solved() >= ALIEN_FROM_SOLVED) {
      if (!alienOn && t >= alienAt) {
        alienOn = true;
        alienX = -30;
        alienY = h * (0.2 + Math.random() * 0.6);
      }
      if (alienOn) {
        alienX += dt * 45;
        drawAlien(alienX, alienY, t);
        if (alienX > w + 30) {
          alienOn = false;
          alienAt = t + ALIEN_EVERY_S;
        }
      }
    }
  }

  function loop(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    draw(now, dt);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    running = true;
    root.hidden = false;
    resize();
    stars = Array.from({ length: STARS }, () => spawn(true));
    startedAt = last = performance.now();
    alienAt = 8;
    alienOn = false;
    if (reducedMotion.matches) {
      draw(startedAt, 0);
    } else {
      raf = requestAnimationFrame(loop);
    }
    window.setTimeout(() => {
      armed = true;
    }, ARM_MS);
  }
  let armed = false;
  let swallowClickUntil = 0;

  function stop() {
    running = false;
    armed = false;
    swallowClickUntil = performance.now() + 400;
    cancelAnimationFrame(raf);
    root.hidden = true;
    schedule();
  }

  function schedule() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      const off = document.documentElement.dataset.saver === "off";
      if (off || document.hidden) {
        schedule();
      } else {
        start();
      }
    }, idleMs);
  }

  const activity = () => {
    if (!running) schedule();
  };
  for (const type of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(type, activity, { passive: true, capture: true });
  }

  // While it's up, the first real input closes it and goes no further.
  const dismiss = (e: Event) => {
    if (!running) {
      // The click that finishes the gesture must not land on what's underneath.
      if (e.type === "click" && performance.now() < swallowClickUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
      return;
    }
    e.stopPropagation();
    if (armed) stop();
  };
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart", "click"]) {
    window.addEventListener(type, dismiss, { capture: true });
  }
  let moved = 0;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!running) {
        moved = 0;
        return;
      }
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (armed && moved > 12) stop();
    },
    { capture: true }
  );
  window.addEventListener("resize", () => {
    if (running) resize();
  });

  schedule();
}
