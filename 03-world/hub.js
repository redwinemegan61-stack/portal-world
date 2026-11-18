/* Portal World hub engine (Coder). three.js r164, MIT.
   Landscape, sky, waterfall, stone circle, player movement, portal entry.
   Portal visuals live in ./portals.js (owned by Imagination Station; Coder shipped a working placeholder).
   Contract:  export function createPortals(THREE, scene, portals, { stoneMat }) -> { update(time, playerPos) }
   where portals = [{index, name, color (THREE.Color), position (Vector3), angle}] */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createPortals } from "./portals.js";

window.addEventListener("error", e => { document.getElementById("err").textContent = "Error: " + e.message; });

export const GAMES = [
  { id: "petal-blast",    name: "Petal Blast",    desc: "Block puzzle",   color: 0xFF2E9A },
  { id: "potion-sort",    name: "Potion Sort",    desc: "Color sort",     color: 0x8B5CF6 },
  { id: "crystal-guard",  name: "Crystal Guard",  desc: "Tower defense",  color: 0x19E3D1 },
  { id: "synapse-dash",   name: "Synapse Dash",   desc: "Rhythm runner",  color: 0x8EA2FF },
  { id: "lantern-runner", name: "Lantern Runner", desc: "Endless runner", color: 0xFFC857 },
  { id: "crystal-merge",  name: "Crystal Merge",  desc: "Merge puzzle",   color: 0xE6ECF5 },
];

const isTouch = matchMedia("(pointer:coarse)").matches;
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0B1240, 0.0065);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 0.7);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- noise + terrain height ---------- */
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 1, f = 1; for (let i = 0; i < 4; i++) { s += vnoise(x * f, y * f) * a; a *= 0.5; f *= 2; } return s / 1.875; }
const POOL = new THREE.Vector2(0, -95), POOL_R = 22;
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.012 + 10, z * 0.012 + 10) - 0.5) * 22;
  h += Math.max(0, r - 120) * 0.35;                                  // hills rise at the world edge
  const flat = THREE.MathUtils.smoothstep(r, 26, 46); h *= flat;      // flat plaza at the center
  const pd = Math.hypot(x - POOL.x, z - POOL.y);                      // carve the waterfall pool
  if (pd < POOL_R + 10) h = THREE.MathUtils.lerp(-3.2, h, THREE.MathUtils.smoothstep(pd, POOL_R - 4, POOL_R + 10));
  return h;
}

