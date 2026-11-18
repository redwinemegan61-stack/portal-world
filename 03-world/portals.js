/* Portal World · portals, light pillars and FX (Imagination Station) · v1, 17 Nov 2026. three.js r164, procedural, no assets.

   HUB CONTRACT (unchanged from Coder's placeholder; hub.js calls this once):
     createPortals(THREE, scene, list, { stoneMat }) -> { update(time, playerPos), ... }
     list = [{index, id, name, color: THREE.Color, position: Vector3 (ring floor), angle, url}]
     update(time, playerPos) is called every frame with elapsed seconds and the player's world position.
     Footprint stays within ~3 units of each position (posts at +-2.6). The hub auto-enters at 1.6 units and prompts at 7.
     Colors come from list (GAME-KIT map: 1 pink, 2 violet, 3 teal, 4 periwinkle, 5 gold, 6 silver).

   WHAT IT ADDS (about 9 draw calls total, everything instanced or GPU-animated, works with or without bloom):
     - 12 weathered brushed-silver posts (two per gate, hub lintels sit on top), with circuit glyphs that light up as you approach
     - an outer Stonehenge ring of 18 weathered uprights with lintels (opts.outerRing=false to skip)
     - 6 portal surfaces (one instanced ShaderMaterial): concentric ripples, swirl, fresnel rim, shimmer, noise distortion
     - 6 swirling ring vortices on the floor with orbiting outlined triangles (style ref 01)
     - 6 light pillars rising into the sky, 6 colored point lights, orbiting + rising sparkles (one Points call)
     - hover state: ripples speed up and brighten inside 7 units; burst flash when the player crosses 2.4 units
     - hex-grid floor shimmer on the stone dais and floating hologram glass panels (opts.hexFloor / opts.holoPanels)

   EXTRA RETURN API (optional for the hub):
     getPortalAt(pos, radius=1.6) -> list item or null      activate(indexOrId) -> plays the enter burst
     setHighlight(indexOrId, 0..1) forces hover glow        pick(raycaster) -> list item under a ray, or null
     setIntensity(v) (0.8 default, tuned for the hub's bloom; ~1 without bloom)   dispose()
   OPTIONAL FOURTH-ARG OPTIONS: { stoneMat, sparkles: 60, outerRing: true, hexFloor: true, holoPanels: 8, intensity: 0.8, lights: true }

   AMBIENT HELPERS (named exports, not used by the hub today; each returns an Object3D with update(dt[, camera])):
     createSkyDome(THREE, {radius})  createHexGround(THREE, {size, hexSize, opaque})  createHoloPanels(THREE, {count, radius, height, size, center})
*/
let THREE = null;

/* ---------- shared GLSL ---------- */
const NOISE = /* glsl */`
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*vnoise(p);p=p*2.03+7.1;a*=.5;}return v;}
`;
const PER_PORTAL_VS = /* glsl */`
attribute float aIndex;
uniform vec3 uColor[6]; uniform float uHover[6]; uniform float uFlash[6];
varying vec3 vColor; varying float vHover; varying float vFlash; varying float vSeed;
void portalVaryings(){int i=int(aIndex+.5);vColor=uColor[i];vHover=uHover[i];vFlash=uFlash[i];vSeed=aIndex*7.31+1.7;}
`;
const PER_PORTAL_FS = `varying vec3 vColor; varying float vHover; varying float vFlash; varying float vSeed;\n`;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); }

