import { Application, Container, Graphics } from "pixi.js";
import { connect, sendInput, onSnapshot, type Snapshot, getMyId } from "./net.js";

const app = new Application();
const stage = new Container();
const worldLayer = new Container();
const snakesLayer = new Container();
const foodLayer = new Container();
const border = new Graphics();
const eyePool: Map<string, { l: Graphics; r: Graphics; lp: Graphics; rp: Graphics }> = new Map();
const snakePool: Map<string, Graphics[]> = new Map();
const foodPool: Map<number, Graphics> = new Map();
const foodAnimations: Map<number, { baseX: number; baseY: number; offsetX: number; offsetY: number; phase: number; speed: number; radius: number; color: number; colorPhase: number; baseColor: number }> = new Map();
const debug = new Graphics();
let mouseX = 0;
let mouseY = 0;

async function setup() {
  await app.init({ background: "#101012", resizeTo: window, antialias: true });
  document.getElementById("app")!.appendChild(app.canvas);
  app.stage.addChild(stage);
  stage.addChild(worldLayer);
  // Start closer (smaller visible area)
  worldLayer.scale.set(1.5);
  worldLayer.addChild(border);
  worldLayer.addChild(foodLayer);
  worldLayer.addChild(snakesLayer);
  worldLayer.addChild(debug);

  hookInput();
  startNet();
}

function hookInput() {
  let boosting = false;
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") boosting = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") boosting = false;
  });
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0 || e.button === 2) boosting = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0 || e.button === 2) boosting = false;
  });
  window.addEventListener("mousemove", (e) => {
    const cx = app.renderer.width / 2;
    const cy = app.renderer.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const angle = Math.atan2(dy, dx);
    
    // Store mouse position for eye tracking
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    sendInput(angle, boosting);
  });
}

function render(snapshot: Snapshot) {
  // draw world border (pretty red line)
  border.clear();
  border.rect(0, 0, snapshot.world.width, snapshot.world.height).stroke({ width: 6, color: 0xff3b30, alpha: 0.9 });

  // Mark all pools unused initially; we'll reuse existing graphics where possible
  const usedSnakeIds = new Set<string>();
  const usedFoodIds = new Set<number>();

  // draw food - just setup, animation will handle drawing
  for (const [id, x, y, r, color] of snapshot.food) {
    usedFoodIds.add(id);
    let g = foodPool.get(id);
    if (!g) {
      g = new Graphics();
      foodPool.set(id, g);
      foodLayer.addChild(g);
    }
    
    // Get or create animation data for this food
    let anim = foodAnimations.get(id);
    if (!anim) {
      // Create new animation with random phase and speed
      anim = {
        baseX: x,
        baseY: y,
        offsetX: 0,
        offsetY: 0,
        phase: Math.random() * Math.PI * 2, // Random starting phase
        speed: 0.5 + Math.random() * 1.0, // Random speed between 0.5-1.5
        radius: r * 1.5, // Make food bigger
        color: color ?? 0x88ff88,
        colorPhase: Math.random() * Math.PI * 2, // Random color phase
        baseColor: color ?? 0x88ff88,
      };
      foodAnimations.set(id, anim);
    } else {
      // Update base position and properties if food moved
      anim.baseX = x;
      anim.baseY = y;
      anim.radius = r * 1.5; // Make food bigger
      anim.baseColor = color ?? 0x88ff88;
    }
    
    // Don't draw here - let animation handle it
  }

  // draw snakes
  let myHead: [number, number] | null = null;
  const myId = getMyId();
  for (const s of snapshot.snakes) {
    const color = s.color;
    usedSnakeIds.add(s.id);
    let pieces = snakePool.get(s.id);
    if (!pieces) {
      pieces = [];
      snakePool.set(s.id, pieces);
    }
    // Grow pool if needed
    while (pieces.length < s.segments.length) {
      const g = new Graphics();
      pieces.push(g);
      snakesLayer.addChild(g);
    }
    // Update or hide extra pieces
    for (let i = 0; i < pieces.length; i++) {
      const g = pieces[i];
      if (i < s.segments.length) {
        const [x, y] = s.segments[i];
        const radius = s.radius;
        g.clear();
        g.circle(x, y, radius).fill(color);
        g.visible = true;
        // Z-index: tail (0) to head (highest), so head appears on top
        g.zIndex = i;
        if (i === 0 && s.id === myId) myHead = [x, y];
      } else {
        g.visible = false;
      }
    }

    // Eyes on head
    if (s.segments.length >= 2) {
      const [hx, hy] = s.segments[0];
      const [nx, ny] = s.segments[1];
      const dx = hx - nx;
      const dy = hy - ny;
      const len = Math.hypot(dx, dy) || 1;
      const fx = dx / len; // forward
      const fy = dy / len;
      const px = -fy; // perpendicular
      const py = fx;

      const front = s.radius * 0.35;
      const side = s.radius * 0.45;
      const eyeR = s.radius * 0.5;
      const pupilR = s.radius * 0.35;

      const lx = hx + fx * front + px * side;
      const ly = hy + fy * front + py * side;
      const rx = hx + fx * front - px * side;
      const ry = hy + fy * front - py * side;

      let eyes = eyePool.get(s.id);
      if (!eyes) {
        eyes = { l: new Graphics(), r: new Graphics(), lp: new Graphics(), rp: new Graphics() };
        eyePool.set(s.id, eyes);
        snakesLayer.addChild(eyes.l);
        snakesLayer.addChild(eyes.r);
        snakesLayer.addChild(eyes.lp);
        snakesLayer.addChild(eyes.rp);
      }
      
      // Calculate eye direction based on mouse position (only for my snake)
      let eyeDirectionX = fx;
      let eyeDirectionY = fy;
      
      if (s.id === myId) {
        // Convert mouse position to world coordinates
        const worldMouseX = (mouseX - app.renderer.width / 2) / worldLayer.scale.x + hx;
        const worldMouseY = (mouseY - app.renderer.height / 2) / worldLayer.scale.y + hy;
        
        // Calculate direction from head to mouse
        const mouseDx = worldMouseX - hx;
        const mouseDy = worldMouseY - hy;
        const mouseLen = Math.hypot(mouseDx, mouseDy);
        
        if (mouseLen > 0) {
          eyeDirectionX = mouseDx / mouseLen;
          eyeDirectionY = mouseDy / mouseLen;
        }
      }
      
      // Eyeballs (white)
      eyes.l.clear();
      eyes.l.circle(lx, ly, eyeR).fill(0xffffff);
      eyes.r.clear();
      eyes.r.circle(rx, ry, eyeR).fill(0xffffff);
      
      // Pupils (black) looking in the calculated direction
      const pupilOff = s.radius * 0.2; // Slightly larger offset for more visible movement
      const leftPupilX = lx + eyeDirectionX * pupilOff;
      const leftPupilY = ly + eyeDirectionY * pupilOff;
      const rightPupilX = rx + eyeDirectionX * pupilOff;
      const rightPupilY = ry + eyeDirectionY * pupilOff;
      
      eyes.lp.clear();
      eyes.lp.circle(leftPupilX, leftPupilY, pupilR).fill(0x23272a);
      eyes.rp.clear();
      eyes.rp.circle(rightPupilX, rightPupilY, pupilR).fill(0x23272a);
      
      // Eyes should be on top of everything (higher than head)
      const headZIndex = s.segments.length - 1; // Head has highest z-index
      eyes.l.zIndex = headZIndex + 1;
      eyes.r.zIndex = headZIndex + 1;
      eyes.lp.zIndex = headZIndex + 2;
      eyes.rp.zIndex = headZIndex + 2;
    }
  }
  // Cleanup graphics not used this frame to avoid memory leaks
  for (const [id, g] of foodPool) {
    if (!usedFoodIds.has(id)) {
      if (g.parent) g.parent.removeChild(g);
      g.destroy();
      foodPool.delete(id);
      // Also cleanup animation data
      foodAnimations.delete(id);
    }
  }
  for (const [sid, pieces] of snakePool) {
    if (!usedSnakeIds.has(sid)) {
      for (const g of pieces) {
        if (g.parent) g.parent.removeChild(g);
        g.destroy();
      }
      snakePool.delete(sid);
      const eyes = eyePool.get(sid);
      if (eyes) {
        for (const g of [eyes.l, eyes.r, eyes.lp, eyes.rp]) {
          if (g.parent) g.parent.removeChild(g);
          g.destroy();
        }
        eyePool.delete(sid);
      }
    }
  }

  // center camera on my head
  if (myHead) {
    const [hx, hy] = myHead;
    const cx = app.renderer.width / 2;
    const cy = app.renderer.height / 2;
    const s = worldLayer.scale.x || 1;
    worldLayer.position.set(cx - hx * s, cy - hy * s);
  }
}