/* ---------- sky: navy starfield, faint hex grid, rainbow beams ---------- */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec3 vDir; uniform float uTime;
    float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float hexEdge(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x),2.0)*0.5; p = abs(fract(p)-0.5); return abs(max(p.x*1.5+p.y, p.y*2.0)-1.0); }
    void main(){
      vec3 d = normalize(vDir); float y = d.y;
      vec3 col = mix(vec3(0.03,0.05,0.16), vec3(0.04,0.08,0.25), smoothstep(-0.1,0.4,y));
      col = mix(col, vec3(0.02,0.03,0.11), smoothstep(0.4,1.0,y));
      vec2 uv = vec2(atan(d.z,d.x)*12.0, asin(clamp(y,-1.0,1.0))*24.0);
      vec2 cell = floor(uv*8.0); float s = h21(cell);
      float tw = 0.6+0.4*sin(uTime*2.0+s*40.0);
      vec2 f = fract(uv*8.0)-0.5; float star = step(0.985,s)*smoothstep(0.18,0.0,length(f));
      col += vec3(0.7,0.85,1.0) * star * tw * smoothstep(0.0,0.15,y) * 1.2;
      float hx = 1.0 - smoothstep(0.0,0.06,hexEdge(uv*0.6));
      col += vec3(0.15,0.45,0.9) * hx * 0.035 * smoothstep(0.05,0.5,y);
      float bx = d.x*0.8 + y*0.9 - 0.35 + sin(uTime*0.05)*0.05;
      vec3 beam = 0.5+0.5*cos(6.2831*(bx*1.6+vec3(0.0,0.33,0.67)));
      col += beam * exp(-pow(bx*3.0,2.0)) * 0.12 * smoothstep(0.0,0.3,y) * smoothstep(-0.2,0.6,d.z*-1.0+0.4);
      gl_FragColor = vec4(col,1.0);
    }`
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat));

/* ---------- ground ---------- */
const SIZE = 420, SEG = isTouch ? 140 : 200;
const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); groundGeo.rotateX(-Math.PI / 2);
{
  const p = groundGeo.attributes.position, cols = [];
  const c1 = new THREE.Color(0x1B4A5E), c2 = new THREE.Color(0x3A2470), c3 = new THREE.Color(0x1C5A66), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = heightAt(x, z); p.setY(i, y);
    const n = fbm(x * 0.04, z * 0.04);
    tmp.copy(c1).lerp(c2, n).lerp(c3, THREE.MathUtils.clamp(y / 14, 0, 1)); cols.push(tmp.r, tmp.g, tmp.b);
  }
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); groundGeo.computeVertexNormals();
}
scene.add(new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 })));

scene.add(new THREE.HemisphereLight(0x7f9cff, 0x2a1a5a, 1.6));
const moon = new THREE.DirectionalLight(0xbfd4ff, 0.9); moon.position.set(-60, 120, 40); scene.add(moon);

/* ---------- glowing grass tips + flowers (points) ---------- */
function scatter(n, minR, maxR, avoidPool) {
  const out = [];
  while (out.length < n) {
    const a = Math.random() * Math.PI * 2, r = minR + Math.sqrt(Math.random()) * (maxR - minR);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (avoidPool && Math.hypot(x - POOL.x, z - POOL.y) < POOL_R + 6) continue;
    out.push(new THREE.Vector3(x, heightAt(x, z), z));
  }
  return out;
}
const FLOWER_COLS = [0xFF2E9A, 0x8B5CF6, 0x19E3D1, 0x3EF2FF, 0xFFB8DC].map(c => new THREE.Color(c));
{
  const pts = scatter(isTouch ? 3500 : 7000, 18, 190, true), pos = [], col = [], seed = [];
  pts.forEach(v => { pos.push(v.x, v.y + 0.25, v.z); const c = FLOWER_COLS[(Math.random() * 5) | 0]; col.push(c.r, c.g, c.b); seed.push(Math.random() * 6.28); });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("seed", new THREE.Float32BufferAttribute(seed, 1));
  var flowerMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { uTime: { value: 0 }, uScale: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float seed; varying vec3 vC; varying float vA; uniform float uTime; uniform float uScale;
      void main(){ vC = color; vec3 p = position; p.y += sin(uTime*1.5+seed)*0.12; vec4 mv = modelViewMatrix*vec4(p,1.0);
      vA = 0.55+0.45*sin(uTime*2.0+seed*3.0); gl_PointSize = (9.0*uScale)*(30.0/-mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*1.6, a*vA); }`
  });
  scene.add(new THREE.Points(g, flowerMat));
  window.__flowerMat = flowerMat;
}

/* ---------- crystal trees (instanced) ---------- */
{
  const spots = scatter(isTouch ? 70 : 120, 42, 185, true);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.55, 6, 6); trunkGeo.translate(0, 3, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 0); crownGeo.translate(0, 7.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9aa6c8, metalness: 0.8, roughness: 0.3, emissive: 0x241450, emissiveIntensity: 0.6 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  const crownCols = [0xFF2E9A, 0x19E3D1, 0x8B5CF6, 0x3EF2FF].map(c => new THREE.Color(c).multiplyScalar(0.85));
  spots.forEach((v, i) => {
    const k = 0.7 + Math.random() * 0.9; e.set(0, Math.random() * 6.28, (Math.random() - 0.5) * 0.12); q.setFromEuler(e); s.set(k, k, k);
    m.compose(v, q, s); trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m); crowns.setColorAt(i, crownCols[i % 4]);
  });
  scene.add(trunks, crowns);
}