/* ---------- procedural stone textures ---------- */
function stoneTextures(seed = 7) {
  const r = rng(seed), W = 256, H = 512;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, "#c9ced6"); grd.addColorStop(1, "#7d838e");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { // brushed vertical streaks
    const x = r() * W, l = 20 + r() * 160, y = r() * H, a = 0.03 + r() * 0.07;
    g.strokeStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(20,24,40,${a})`; g.lineWidth = 0.5 + r() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + l); g.stroke();
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "10,14,30"},${r() * 0.12})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  g.strokeStyle = "rgba(15,18,35,0.35)"; g.lineWidth = 1.2; // weathering cracks
  for (let i = 0; i < 7; i++) { let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 30; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;

  const e = document.createElement("canvas"); e.width = W; e.height = H; const q = e.getContext("2d"); // circuit glyphs
  q.fillStyle = "#000"; q.fillRect(0, 0, W, H); q.strokeStyle = "#fff"; q.fillStyle = "#fff"; q.lineWidth = 2.2; q.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    let x = 40 + Math.floor(r() * 9) * 22, y = 40 + Math.floor(r() * 20) * 22; q.beginPath(); q.moveTo(x, y);
    for (let k = 0; k < 4; k++) { if (r() > 0.5) x += (r() > 0.5 ? 1 : -1) * 22 * (1 + Math.floor(r() * 3)); else y += 22 * (1 + Math.floor(r() * 3)); x = Math.max(24, Math.min(W - 24, x)); q.lineTo(x, y); }
    q.stroke(); q.beginPath(); q.arc(x, y, 4, 0, 7); q.fill();
  }
  const emissive = new THREE.CanvasTexture(e); emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

function weatheredBox(w, h, d, seed) {
  const geo = new THREE.BoxGeometry(w, h, d, 2, 5, 2); geo.translate(0, h / 2, 0);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const hs = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const t = v.y / h, taper = 1 - 0.14 * t;
    const j = 0.06 * Math.min(w, d); v.x = v.x * taper + (hs(v.x, v.y, v.z) - 0.5) * j; v.z = v.z * taper + (hs(v.z, v.x, v.y) - 0.5) * j;
    if (t > 0.98) v.y += (hs(v.x, 1, v.z) - 0.5) * 0.12; p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}

/* ---------- materials ---------- */
function portalMaterial(u, aspect) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uAspect: { value: aspect } }, u), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: PER_PORTAL_VS + /* glsl */`
      varying vec2 vUv; varying float vFres;
      void main(){ portalVaryings(); vUv=uv;
        vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.);
        vec3 n=normalize(mat3(modelMatrix*instanceMatrix)*normal); vec3 v=normalize(cameraPosition-wp.xyz);
        vFres=1.-abs(dot(n,v)); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: PER_PORTAL_FS + NOISE + /* glsl */`
      uniform float uTime; uniform float uIntensity; uniform float uAspect; varying vec2 vUv; varying float vFres;
      void main(){
        vec2 p=vUv*2.-1.;
        float d=pow(pow(abs(p.x),3.)+pow(abs(p.y),3.),1./3.);           // rounded door shape
        float mask=1.-smoothstep(.92,1.,d); if(mask<.002) discard;
        float t=uTime*(1.+vHover*1.8);
        vec2 c=vec2(p.x*uAspect,p.y); float r=length(c); float a=atan(c.y,c.x);
        vec2 nd=vec2(fbm(c*3.+vec2(t*.3,vSeed)),fbm(c*3.+vec2(vSeed,-t*.27)))-.5;   // noise distortion
        float rr=r+nd.x*.2;
        float ripple=pow(sin(rr*26.-t*5.)*.5+.5,3.);                                // concentric ripples
        float spiral=sin((a+rr*4.-t*.9+nd.y*1.4)*3.)*.5+.5;                         // swirl
        float edge=smoothstep(.5,1.,d);
        float rim=pow(edge,2.5)*1.5+vFres*.7;                                       // fresnel rim
        vec2 sg=vUv*vec2(70.,160.); vec2 sf=fract(sg)-.5; float sh=pow(hash(floor(sg)+floor(t*9.)),40.)*exp(-dot(sf,sf)*14.)*1.4;           // shimmer
        vec3 cyan=mix(vColor,vec3(1.),.4);
        vec3 col=vColor*.16+vec3(.02,.03,.11);
        col+=vColor*(ripple*.42+spiral*.22)*(.6+.6*vHover);
        col+=vec3(1.)*pow(ripple*spiral,4.)*.35;
        col+=mix(vColor,cyan,.3)*rim*.9;
        col+=mix(vColor,vec3(1.),.4)*exp(-r*r*8.)*(.2+.45*vHover);
        col+=sh*mix(vColor,vec3(1.),.6);
        float fr=abs(r-(1.-vFlash)*1.4); col+=vec3(1.)*vFlash*(.5+2.2*exp(-fr*fr*40.));  // enter burst
        gl_FragColor=vec4(col*uIntensity,clamp(mask*(.8+.18*edge+vFlash*.2),0.,1.));
      }`,
  });
}

function vortexMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: PER_PORTAL_VS + `varying vec2 vUv; void main(){portalVaryings();vUv=uv;gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: PER_PORTAL_FS + /* glsl */`
      uniform float uTime; uniform float uIntensity; varying vec2 vUv;
      float sdTri(vec2 p){const float k=1.7320508;p.x=abs(p.x)-1.;p.y=p.y+1./k;if(p.x+k*p.y>0.)p=vec2(p.x-k*p.y,-k*p.x-p.y)/2.;p.x-=clamp(p.x,-2.,0.);return -length(p)*sign(p.y);}
      void main(){
        vec2 p=(vUv-.5)*2.; float r=length(p); if(r>1.) discard; float a=atan(p.y,p.x);
        float t=uTime*(1.+vHover*1.6);
        vec3 cyan=mix(vColor,vec3(1.),.45), pink=vColor*.8, vio=mix(vColor,vec3(1.),.2); // all tints of the portal color (GAME-KIT map)
        vec3 col=vec3(0.);
        for(int k=0;k<5;k++){ float fk=float(k); float rad=.22+fk*.17; float w=.014+.007*fk;
          float band=exp(-pow((r-rad)/w,2.));
          float dir=mod(fk,2.)*2.-1.;
          float arc=smoothstep(.25,.95,sin(a*(1.+fk*.5)+t*(1.6-fk*.22)*dir+fk*1.7+r*4.)*.5+.5);
          vec3 kc=k==0?vColor:(k==1?cyan:(k==2?pink:(k==3?vColor:vio)));
          col+=kc*band*arc*1.6; }
        float arm=pow(sin(a*3.-log(r+.002)*5.+t*2.2)*.5+.5,6.)*smoothstep(1.,.15,r);
        col+=mix(vColor,cyan,.4)*arm*.55;
        for(int k=0;k<3;k++){ float ang=t*.45+float(k)*2.0944; vec2 lp=p-vec2(cos(ang),sin(ang))*.8;
          float ra=-ang*1.3; lp=mat2(cos(ra),-sin(ra),sin(ra),cos(ra))*lp;
          float dd=sdTri(lp/.085)*.085; col+=cyan*exp(-pow(abs(dd)/.007,2.))*.9; }
        col+=mix(vColor,vec3(1.),.5)*exp(-r*r*30.)*(.6+vHover);
        float fr=abs(r-vFlash*1.0); col+=vec3(1.)*vFlash*exp(-fr*fr*60.)*2.;
        col*=smoothstep(1.,.85,r)*(.75+.6*vHover)*uIntensity;
        gl_FragColor=vec4(col,1.);
      }`,
  });
}

function beamMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: PER_PORTAL_VS + /* glsl */`varying vec2 vUv; varying float vFres;
      void main(){portalVaryings();vUv=uv;vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.);
        vec3 n=normalize(mat3(modelMatrix*instanceMatrix)*normal);vec3 v=normalize(cameraPosition-wp.xyz);
        vFres=abs(dot(n,v));gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: PER_PORTAL_FS + /* glsl */`uniform float uTime; uniform float uIntensity; varying vec2 vUv; varying float vFres;
      void main(){
        float y=vUv.y; float fade=pow(1.-y,1.4)*smoothstep(0.,.04,y);
        float streak=pow(sin(vUv.x*6.2832*4.+vSeed)*.5+.5,4.);
        float flow=pow(sin(y*60.-uTime*(3.+vHover*4.)+vUv.x*6.2832)*.5+.5,8.);
        float core=pow(vFres,2.);
        float a=fade*(core*.55+streak*.12+flow*.18)*(.75+.7*vHover+vFlash*1.5);
        gl_FragColor=vec4(mix(vColor,vec3(1.),core*.35+vFlash*.4)*a*uIntensity,1.);
      }`,
  });
}

function sparkleMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aIndex; attribute vec4 aP; attribute float aKind;
      uniform vec3 uColor[6]; uniform float uHover[6]; uniform float uFlash[6]; uniform vec3 uCenter[6];
      uniform float uTime; uniform float uSize; uniform float uPR; uniform float uBeamH;
      varying vec3 vColor; varying float vA;
      void main(){ int i=int(aIndex+.5); vec3 c=uCenter[i]; float h=uHover[i]; float f=uFlash[i];
        float t=uTime*(1.+h*1.6); vec3 pos; vColor=mix(uColor[i],vec3(1.),.35);
        if(aKind<.5){ float ang=aP.w+t*aP.z; float rad=aP.x*(1.+f*1.8-h*.25);
          pos=c+vec3(cos(ang)*rad,aP.y+sin(t*aP.z*1.3+aP.w)*.35,sin(ang)*rad); vA=.8+.6*h+f;
        } else { float y=fract(aP.w+uTime*aP.z*.05); pos=c+vec3(cos(aP.w*6.283)*aP.x,aP.y+y*uBeamH,sin(aP.w*6.283)*aP.x); vA=(1.-y)*(.7+.6*h); }
        vA*=.55+.45*sin(uTime*(3.+aP.z*2.)+aP.w*40.);
        vec4 mv=modelViewMatrix*vec4(pos,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=uSize*uPR*(1.+h*.6+f)*(30./max(-mv.z,1.)); }`,
    fragmentShader: /* glsl */`uniform float uIntensity; varying vec3 vColor; varying float vA;
      void main(){ vec2 p=gl_PointCoord*2.-1.; float d=length(p);
        float s=exp(-d*d*6.)+.6*exp(-abs(p.x)*18.)*exp(-abs(p.y)*3.)+.6*exp(-abs(p.y)*18.)*exp(-abs(p.x)*3.);
        if(s<.01) discard; gl_FragColor=vec4(vColor*s*vA*uIntensity,1.); }`,
  });
}

/* ---------- createPortals (hub contract) ---------- */
export function createPortals(T, scene, list, opts = {}) {
  THREE = T;
  const cfg = Object.assign({ sparkles: 60, outerRing: true, hexFloor: true, holoPanels: 8, intensity: 0.8, lights: true,
    enterRadius: 1.6, flashRadius: 2.4, hoverRadius: 7, beamHeight: 120, seed: 11 }, opts);
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
  if (coarse && opts.sparkles == null) cfg.sparkles = 32;
  const r = rng(cfg.seed), n = list.length;
  const root = new THREE.Group(); root.name = "PortalsFX"; scene.add(root);
  const PW = 3.8, PH = 8.6, POST_W = 1.4, POST_D = 1.6, POST_H = 9.5, POST_X = 2.6;
  const center = new THREE.Vector3(); list.forEach(p => center.add(p.position)); center.divideScalar(n || 1);
  const ringR = list.length ? Math.hypot(list[0].position.x - center.x, list[0].position.z - center.z) : 15;
  const gates = list.map(p => { const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.angle - Math.PI / 2); return { pos: p.position.clone(), quat }; });

  const U = { uTime: { value: 0 }, uIntensity: { value: cfg.intensity },
    uColor: { value: Array.from({ length: 6 }, (_, i) => (list[i] ? new THREE.Color(list[i].color) : new THREE.Color(1, 1, 1))) },
    uHover: { value: new Array(6).fill(0) }, uFlash: { value: new Array(6).fill(0) } };

  /* stones: posts per gate + optional outer ring, 2 instanced meshes */
  const tex = stoneTextures(cfg.seed);
  const stoneMat = (opts.stoneMat ? opts.stoneMat.clone() : new THREE.MeshStandardMaterial({ color: 0xC9CED6, metalness: 0.85, roughness: 0.35 }));
  stoneMat.map = tex.map; stoneMat.emissive = new THREE.Color(0x3EF2FF); stoneMat.emissiveMap = tex.emissive; stoneMat.emissiveIntensity = 0.1; stoneMat.roughness = 0.5; stoneMat.metalness = 0.55;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const ups = [], lins = [];
  gates.forEach(g => { for (const sx of [-1, 1]) { t.set(sx * POST_X, 0, 0).applyQuaternion(g.quat).add(g.pos); ups.push(m.compose(t, g.quat, s.set(POST_W, POST_H, POST_D)).clone()); } });
  if (cfg.outerRing) {
    const N = 18, R = ringR + 4.6, outer = [];
    for (let i = 0; i < N; i++) { // stones sit between portal angles so no stone blocks a portal's approach
      const a = list.length ? list[0].angle + (i + 0.5) / N * Math.PI * 2 : i / N * Math.PI * 2, h = 4.6 + r() * 1.4;
      q.setFromAxisAngle(Y, -a - Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (r() - 0.5) * 0.07));
      ups.push(m.compose(t.set(center.x + Math.cos(a) * R, 0.2, center.z + Math.sin(a) * R), q, s.set(1.6, h, 0.9)).clone()); outer.push({ a, h });
    }
    for (let i = 0; i < N; i++) { if (i % 3 === 2 || r() < 0.15) continue; // gaps to walk through + a few fallen lintels
      const A = outer[i], B = outer[(i + 1) % N], a = A.a + Math.PI / N, y = 0.2 + Math.min(A.h, B.h) - 0.3;
      q.setFromAxisAngle(Y, -a - Math.PI / 2);
      lins.push(m.compose(t.set(center.x + Math.cos(a) * R, y, center.z + Math.sin(a) * R), q, s.set(2 * R * Math.sin(Math.PI / N) + 1.4, 0.7, 1.0)).clone());
    }
  }
  const stoneMesh = (geo, mats) => { const im = new THREE.InstancedMesh(geo, stoneMat, Math.max(1, mats.length)); im.count = mats.length; mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, new THREE.Color().setHSL(0.62, 0.05 + r() * 0.06, 0.7 + r() * 0.2)); }); return im; };
  const upMesh = stoneMesh(weatheredBox(1, 1, 1, 3), ups); upMesh.name = "PortalPosts"; root.add(upMesh);
  if (lins.length) { const lm = stoneMesh(weatheredBox(1, 1, 1, 9), lins); lm.name = "OuterLintels"; root.add(lm); }

  /* per-portal FX: instanced, one draw call each */
  const idx = new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 2, 3, 4, 5]), 1);
  const instanced = (geo, mat, name, place) => { geo.setAttribute("aIndex", idx); const im = new THREE.InstancedMesh(geo, mat, n); im.name = name; im.frustumCulled = false; gates.forEach((g, i) => im.setMatrixAt(i, place(g))); root.add(im); return im; };
  const portalMesh = instanced(new THREE.PlaneGeometry(PW, PH), portalMaterial(U, PW / PH), "PortalSurfaces", g => m.compose(t.set(0, 0.1 + PH / 2, 0).add(g.pos), g.quat, s.set(1, 1, 1)).clone());
  portalMesh.renderOrder = 2;
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  instanced(new THREE.PlaneGeometry(7, 7), vortexMaterial(U), "PortalVortex", g => m.compose(t.set(0, 0.04, 0).add(g.pos), q.copy(g.quat).multiply(flat), s.set(1, 1, 1)).clone()).renderOrder = 1;
  const bGeo = new THREE.CylinderGeometry(1.7, 2.1, cfg.beamHeight, 20, 1, true); bGeo.translate(0, cfg.beamHeight / 2 + POST_H - 0.5, 0);
  instanced(bGeo, beamMaterial(U), "LightPillars", g => m.compose(t.copy(g.pos), g.quat, s.set(1, 1, 1)).clone()).renderOrder = 3;
  if (cfg.lights) list.forEach(p => { const l = new THREE.PointLight(p.color, 30, 16, 2); l.position.copy(p.position).setY(p.position.y + 4); root.add(l); });

  /* sparkles: orbiting + rising, one Points call */
  const per = Math.max(8, cfg.sparkles | 0), orbitN = Math.round(per * 0.65), total = per * n;
  const aIndex = new Float32Array(total), aP = new Float32Array(total * 4), aKind = new Float32Array(total);
  for (let i = 0, k = 0; i < n; i++) for (let j = 0; j < per; j++, k++) {
    aIndex[k] = i; const orbit = j < orbitN; aKind[k] = orbit ? 0 : 1;
    if (orbit) aP.set([2.4 + r() * 1.6, 0.6 + r() * 8.5, (0.3 + r() * 0.8) * (r() > 0.5 ? 1 : -1), r() * 6.283], k * 4);
    else aP.set([r() * 1.4, POST_H, 0.6 + r() * 1.2, r()], k * 4);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  pGeo.setAttribute("aIndex", new THREE.BufferAttribute(aIndex, 1)); pGeo.setAttribute("aP", new THREE.BufferAttribute(aP, 4)); pGeo.setAttribute("aKind", new THREE.BufferAttribute(aKind, 1));
  const SU = Object.assign({}, U, { uCenter: { value: Array.from({ length: 6 }, (_, i) => (gates[i] ? gates[i].pos.clone() : new THREE.Vector3())) },
    uSize: { value: 12 }, uPR: { value: Math.min((typeof devicePixelRatio === "number" ? devicePixelRatio : 1), 2) }, uBeamH: { value: 50 } });
  const sparkles = new THREE.Points(pGeo, sparkleMaterial(SU)); sparkles.frustumCulled = false; sparkles.name = "PortalSparkles"; sparkles.renderOrder = 4; root.add(sparkles);

  /* ambient: hex shimmer on the dais + hologram panels */
  const ambient = [];
  if (cfg.hexFloor) { const h = createHexGround(THREE, { size: (ringR + 5) * 2, hexSize: 1.4, fadeRadius: 0.5 }); h.position.set(center.x, center.y + 0.03, center.z); root.add(h); ambient.push(h); }
  if (cfg.holoPanels) { const hp = createHoloPanels(THREE, { count: coarse ? Math.min(5, cfg.holoPanels) : cfg.holoPanels, radius: ringR + 12, height: [9, 18], size: [4, 7], center }); root.add(hp); ambient.push(hp); }

  /* state + API */
  const state = list.map(() => ({ hover: 0, flash: 0, inside: null, forced: 0 }));
  let last = null, glyph = 0;
  const dist = (i, pos) => Math.hypot(pos.x - gates[i].pos.x, pos.z - gates[i].pos.z);
  const indexOf = w => typeof w === "number" ? w - 1 : list.findIndex(p => p.id === (w && typeof w === "object" ? w.id : w));
  const api = {
    group: root, portals: list,
    update(time, playerPos) {
      const dt = last == null ? 0 : Math.min(Math.max(time - last, 0), 0.1); last = time; U.uTime.value = time;
      let near = 0;
      for (let i = 0; i < n; i++) {
        const st = state[i]; let target = st.forced;
        if (playerPos) { const d = dist(i, playerPos);
          target = Math.max(target, Math.min(1, Math.max(0, (cfg.hoverRadius - d) / (cfg.hoverRadius - cfg.enterRadius))));
          const inside = d < cfg.flashRadius; if (st.inside === false && inside) st.flash = 1; st.inside = inside; }
        st.hover += (target - st.hover) * Math.min(1, dt * 6); st.flash = Math.max(0, st.flash - dt * 1.4);
        U.uHover.value[i] = st.hover; U.uFlash.value[i] = st.flash; near = Math.max(near, st.hover);
      }
      if (playerPos) near = Math.max(near, Math.min(1, Math.max(0, 1 - (Math.hypot(playerPos.x - center.x, playerPos.z - center.z) - ringR) / 10)));
      glyph += ((0.08 + near * 0.55) - glyph) * Math.min(1, dt * 3); stoneMat.emissiveIntensity = glyph * (0.85 + 0.15 * Math.sin(time * 3));
      ambient.forEach(a => a.update(dt));
    },
    getPortalAt(pos, radius = cfg.enterRadius) { for (let i = 0; i < n; i++) if (dist(i, pos) < radius) return list[i]; return null; },
    pick(raycaster) { const h = raycaster.intersectObject(portalMesh, false)[0]; return h && h.instanceId != null ? list[h.instanceId] : null; },
    activate(w) { const i = indexOf(w); if (i >= 0 && i < n) { state[i].flash = 1; return list[i]; } return null; },
    setHighlight(w, v = 1) { const i = indexOf(w); if (i >= 0 && i < n) state[i].forced = v; },
    setIntensity(v) { U.uIntensity.value = v; },
    dispose() { root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); tex.map.dispose(); tex.emissive.dispose(); scene.remove(root); },
  };
  return api;
}

/* ---------- ambient FX helpers ---------- */

/** Starfield + nebula + faint hex grid + rainbow god-rays. Follows the camera if you call update(dt, camera). */
export function createSkyDome(T, opts = {}) {
  THREE = T;
  const cfg = Object.assign({ radius: 450, intensity: 1, rays: true }, opts);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: cfg.intensity }, uRays: { value: cfg.rays ? 1 : 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime; uniform float uIntensity; uniform float uRays; varying vec3 vDir;
      float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float hexDist(vec2 p){p=abs(p);return max(dot(p,normalize(vec2(1.,1.7320508))),p.x);}
      void main(){
        vec3 d=normalize(vDir); float up=clamp(d.y,-1.,1.);
        vec3 col=mix(vec3(.04,.08,.25),vec3(.02,.04,.14),smoothstep(0.,.9,up));                // deep navy
        col=mix(col,vec3(.08,.07,.28),exp(-abs(up)*7.)*.8);                                       // horizon glow
        vec2 pp=d.xz/(abs(d.y)+.35);
        float n=fbm(pp*1.3+uTime*.01), n2=fbm(pp*2.7-uTime*.013+4.);
        col+=vec3(.55,.2,.9)*pow(n,3.)*.55+vec3(.1,.7,.9)*pow(n2,4.)*.45+vec3(1.,.2,.6)*pow(n*n2,3.)*.4; // nebula
        vec3 g=d*260.; vec3 id=floor(g); float hs=h3(id);
        if(hs>.993){ vec3 f=fract(g)-.5; float st=exp(-dot(f,f)*28.); col+=mix(vec3(.6,.8,1.),vec3(.4,1.,1.),h3(id+3.))*st*(.6+.4*sin(uTime*2.+hs*90.))*1.3; }
        if(up>0.){ vec2 hp=pp*3.; vec2 r=vec2(1.,1.7320508),hh=r*.5; vec2 a=mod(hp,r)-hh,b=mod(hp-hh,r)-hh; vec2 gv=dot(a,a)<dot(b,b)?a:b;
          float e=.5-hexDist(gv); col+=vec3(.25,.85,1.)*smoothstep(.035,0.,e)*.09*smoothstep(0.,.4,up)*(.6+.4*sin(uTime*.7+pp.x)); }
        if(uRays>.5){ float s=d.x*.78+d.y*.62+d.z*.1;
          for(int k=0;k<3;k++){ float fk=float(k); float c0=.32+fk*.09; float band=exp(-pow((s-c0)/(.035+.01*fk),2.))*smoothstep(-.05,.5,up);
            vec3 rc=k==0?vec3(.6,.3,1.):(k==1?vec3(.25,.95,1.):vec3(.49,1.,.42)); col+=rc*band*(.22+.05*sin(uTime*.6+fk*2.)); } }
        gl_FragColor=vec4(col*uIntensity,1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius, 48, 24), mat); mesh.name = "SkyDome"; mesh.frustumCulled = false; mesh.renderOrder = -10;
  let time = 0;
  mesh.update = (dt, camera) => { time += Math.min(dt || 0, 0.1); mat.uniforms.uTime.value = time; if (camera) mesh.position.copy(camera.position); };
  mesh.dispose = () => { mesh.geometry.dispose(); mat.dispose(); };
  return mesh;
}

/** Glowing hex-grid shimmer for the ground. Additive overlay by default (lay it ~0.03 above your terrain); opaque:true for a solid floor. */
export function createHexGround(T, opts = {}) {
  THREE = T;
  const cfg = Object.assign({ size: 80, hexSize: 1.2, color: "#3EF2FF", accent: "#8B5CF6", opaque: false, intensity: 1, fadeRadius: 0.48 }, opts);
  const mat = new THREE.ShaderMaterial({
    transparent: !cfg.opaque, depthWrite: cfg.opaque, blending: cfg.opaque ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(cfg.color) }, uAccent: { value: new THREE.Color(cfg.accent) },
      uScale: { value: cfg.size / cfg.hexSize }, uIntensity: { value: cfg.intensity }, uOpaque: { value: cfg.opaque ? 1 : 0 }, uFade: { value: cfg.fadeRadius } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: NOISE + /* glsl */`uniform float uTime,uScale,uIntensity,uOpaque,uFade; uniform vec3 uColor,uAccent; varying vec2 vUv;
      float hexDist(vec2 p){p=abs(p);return max(dot(p,normalize(vec2(1.,1.7320508))),p.x);}
      void main(){ vec2 c=vUv-.5; float rad=length(c);
        vec2 hp=vUv*uScale; vec2 r=vec2(1.,1.7320508),hh=r*.5; vec2 a=mod(hp,r)-hh,b=mod(hp-hh,r)-hh; vec2 gv=dot(a,a)<dot(b,b)?a:b; vec2 id=hp-gv;
        float e=.5-hexDist(gv); float line=smoothstep(.05,0.,e);
        float wave=exp(-pow(fract(rad*3.-uTime*.15)-.5,2.)*60.);
        float sh=fbm(id*.15+uTime*.2); float cell=pow(hash(id+floor(uTime*.8)),30.);
        vec3 col=uColor*line*(.18+.5*wave+.35*sh)+mix(uColor,uAccent,sh)*cell*.25*(1.-line);
        float fade=smoothstep(uFade,uFade*.3,rad);
        col*=fade*uIntensity;
        if(uOpaque>.5) col+=mix(vec3(.03,.06,.18),vec3(.02,.03,.1),rad*2.);
        gl_FragColor=vec4(col,1.); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size, cfg.size), mat); mesh.rotation.x = -Math.PI / 2; mesh.name = "HexGround"; mesh.renderOrder = cfg.opaque ? 0 : 1;
  let time = 0; mesh.update = dt => { time += Math.min(dt || 0, 0.1); mat.uniforms.uTime.value = time; };
  mesh.dispose = () => { mesh.geometry.dispose(); mat.dispose(); };
  return mesh;
}

