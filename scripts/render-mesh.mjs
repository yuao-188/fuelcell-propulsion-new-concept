import { BufferAttribute, BufferGeometry } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Complex tube junctions can make Manifold's native normal splitting expensive.
// This path changes rendering attributes only: every position and triangle is
// copied from the verified solid, with exact (not tolerance-based) reindexing.
export function renderMeshWithCreasedNormals(solid, angle = 35) {
  const raw = solid.getMesh();
  const sourcePositions = new Float32Array(raw.numVert * 3);
  for (let i = 0; i < raw.numVert; i++) {
    for (let axis = 0; axis < 3; axis++) sourcePositions[i * 3 + axis] = raw.vertProperties[i * raw.numProp + axis];
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(sourcePositions, 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(raw.triVerts), 1));
  const creased = toCreasedNormals(geometry, angle * Math.PI / 180);
  const p = creased.attributes.position.array, n = creased.attributes.normal.array;
  const positions = [], normals = [], indices = new Uint32Array(p.length / 3), vertexMap = new Map();
  for (let i = 0; i < indices.length; i++) {
    const j = i * 3;
    const key = `${p[j]},${p[j + 1]},${p[j + 2]},${n[j]},${n[j + 1]},${n[j + 2]}`;
    let index = vertexMap.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      vertexMap.set(key, index);
      positions.push(p[j], p[j + 1], p[j + 2]);
      normals.push(n[j], n[j + 1], n[j + 2]);
    }
    indices[i] = index;
  }
  geometry.dispose();
  creased.dispose();
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices };
}