/* ---------- waterfall: floating island, falling sheet, pool, mist ---------- */
const water = { mats: [] };
{
  const top = 46, fx = POOL.x, fz = POOL.y - 14;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(14, 1), new THREE.MeshStandardMaterial({ color: 0x2a2f52, roughness: 0.8, metalness: 0.2, flatShading: true, emissive: 0x120a30 }));
  rock.scale.set(1.4, 0.7, 1); rock.position.set(fx, top + 4, fz - 4); scene.add(rock);
  const flowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      float n(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){ vec2 uv = vUv; float streak = n(vec2(floor(uv.x*40.0),0.0));
        float flow = fract(uv.y*3.0 + uTime*(0.9+streak*0.6)); float s = smoothstep(0.0,0.4,flow)*smoothstep(1.0,0.6,flow);
        vec3 c = mix(vec3(0.24,0.95,1.0), vec3(0.75,0.45,1.0), uv.x + 0.2*sin(uTime+uv.y*6.0));
        float edge = smoothstep(0.0,0.12,uv.x)*smoothstep(1.0,0.88,uv.x);
        gl_FragColor = vec4(c*(0.55+s*0.8), edge*(0.45+s*0.4)); }`
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(9, top + 3, 1, 1), flowMat);
  sheet.position.set(fx, (top + 3) / 2 - 3, fz + 9); scene.add(sheet); water.mats.push(flowMat);
  const poolMat = new THREE.ShaderMaterial({
    transparent: true, uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector2(fx, fz + 9) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec2 uCenter;
      void main(){ float d = distance(vW.xz,uCenter); float r = sin(d*1.6 - uTime*3.0)*0.5+0.5; r = pow(r,6.0)*exp(-d*0.05);
        vec3 c = mix(vec3(0.02,0.10,0.25), vec3(0.08,0.35,0.55), 0.5+0.5*sin(vW.x*0.15+uTime*0.4));
        c += vec3(0.3,0.95,1.0)*r*0.9; gl_FragColor = vec4(c, 0.88); }`
  });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL_R + 2, 64), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(POOL.x, -1.2, POOL.y); scene.add(pool); water.mats.push(poolMat);
  const n = 400, mp = new Float32Array(n * 3); water.mist = { base: [] };
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = Math.random() * 8; mp[i * 3] = fx + Math.cos(a) * r; mp[i * 3 + 1] = Math.random() * 8 - 1; mp[i * 3 + 2] = fz + 9 + Math.sin(a) * r; water.mist.base.push(Math.random()); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  water.mist.points = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xbfe9ff, size: 1.4, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(water.mist.points);
}

/* ---------- stone circle + portal positions ---------- */
const RING_R = 15;
const stoneMat = new THREE.MeshStandardMaterial({ color: 0xC9CED6, metalness: 0.85, roughness: 0.35, emissive: 0x1a1240, emissiveIntensity: 0.4 });
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(RING_R + 5, RING_R + 6, 0.8, 64), new THREE.MeshStandardMaterial({ color: 0x1c2044, metalness: 0.6, roughness: 0.5 }));
  base.position.y = 0.1; scene.add(base);
  const glyphMat = new THREE.MeshBasicMaterial({ color: 0x3EF2FF, transparent: true, opacity: 0.6 });
  [RING_R + 3.6, 6].forEach(r => { const g = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 96), glyphMat); g.rotation.x = -Math.PI / 2; g.position.y = 0.55; scene.add(g); });
  const mark = new THREE.Mesh(new THREE.CircleGeometry(2.4, 6), new THREE.MeshBasicMaterial({ color: 0xFF2E9A, transparent: true, opacity: 0.7 }));
  mark.rotation.x = -Math.PI / 2; mark.position.y = 0.56; scene.add(mark);
}
const portals = GAMES.map((g, i) => {
  const angle = (i / GAMES.length) * Math.PI * 2 + Math.PI / 2;  // game-1 faces the spawn point
  const position = new THREE.Vector3(Math.cos(angle) * RING_R, 0.5, Math.sin(angle) * RING_R);
  return { index: i + 1, id: g.id, name: g.name, desc: g.desc, color: new THREE.Color(g.color), position, angle, url: `../04-games/game-${i + 1}/index.html` };
});
// Lintel stones between pillars (Stonehenge look)
portals.forEach((p, i) => {
  const q = portals[(i + 1) % portals.length], mid = p.position.clone().add(q.position).multiplyScalar(0.5);
  const len = p.position.distanceTo(q.position) - 3;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 1.6), stoneMat);
  lintel.position.set(mid.x, 9.6, mid.z); lintel.lookAt(new THREE.Vector3(0, 9.6, 0)); scene.add(lintel);
});

let portalFx = null;
try { portalFx = createPortals(THREE, scene, portals, { stoneMat }); } catch (err) { console.warn("[hub] portals.js failed", err); }

/* ---------- player ---------- */
const player = { pos: new THREE.Vector3(0, 0, 50), yaw: 0, pitch: -0.04, vel: new THREE.Vector3() };
const fromId = new URLSearchParams(location.hash.slice(1)).get("from");
const fromPortal = portals.find(p => p.id === fromId);
if (fromPortal) { const out = fromPortal.position.clone().setY(0).normalize(); player.pos.copy(fromPortal.position).multiplyScalar(1.6).setY(0); player.yaw = Math.atan2(out.x, out.z); }
const keys = {};
addEventListener("keydown", e => { keys[e.code] = true; if (e.code === "Enter" && nearPortal) enter(nearPortal); });
addEventListener("keyup", e => { keys[e.code] = false; });
// look: mouse drag on desktop, right-side drag on touch
let look = null;
renderer.domElement.addEventListener("pointerdown", e => { if (e.pointerType === "touch" && e.clientX < innerWidth * 0.4) return; look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; });
addEventListener("pointermove", e => { if (!look || e.pointerId !== look.id) return; const dx = e.clientX - look.x, dy = e.clientY - look.y; look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
  player.yaw -= dx * 0.005; player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.004, -0.9, 0.6); });