/** Floating holographic glass panels (cyan frame, orange accents, aurora waves). One instanced draw call. */
export function createHoloPanels(T, opts = {}) {
  THREE = T;
  const cfg = Object.assign({ count: 8, radius: 20, height: [5, 11], size: [3, 5], center: null, intensity: 1, seed: 5 }, opts);
  const r = rng(cfg.seed); cfg.center = cfg.center || new THREE.Vector3();
  const geo = new THREE.PlaneGeometry(1.6, 1);
  const ph = new Float32Array(cfg.count); for (let i = 0; i < cfg.count; i++) ph[i] = r() * 100;
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: cfg.intensity } },
    vertexShader: `attribute float aPhase; uniform float uTime; varying vec2 vUv; varying float vPh;
      void main(){ vUv=uv; vPh=aPhase; vec3 p=position; p.y+=sin(uTime*.8+aPhase)*.08;
        vec4 wp=modelMatrix*instanceMatrix*vec4(p,1.); wp.y+=sin(uTime*.5+aPhase)*.35; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`uniform float uTime,uIntensity; varying vec2 vUv; varying float vPh;
      float box(vec2 p,vec2 b,float rr){vec2 q=abs(p)-b+rr;return length(max(q,0.))+min(max(q.x,q.y),0.)-rr;}
      float outline(float d,float w){return exp(-pow(d/w,2.));}
      void main(){ vec2 p=(vUv-.5)*vec2(1.6,1.);
        vec3 cyan=vec3(.24,.95,1.), orange=vec3(1.,.54,.24), pink=vec3(1.,.18,.6), vio=vec3(.55,.36,.96);
        float frame=box(p,vec2(.78,.48),.05); if(frame>.03) discard;
        vec3 col=cyan*outline(frame,.008)*1.4+cyan*.05*step(frame,0.);
        vec2 sp=p-vec2(-.12,-.02); float scr=box(sp,vec2(.5,.36),.02);
        col+=cyan*outline(scr,.005)*.8;
        if(scr<0.){ float y=sp.y*6.; float w1=sin(sp.x*9.+uTime*1.5+vPh)*.6, w2=sin(sp.x*7.-uTime*1.1+vPh*2.)*.7;
          col+=pink*exp(-pow((y-w1)*2.5,2.))*.7+cyan*exp(-pow((y-w2)*2.5,2.))*.7+vio*.08; }
        for(int k=0;k<3;k++){ float fk=float(k); float b=box(p-vec2(.58,.28-fk*.22),vec2(.13,.06),.01); col+=orange*outline(b,.006)*.9; }
        float bl=box(p-vec2(-.12,-.43),vec2(.5,.025),.01); col+=orange*outline(bl,.005)*.7;
        for(int k=0;k<3;k++){ col+=orange*exp(-pow(length(p-vec2(-.7+float(k)*.05,.42))/.012,2.)); }
        float scan=.85+.15*sin(vUv.y*120.-uTime*4.);
        gl_FragColor=vec4(col*scan*uIntensity,1.); }`,
  });
  const im = new THREE.InstancedMesh(geo, mat, cfg.count); im.name = "HoloPanels"; im.frustumCulled = false;
  const o = new THREE.Object3D();
  for (let i = 0; i < cfg.count; i++) {
    const a = (i / cfg.count) * Math.PI * 2 + r() * 0.5, rad = cfg.radius * (0.85 + r() * 0.3), y = cfg.height[0] + r() * (cfg.height[1] - cfg.height[0]);
    o.position.set(cfg.center.x + Math.cos(a) * rad, cfg.center.y + y, cfg.center.z + Math.sin(a) * rad);
    o.lookAt(cfg.center.x, cfg.center.y + y * 0.6, cfg.center.z); o.rotateY((r() - 0.5) * 0.5);
    const sc = cfg.size[0] + r() * (cfg.size[1] - cfg.size[0]); o.scale.setScalar(sc); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  }
  let time = 0; im.update = dt => { time += Math.min(dt || 0, 0.1); mat.uniforms.uTime.value = time; };
  im.dispose = () => { geo.dispose(); mat.dispose(); };
  return im;
}
