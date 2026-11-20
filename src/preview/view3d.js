import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const GRID = 512; // mesh vertices per side (native field sampled every 2nd texel)

export function createView3D(host, sourceCanvas) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15161a);
  scene.fog = new THREE.Fog(0x15161a, 1400, 2600);
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
  camera.position.set(700, 640, 980);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3226, 1.2));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-400, 600, -300);
  scene.add(sun);

  const geo = new THREE.PlaneGeometry(1, 1, GRID - 1, GRID - 1);
  geo.rotateX(-Math.PI / 2);
    const tex = new THREE.CanvasTexture(sourceCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2fa8c6, transparent: true, opacity: 0.6, roughness: 0.45, metalness: 0 }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  let exaggeration = 1, visible = false, maps = null, cfg = null;

  function rebuild() {
    if (!maps) return;
    const { res, height } = maps;
    const { width, depth } = cfg.terrain;
    const lvl = cfg.water.level;
    const pos = geo.attributes.position;
    for (let r = 0; r < GRID; r++) {
      const sr = Math.round((r / (GRID - 1)) * (res - 1));
      for (let k = 0; k < GRID; k++) {
        const sc = Math.round((k / (GRID - 1)) * (res - 1));
        const h = height[sr * res + sc];
        const i = r * GRID + k;
        pos.setXYZ(i, (k / (GRID - 1) - 0.5) * width, h * exaggeration, (r / (GRID - 1) - 0.5) * depth);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    water.scale.set(width * 2.2, depth * 2.2, 1);
    water.position.y = lvl * exaggeration;
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);

  renderer.setAnimationLoop(() => {
    if (!visible) return;
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setMaps(m, c) { maps = m; cfg = c; rebuild(); },
    refreshTexture() {
      if (tex.userData.w !== sourceCanvas.width) {
        tex.dispose();
        tex.userData.w = sourceCanvas.width;
      }
      tex.needsUpdate = true;
    },
    setExaggeration(v) { exaggeration = v; rebuild(); },
    setVisible(v) { visible = v; if (v) resize(); },
    resetCamera() { camera.position.set(700, 640, 980); controls.target.set(0, 0, 0); },
  };
}
