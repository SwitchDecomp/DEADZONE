import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Real-world assets (CC0, Poly Haven / three.js examples) shipped in /public.
// Every load is optional: if a file is missing the game falls back to procedural content.
export const PBR_SETS = {
  concrete: { tile: 2.5 }, brick: { tile: 2.0 }, asphalt: { tile: 4 }, tiles: { tile: 2 }, wood: { tile: 2 }, woodOld: { tile: 2 },
  rust: { tile: 2, metal: true }, corrugated: { tile: 2, metal: true }, plaster: { tile: 2.5 }, dirt: { tile: 4 }, floor: { tile: 3 },
  metal: { tile: 1.5, metal: true }, painted: { tile: 2, metal: true },
};
export const PROP_IDS = [
  'Barrel_01', 'barrel_03', 'concrete_road_barrier', 'metal_jerrycan', 'old_military_crate', 'wooden_crate_01', 'wooden_crate_02',
  'old_tyre', 'metal_tool_chest', 'metal_trash_can', 'portable_generator', 'power_box_01', 'trashbag', 'wheelchair_01', 'medical_box',
  'cardboard_box_01', 'tool_cart', 'ammo_box', 'utility_box_01', 'hanging_industrial_lamp',
];
export const GUN_IDS = ['service_pistol', 'bolt_action_rifle_7_62'];
export const CHAR_IDS = ['Soldier', 'Michelle'];

const BASE = import.meta.env.BASE_URL || '/';

export async function loadAssets(renderer, progress) {
  const A = { pbr: {}, props: {}, guns: {}, chars: {}, hdr: null };
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const jobs = [];
  let done = 0, total = 0;
  const job = (label, fn) => {
    total++;
    jobs.push(fn().catch((e) => console.warn('asset failed', label, e?.message || e)).finally(() => { done++; progress(done / total, `LOADING ${label.toUpperCase()}`); }));
  };
  const tex = (url, srgb) => new Promise((res, rej) => tl.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    res(t);
  }, undefined, rej));
  for (const [key, cfg] of Object.entries(PBR_SETS)) {
    job(`surface ${key}`, async () => {
      const [map, normalMap, arm] = await Promise.all([tex(`${BASE}tex/${key}/diff.jpg`, true), tex(`${BASE}tex/${key}/nor.jpg`, false), tex(`${BASE}tex/${key}/arm.jpg`, false)]);
      A.pbr[key] = { map, normalMap, arm, ...cfg };
    });
  }
  job('night sky', async () => {
    A.hdr = await new RGBELoader().loadAsync(`${BASE}hdr/night.hdr`);
    A.hdr.mapping = THREE.EquirectangularReflectionMapping;
  });
  for (const id of PROP_IDS) job(id.replace(/_/g, ' '), async () => { A.props[id] = await gl.loadAsync(`${BASE}models/${id}/${id}.gltf`); });
  for (const id of GUN_IDS) job(id.replace(/_/g, ' '), async () => { A.guns[id] = await gl.loadAsync(`${BASE}models/${id}/${id}.gltf`); });
  for (const id of CHAR_IDS) job(`${id} rig`, async () => { A.chars[id] = await gl.loadAsync(`${BASE}models/${id}.glb`); });
  await Promise.all(jobs);
  return A;
}

// Clone a sub-set of nodes (by name predicate) from a loaded glTF scene, re-centred on the floor.
export function cloneNodes(gltf, pick, { recenter = true, shadow = true, receive = true } = {}) {
  const g = new THREE.Group();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !pick(o.name, o)) return;
    const m = new THREE.Mesh(o.geometry, o.material);
    o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.castShadow = shadow; m.receiveShadow = receive;
    g.add(m);
  });
  if (recenter && g.children.length) {
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3());
    for (const m of g.children) { m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box.min.y; }
  }
  return g;
}
