// Hero background: a flowing "signal" field of instanced particles.
// Rendered with three.js WebGPURenderer, which uses WebGPU where the browser
// has it and falls back to WebGL2 otherwise. All motion is computed in the
// vertex stage from instanceIndex + time, so there is no per-frame CPU work
// beyond the cursor uniform.
import * as THREE from 'three/webgpu';
import {
  color,
  exp,
  float,
  hash,
  instanceIndex,
  length,
  mix,
  sin,
  smoothstep,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';

export interface FieldHandle {
  backend: 'WebGPU' | 'WebGL2';
  canvas: HTMLCanvasElement;
  dispose(): void;
}

export async function startField(canvas: HTMLCanvasElement): Promise<FieldHandle> {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 720px)').matches;

  const cols = small ? 120 : 220;
  const rows = small ? 70 : 110;
  const W = small ? 18 : 30;
  const D = 16;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 3.4, 9.5);
  camera.lookAt(0, -0.4, -2);

  // — Uniforms ——————————————————————————————————————————————
  const uTime = uniform(0);
  const uMouse = uniform(new THREE.Vector2(99, 99));
  const uPulse = uniform(0);

  // — Per-instance position ——————————————————————————————————
  const idx = instanceIndex.toFloat();
  const col = idx.mod(cols);
  const row = idx.div(cols).floor();
  const x = col.div(cols - 1).sub(0.5).mul(W);
  const z = row.div(rows - 1).sub(0.5).mul(D);
  const t = uTime.mul(0.55);

  const wave = sin(x.mul(0.32).add(t))
    .mul(0.55)
    .add(sin(z.mul(0.48).sub(t.mul(0.8))).mul(0.38))
    .add(sin(x.mul(0.85).add(z.mul(0.6)).add(t.mul(1.35))).mul(0.16));

  // Cursor ripple, projected onto the field plane.
  const d = length(vec2(x, z).sub(uMouse));
  const ripple = sin(d.mul(2.4).sub(uTime.mul(3.2)))
    .mul(0.42)
    .mul(exp(d.mul(-0.45)))
    .mul(uPulse);
  const y = wave.add(ripple);

  const jx = hash(idx).sub(0.5).mul(0.1);
  const jz = hash(idx.add(17)).sub(0.5).mul(0.1);

  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.positionNode = vec3(x.add(jx), y, z.add(jz));
  material.scaleNode = float(small ? 0.075 : 0.06).mul(hash(idx.add(3)).mul(0.9).add(0.55));

  // — Colour: deep blue troughs, bright crests, fade into the distance ——
  const vy = varying(y);
  const vz = varying(z);
  const vNear = varying(exp(d.mul(-0.6)).mul(uPulse));
  const base = mix(color('#1e3a8a'), color('#7fa8ff'), smoothstep(-0.9, 1.0, vy));
  material.colorNode = mix(base, color('#c7f0ff'), vNear.mul(0.7));
  const dot = smoothstep(0.5, 0.0, length(uv().sub(0.5)));
  const depthFade = smoothstep(float(-D / 2), float(D / 4), vz);
  material.opacityNode = dot.mul(depthFade).mul(0.85);

  const particles = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  particles.count = cols * rows;
  particles.frustumCulled = false;
  scene.add(particles);

  // — Renderer: WebGPU first, WebGL2 if WebGPU init or its first frame fails.
  // Some shipping browsers expose WebGPU but reject parts of the API three
  // uses, so a successful init() is not enough; render one frame to prove it.
  // A canvas that has handed out a WebGPU context cannot give a WebGL one,
  // so the fallback runs on a fresh clone.
  const makeRenderer = async (forceWebGL: boolean) => {
    const r = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: true, forceWebGL });
    r.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
    r.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
    await r.init();
    r.render(scene, camera);
    return r;
  };
  let renderer: THREE.WebGPURenderer;
  try {
    renderer = await makeRenderer(false);
  } catch (e) {
    console.info('WebGPU unavailable, using WebGL2:', (e as Error).message);
    const fresh = canvas.cloneNode() as HTMLCanvasElement;
    canvas.replaceWith(fresh);
    canvas = fresh;
    renderer = await makeRenderer(true);
  }
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  // — Sizing ————————————————————————————————————————————————
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // — Pointer → field-plane coordinates ——————————————————————
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const target = new THREE.Vector2(99, 99);
  let pulseTarget = 0;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    if (ny < -1 || ny > 1) return (pulseTarget = 0);
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    if (ray.ray.intersectPlane(plane, hit)) {
      target.set(hit.x, hit.z);
      pulseTarget = 1;
    }
  };
  const onLeave = () => (pulseTarget = 0);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  // — Loop, paused when off screen or hidden —————————————————
  const timer = new THREE.Timer();
  let elapsed = 4;
  let visible = true;
  const frame = () => {
    timer.update();
    elapsed += Math.min(timer.getDelta(), 0.05);
    uTime.value = elapsed;
    uMouse.value.lerp(target, 0.08);
    uPulse.value += (pulseTarget - uPulse.value) * 0.05;
    renderer.render(scene, camera);
  };
  const setRunning = () => {
    const run = visible && !document.hidden && !reduced;
    timer.update();
    renderer.setAnimationLoop(run ? frame : null);
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    setRunning();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', setRunning);

  if (reduced) frame();
  else setRunning();

  return {
    backend,
    canvas,
    dispose() {
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', setRunning);
      renderer.dispose();
    },
  };
}