function animateFoods() {
  // Update food animations continuously at 60fps
  for (const [id, anim] of foodAnimations) {
    // Update animation phase
    anim.phase += anim.speed * 0.016; // 60fps update rate
    anim.colorPhase += 0.08; // Faster color pulsing speed (was 0.02)
    
    // Create smooth floating motion using sine waves
    const amplitude = 3; // Fixed amplitude for visible movement
    anim.offsetX = Math.sin(anim.phase) * amplitude;
    anim.offsetY = Math.cos(anim.phase * 0.7) * amplitude * 0.5; // Different frequency for Y
    
    // Create pulsing color effect (bright to dark and back)
    const colorIntensity = (Math.sin(anim.colorPhase) + 1) * 0.5; // 0 to 1
    const minBrightness = 0.3; // Minimum brightness (30%)
    const maxBrightness = 1.0; // Maximum brightness (100%)
    const brightness = minBrightness + (maxBrightness - minBrightness) * colorIntensity;
    
    // Apply brightness to the base color
    const r = Math.floor(((anim.baseColor >> 16) & 0xFF) * brightness);
    const g = Math.floor(((anim.baseColor >> 8) & 0xFF) * brightness);
    const b = Math.floor((anim.baseColor & 0xFF) * brightness);
    const pulsingColor = (r << 16) | (g << 8) | b;
    
    // Update the graphics object position
    const foodG = foodPool.get(id);
    if (foodG) {
      foodG.clear();
      const finalX = anim.baseX + anim.offsetX;
      const finalY = anim.baseY + anim.offsetY;
      
      // Draw the food with pulsing color
      foodG.circle(finalX, finalY, anim.radius).fill(pulsingColor);
    }
  }
}

function startNet() {
  onSnapshot((snap) => {
    render(snap);
  });
  
  // Start continuous animation loop
  app.ticker.add(animateFoods);
  
  connect();
}

setup();


