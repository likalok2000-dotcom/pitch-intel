/**
 * Optional 3D pitch (Three.js r160 CDN) — ball + attack pressure
 */

let renderer = null;
let scene = null;
let camera = null;
let ball = null;
let animId = null;
let rootEl = null;
let THREE = null;

export async function ensureThree() {
  if (THREE) return THREE;
  THREE = await import("https://unpkg.com/three@0.160.0/build/three.module.js");
  return THREE;
}

export async function mountPitch3d(container, attack) {
  rootEl = container;
  const T = await ensureThree();
  const w = container.clientWidth || 640;
  const h = Math.min(280, Math.max(200, w * 0.4));

  if (!renderer) {
    scene = new T.Scene();
    scene.background = new T.Color(0x0a1f14);
    camera = new T.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 14, 16);
    camera.lookAt(0, 0, 0);

    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const ambient = new T.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const dir = new T.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 12, 6);
    scene.add(dir);

    // Field
    const field = new T.Mesh(
      new T.PlaneGeometry(20, 12),
      new T.MeshStandardMaterial({ color: 0x166534, roughness: 0.85 })
    );
    field.rotation.x = -Math.PI / 2;
    scene.add(field);

    // Lines
    const lineMat = new T.LineBasicMaterial({ color: 0xecfdf5 });
    const border = new T.BufferGeometry().setFromPoints([
      new T.Vector3(-9.5, 0.02, -5.5),
      new T.Vector3(9.5, 0.02, -5.5),
      new T.Vector3(9.5, 0.02, 5.5),
      new T.Vector3(-9.5, 0.02, 5.5),
      new T.Vector3(-9.5, 0.02, -5.5),
    ]);
    scene.add(new T.Line(border, lineMat));
    const mid = new T.BufferGeometry().setFromPoints([
      new T.Vector3(0, 0.02, -5.5),
      new T.Vector3(0, 0.02, 5.5),
    ]);
    scene.add(new T.Line(mid, lineMat));

    const circlePts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      circlePts.push(new T.Vector3(Math.cos(a) * 1.8, 0.02, Math.sin(a) * 1.8));
    }
    scene.add(new T.Line(new T.BufferGeometry().setFromPoints(circlePts), lineMat));

    ball = new T.Mesh(
      new T.SphereGeometry(0.28, 24, 24),
      new T.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    );
    ball.position.set(0, 0.28, 0);
    scene.add(ball);

    const loop = () => {
      animId = requestAnimationFrame(loop);
      if (ball) ball.rotation.y += 0.02;
      renderer.render(scene, camera);
    };
    loop();
  } else {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  updatePitch3d(attack);
}

export function updatePitch3d(attack) {
  if (!ball || !attack) return;
  // map ballX 12–88 → x -8..8 ; ballY ~ → z
  const bx = Number(attack.ballX ?? 50);
  const by = Number(attack.ballY ?? 31);
  const x = ((bx - 50) / 38) * 8;
  const z = ((by - 31) / 25) * 4;
  ball.position.x = Math.max(-8.5, Math.min(8.5, x));
  ball.position.z = Math.max(-4.5, Math.min(4.5, z));
  ball.position.y = 0.28 + Math.sin(Date.now() / 400) * 0.05;
}

export function unmountPitch3d() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement?.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }
  renderer = null;
  scene = null;
  camera = null;
  ball = null;
  if (rootEl) rootEl.innerHTML = "";
}

export function resizePitch3d() {
  if (!renderer || !camera || !rootEl) return;
  const w = rootEl.clientWidth || 640;
  const h = Math.min(280, Math.max(200, w * 0.4));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
