import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KEY_SLOTS, type KeySlot } from "./keyMap";

/** One movable key on the model. */
interface KeyObject {
  mesh: THREE.Mesh;
  slot: KeySlot;
  material: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  down: boolean;
  /** 0 = up, 1 = fully pressed (animated). */
  amount: number;
}

export interface PreparedModel {
  keys: KeyObject[];
  byCode: Map<string, KeyObject>;
  screenMesh: THREE.Mesh | null;
  /** Centre of the 5100's CRT face in GLB world units. */
  screenCenter: THREE.Vector3;
  /** Front-panel indicator lamps (null if not found in the model). */
  lamps: { inProcess: Lamp | null; check: Lamp | null };
}

export interface Lamp {
  material: THREE.MeshStandardMaterial;
  /** 0 = dark, 1 = fully lit (animated so the bulb warms and cools). */
  level: number;
}

/** The two small round lamps under the CRT: IN PROCESS (top), PROCESS CHECK. */
function isLamp(isl: Island) {
  return isl.center.z < 0.045 && isl.size.x < 0.003 && isl.size.y < 0.003 && isl.vertexCount > 500;
}

function makeLamp(isl: Island, color: string): { mesh: THREE.Mesh; lamp: Lamp } {
  const material = (isl.material as THREE.MeshStandardMaterial).clone();
  material.emissiveMap = null; // the atlas is black here and would cancel the glow
  material.emissive = new THREE.Color(color);
  material.emissiveIntensity = 0;
  return { mesh: new THREE.Mesh(isl.geometry, material), lamp: { material, level: 0 } };
}

interface Island {
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
  size: THREE.Vector3;
  vertexCount: number;
  material: THREE.Material;
}

const MATCH_DIST = 0.0035;
const MERGE_DIST = 0.0042;

/** Copies an attribute into a plain Float32Array (undoing any quantization). */
function readAttribute(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const n = attr.count, s = attr.itemSize;
  const out = new Float32Array(n * s);
  for (let i = 0; i < n; i++) {
    out[i * s] = attr.getX(i);
    if (s > 1) out[i * s + 1] = attr.getY(i);
    if (s > 2) out[i * s + 2] = attr.getZ(i);
    if (s > 3) out[i * s + 3] = attr.getW(i);
  }
  return out;
}

/**
 * The keyboard ships as one merged mesh. Each keycap is still a separate
 * connected piece of geometry, so we find those pieces ("islands") and give
 * each its own mesh, baked into world space.
 */
function splitIntoIslands(mesh: THREE.Mesh): Island[] {
  const g = mesh.geometry;
  const M = mesh.matrixWorld;
  const NM = new THREE.Matrix3().getNormalMatrix(M);

  const attrs: Record<string, { data: Float32Array; size: number }> = {};
  for (const [name, attr] of Object.entries(g.attributes)) {
    attrs[name] = { data: readAttribute(attr as THREE.BufferAttribute), size: attr.itemSize };
  }
  const pos = attrs.position.data;
  const n = pos.length / 3;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromArray(pos, i * 3).applyMatrix4(M).toArray(pos, i * 3);
  }
  if (attrs.normal) {
    const d = attrs.normal.data;
    for (let i = 0; i < n; i++) v.fromArray(d, i * 3).applyMatrix3(NM).normalize().toArray(d, i * 3);
  }
  if (attrs.tangent) {
    const d = attrs.tangent.data;
    for (let i = 0; i < n; i++) v.fromArray(d, i * 4).transformDirection(M).toArray(d, i * 4);
  }

  // weld coincident vertices (UV seams split them), then union-find over triangles
  const weld = new Int32Array(n);
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    let id = seen.get(k);
    if (id === undefined) { id = seen.size; seen.set(k, id); }
    weld[i] = id;
  }
  const parent = new Int32Array(seen.size).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const index = g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < index.length; t += 3) {
    const a = find(weld[index[t]]);
    parent[find(weld[index[t + 1]])] = a;
    parent[find(weld[index[t + 2]])] = a;
  }

  const tris = new Map<number, number[]>();
  for (let t = 0; t < index.length; t += 3) {
    const r = find(weld[index[t]]);
    let list = tris.get(r);
    if (!list) tris.set(r, (list = []));
    list.push(index[t], index[t + 1], index[t + 2]);
  }

  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const islands: Island[] = [];
  for (const list of tris.values()) {
    const remap = new Map<number, number>();
    for (const i of list) if (!remap.has(i)) remap.set(i, remap.size);
    const geo = new THREE.BufferGeometry();
    for (const [name, { data, size }] of Object.entries(attrs)) {
      const out = new Float32Array(remap.size * size);
      for (const [oldI, newI] of remap) for (let c = 0; c < size; c++) out[newI * size + c] = data[oldI * size + c];
      geo.setAttribute(name, new THREE.BufferAttribute(out, size));
    }
    geo.setIndex(list.map((i) => remap.get(i)!));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const box = geo.boundingBox!;
    islands.push({
      geometry: geo,
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3()),
      vertexCount: remap.size,
      material,
    });
  }
  return islands;
}

const xzDist = (a: THREE.Vector3, x: number, z: number) => Math.hypot(a.x - x, a.z - z);