addEventListener("pointerup", e => { if (look && e.pointerId === look.id) { if (look.moved < 6) tapPick(e); look = null; } });
// joystick
const stick = document.getElementById("stick"), knob = stick.querySelector("i"); const joy = { x: 0, y: 0, id: null };
stick.addEventListener("pointerdown", e => { joy.id = e.pointerId; stick.setPointerCapture(e.pointerId); moveJoy(e); });
stick.addEventListener("pointermove", e => { if (e.pointerId === joy.id) moveJoy(e); });
stick.addEventListener("pointerup", () => { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ""; });
function moveJoy(e) { const r = stick.getBoundingClientRect(); let x = (e.clientX - r.left - 60) / 50, y = (e.clientY - r.top - 60) / 50; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; knob.style.transform = `translate(${x * 35}px,${y * 35}px)`; }
// tap/click a portal
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function tapPick(e) { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  let best = null, bd = 2.6; portals.forEach(p => { const c = p.position.clone().setY(4.5); const d = ray.ray.distanceToPoint(c); if (d < bd && camera.position.distanceTo(c) < 45) { bd = d; best = p; } }); if (best) enter(best); }

/* ---------- portal prompt + entry ---------- */
const promptEl = document.getElementById("prompt"); let nearPortal = null, entering = false;
document.getElementById("pgo").onclick = () => nearPortal && enter(nearPortal);
function enter(p) { if (entering) return; entering = true; const f = document.getElementById("fade"); f.style.background = "#" + p.color.getHexString(); f.style.opacity = 1; setTimeout(() => { location.href = p.url; }, 480); }
addEventListener("pageshow", () => { entering = false; document.getElementById("fade").style.opacity = 0; });

/* ---------- loop ---------- */
const clock = new THREE.Clock(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
  const speed = keys.ShiftLeft || keys.ShiftRight ? 22 : 12;
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)); right.set(-fwd.z, 0, fwd.x);
  const want = fwd.multiplyScalar(mz).add(right.multiplyScalar(mx)); if (want.lengthSq() > 1) want.normalize();
  player.vel.lerp(want.multiplyScalar(speed), 1 - Math.exp(-dt * 8));
  player.pos.addScaledVector(player.vel, dt);
  const r = Math.hypot(player.pos.x, player.pos.z); if (r > 175) player.pos.multiplyScalar(175 / r);
  if (Math.hypot(player.pos.x - POOL.x, player.pos.z - POOL.y) < POOL_R - 2) { const d = new THREE.Vector2(player.pos.x - POOL.x, player.pos.z - POOL.y).setLength(POOL_R - 2); player.pos.x = POOL.x + d.x; player.pos.z = POOL.y + d.y; }
  const bob = Math.sin(t * 9) * 0.06 * Math.min(1, player.vel.length() / 10);
  camera.position.set(player.pos.x, Math.max(heightAt(player.pos.x, player.pos.z), 0.5) + 2.2 + bob, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");

  // portals: prompt when near, auto-enter when walking through
  nearPortal = null; let nd = 7;
  portals.forEach(p => { const d = Math.hypot(player.pos.x - p.position.x, player.pos.z - p.position.z); if (d < nd) { nd = d; nearPortal = p; } });
  if (nearPortal) { document.getElementById("pname").textContent = nearPortal.name; document.getElementById("pdesc").textContent = nearPortal.desc + (isTouch ? "" : " · press Enter");
    promptEl.style.setProperty("--c", "#" + nearPortal.color.getHexString()); promptEl.querySelector("b").style.textShadow = `0 0 12px #${nearPortal.color.getHexString()}`; promptEl.classList.add("on");
    if (nd < 1.6) enter(nearPortal); } else promptEl.classList.remove("on");

  portalFx && portalFx.update(t, player.pos);
  skyMat.uniforms.uTime.value = t; window.__flowerMat.uniforms.uTime.value = t; water.mats.forEach(m => m.uniforms.uTime.value = t);
  const mpos = water.mist.points.geometry.attributes.position; for (let i = 0; i < mpos.count; i++) { let y = mpos.getY(i) + dt * (1.5 + water.mist.base[i] * 2); if (y > 9) y = -1; mpos.setY(i, y); } mpos.needsUpdate = true;
  composer.render();
  requestAnimationFrame(tick);
}
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
const ld = document.getElementById("loading"); ld.style.opacity = 0; setTimeout(() => ld.remove(), 700);
tick();