/** Gives the CRT face planar UVs so a canvas texture maps straight onto it. */
function planarUVs(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position;
  const box = geo.boundingBox!;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - box.min.x) / (box.max.x - box.min.x);
    uv[i * 2 + 1] = (pos.getY(i) - box.min.y) / (box.max.y - box.min.y);
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export function prepareModel(scene: THREE.Object3D, screenTexture: THREE.Texture): PreparedModel {
  scene.updateMatrixWorld(true);

  const keyMeshes: THREE.Mesh[] = [];
  const cartridges: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = `${mesh.name} ${mesh.parent?.name ?? ""}`;
    if (name.includes("DataCartridge")) cartridges.push(mesh);
    else if (name.includes("Keys_low")) keyMeshes.push(mesh);
    else if (name.includes("Glass")) {
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      m.transparent = true;
      m.opacity = 0.18;
      m.roughness = 0.22;
      m.metalness = 0;
      m.depthWrite = false;
      mesh.material = m;
      mesh.renderOrder = 2;
    }
  });

  cartridges.forEach((c) => c.removeFromParent());
  const islands = keyMeshes.flatMap(splitIntoIslands);
  const root = keyMeshes[0]?.parent ?? scene;
  keyMeshes.forEach((m) => m.removeFromParent());

  // The CRT face is by far the largest piece in the "keys" mesh.
  let screenIsland: Island | null = null;
  for (const isl of islands) {
    if (isl.size.x > 0.02 && (!screenIsland || isl.size.x * isl.size.y > screenIsland.size.x * screenIsland.size.y)) {
      screenIsland = isl;
    }
  }

  // Match every key slot to its nearest island, closest pairs first.
  const candidates: { slot: KeySlot; isl: Island; d: number }[] = [];
  for (const slot of KEY_SLOTS) {
    for (const isl of islands) {
      if (isl === screenIsland || isl.vertexCount < 200) continue;
      const d = xzDist(isl.center, slot.x, slot.z);
      if (d < MATCH_DIST) candidates.push({ slot, isl, d });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  const slotOf = new Map<Island, KeySlot>();
  const taken = new Set<KeySlot>();
  for (const c of candidates) {
    if (taken.has(c.slot) || slotOf.has(c.isl)) continue;
    taken.add(c.slot);
    slotOf.set(c.isl, c.slot);
  }

  // Small leftover bits on the keyboard (key stems, bumps) ride along with the nearest key.
  const groups = new Map<Island, Island[]>();
  for (const isl of slotOf.keys()) groups.set(isl, [isl]);
  const statics: Island[] = [];
  for (const isl of islands) {
    if (isl === screenIsland || slotOf.has(isl)) continue;
    let best: Island | null = null, bestD = MERGE_DIST;
    if (isl.center.z > 0.05 && isl.vertexCount < 400) {
      for (const k of slotOf.keys()) {
        const d = xzDist(isl.center, k.center.x, k.center.z);
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    if (best) groups.get(best)!.push(isl);
    else statics.push(isl);
  }

  const keyGroup = new THREE.Group();
  keyGroup.name = "keys";
  // islands are baked in world space; cancel the parent's transform
  keyGroup.matrixAutoUpdate = false;
  keyGroup.matrix.copy(root.matrixWorld).invert();
  root.add(keyGroup);

  const keys: KeyObject[] = [];
  const byCode = new Map<string, KeyObject>();
  for (const [main, parts] of groups) {
    const slot = slotOf.get(main)!;
    const geo = parts.length === 1 ? main.geometry : mergeGeometries(parts.map((p) => p.geometry)) ?? main.geometry;
    const material = (main.material as THREE.MeshStandardMaterial).clone();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `key:${slot.codes[0]}`;
    mesh.userData.keySlot = slot;
    keyGroup.add(mesh);
    const k: KeyObject = { mesh, slot, material, baseColor: material.color.clone(), down: false, amount: 0 };
    keys.push(k);
    slot.codes.forEach((c) => byCode.set(c, k));
  }
  const lampIslands = statics.filter(isLamp).sort((a, b) => b.center.y - a.center.y);
  const lamps: PreparedModel["lamps"] = { inProcess: null, check: null };
  if (lampIslands.length === 2) {
    const top = makeLamp(lampIslands[0], "#ffb347");
    const bottom = makeLamp(lampIslands[1], "#ff3b2f");
    keyGroup.add(top.mesh, bottom.mesh);
    lamps.inProcess = top.lamp;
    lamps.check = bottom.lamp;
  }
  for (const isl of statics) if (!lampIslands.includes(isl) || !lamps.inProcess) keyGroup.add(new THREE.Mesh(isl.geometry, isl.material));

  let screenMesh: THREE.Mesh | null = null;
  const screenCenter = new THREE.Vector3(-0.041, 0.045, 0.037);
  if (screenIsland) {
    planarUVs(screenIsland.geometry);
    const mat = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    mat.color.setScalar(2.2); // HDR: only the phosphor text is bright enough to glow
    screenMesh = new THREE.Mesh(screenIsland.geometry, mat);
    screenMesh.name = "crt-face";
    keyGroup.add(screenMesh);
    screenCenter.copy(screenIsland.center);
  }

  if (import.meta.env.DEV) {
    const missing = KEY_SLOTS.filter((s) => !taken.has(s)).map((s) => s.codes[0]);
    console.info(`[5100] islands=${islands.length} keys=${keys.length} statics=${statics.length} unmatched=`, missing, "lamps=", lampIslands.length);
  }

  return { keys, byCode, screenMesh, screenCenter, lamps };
}
