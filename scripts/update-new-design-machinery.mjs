/** Replace only the spinner and stage-2 rotor in an already verified assembly.
 * No plumbing, stack or casing generator is evaluated by this update path.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import ManifoldModule from 'manifold-3d';
import { Matrix4, Vector3 } from 'three';
import { parameters as P, colors as C } from '../new-design/parameters.mjs';
import { buildDetailedMachinery } from './detailed-machinery.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.every(arg => /^(--source|--expect-source-sha256)=/.test(arg)), 'Supported options: --source=PATH --expect-source-sha256=HASH');
const option = key => args.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1);
const outputPath = resolve(root, 'new-design/public/model.glb');
const reportPath = resolve(root, 'new-design/verification.json');
const qaDirectory = resolve(root, 'new-design/qa');
const targets = new Set(['fan-spinner', 'compressor-rotor-2']);
// This is the existing exported-geometry threshold in verify-new-design-compressor.mjs.
const toleranceMm3 = .02;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await stat(path); return true; } catch { return false; } };
const sourcePath = option('--source') ? resolve(option('--source'))
  : await exists(outputPath) ? outputPath : resolve(root, 'new-design/model.glb');
const originalBytes = await readFile(sourcePath), originalReportBytes = await readFile(reportPath);
const sourceSha256 = hash(originalBytes);
if (option('--expect-source-sha256')) assert.equal(sourceSha256, option('--expect-source-sha256'), 'Unexpected source GLB; update was not applied');
const report = JSON.parse(originalReportBytes.toString('utf8'));
const io = new NodeIO(), document = await io.readBinary(originalBytes);

const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
function accessorHash(accessor) {
  if (!accessor) return null;
  const data = accessor.getArray();
  assert.ok(data, 'A mesh accessor is missing its local array');
  const digest = createHash('sha256');
  digest.update(JSON.stringify({ type: accessor.getType(), componentType: accessor.getComponentType(),
    normalized: accessor.getNormalized(), count: accessor.getCount() }));
  digest.update(bytesOf(data));
  return digest.digest('hex');
}
function snapshot(node) {
  const primitives = node.getMesh()?.listPrimitives() ?? [];
  const geometry = primitives.map(primitive => ({ mode: primitive.getMode(),
    attributes: Object.fromEntries(primitive.listSemantics().sort().map(key => [key, accessorHash(primitive.getAttribute(key))])),
    indices: accessorHash(primitive.getIndices()),
    targets: primitive.listTargets().map(target => Object.fromEntries(target.listSemantics().sort()
      .map(key => [key, accessorHash(target.getAttribute(key))]))),
  }));
  const materials = primitives.map(primitive => {
    const material = primitive.getMaterial();
    return material ? { name: material.getName(), extras: material.getExtras(),
      baseColor: material.getBaseColorFactor(), metallic: material.getMetallicFactor(),
      roughness: material.getRoughnessFactor(), doubleSided: material.getDoubleSided(),
      alphaMode: material.getAlphaMode(), alphaCutoff: material.getAlphaCutoff(), emissive: material.getEmissiveFactor() } : null;
  });
  return { id: node.getExtras().id, name: node.getName(),
    geometrySha256: hash(JSON.stringify(geometry)),
    transformSha256: hash(JSON.stringify({ local: node.getMatrix(), world: node.getWorldMatrix() })),
    materialsSha256: hash(JSON.stringify(materials)),
    extrasSha256: hash(JSON.stringify(node.getExtras())),
  };
}
const originalNodes = document.getRoot().listNodes();
assert.ok(originalNodes.every(node => typeof node.getExtras().id === 'string'), 'Each assembly node must have a stable part id');
const before = new Map(originalNodes.map(node => [node.getExtras().id, snapshot(node)]));
assert.equal(before.size, originalNodes.length, 'Duplicate part ids in source GLB');
for (const id of targets) assert.ok(before.has(id), `Missing target: ${id}`);

const api = await ManifoldModule(); api.setup();
const { Manifold: M, Mesh, CrossSection: CS } = api;
const vec = point => new Vector3(...point), union = solids => M.union(solids);
const cylinder = (a, b, radius, radius2 = radius, segments = 32) => {
  const z = vec(b).sub(vec(a)), length = z.length(); assert.ok(length > 0);
  z.normalize();
  const auxiliary = Math.abs(z.z) < .8 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const x = auxiliary.cross(z).normalize(), y = z.clone().cross(x);
  const primitive = M.cylinder(length, radius, radius2, segments);
  try { return primitive.transform(new Matrix4().makeBasis(x, y, z).setPosition(vec(a)).elements); }
  finally { primitive.delete(); }
};
const revolved = (profile, wall) => {
  const section = new CS([[
    ...profile.map(([x, radius]) => [radius, x]),
    ...profile.toReversed().map(([x, radius]) => [radius - (typeof wall === 'function' ? wall(x) : wall), x]),
  ]]);
  let spun;
  try { spun = section.revolve(144); return spun.rotate([0, 90, 0]); }
  finally { spun?.delete(); section.delete(); }
};
const sector = (front, rear, inner, outer, start, end) => {
  const points = [], count = Math.ceil((end - start) / 2);
  for (let i = 0; i <= count; i++) {
    const angle = (start + (end - start) * i / count) * Math.PI / 180;
    points.push([-outer * Math.sin(angle), outer * Math.cos(angle)]);
  }
  for (let i = count; i >= 0; i--) {
    const angle = (start + (end - start) * i / count) * Math.PI / 180;
    points.push([-inner * Math.sin(angle), inner * Math.cos(angle)]);
  }
  const section = new CS([points]); let extruded, rotated;
  try { extruded = section.extrude(rear - front); rotated = extruded.rotate([0, 90, 0]); return rotated.translate([front, 0, 0]); }
  finally { rotated?.delete(); extruded?.delete(); section.delete(); }
};
const generated = new Map();
console.log('Building front machinery only; preserving all existing non-target meshes.');
const machinery = buildDetailedMachinery({ M, CS, P, C, union, cylinder, revolved, sector,
  add: (id, name, group, color, solid, extras = {}) => {
    assert.ok(!generated.has(id), `Duplicate generated part: ${id}`);
    assert.equal(solid.status(), 'NoError', id); assert.ok(solid.volume() > 0, id);
    generated.set(id, { id, name, group, color, solid, extras });
  },
});
for (const [id, part] of generated) if (!targets.has(id)) { part.solid.delete(); generated.delete(id); }
assert.equal(generated.size, targets.size, 'The machinery helper did not produce both update targets');

const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
for (const [id, part] of generated) {
  const node = originalNodes.find(candidate => candidate.getExtras().id === id), mesh = node.getMesh();
  assert.ok(mesh, `${id}: missing mesh`);
  assert.equal(originalNodes.filter(candidate => candidate.getMesh() === mesh).length, 1, `${id}: shared mesh cannot be updated in place`);
  const primitives = mesh.listPrimitives(); assert.equal(primitives.length, 1, `${id}: expected one primitive`);
  const primitive = primitives[0];
  assert.equal(primitive.listTargets().length, 0, `${id}: unexpected morph targets`);
  assert.deepEqual(primitive.listSemantics().sort(), ['NORMAL', 'POSITION']);
  const oldAccessors = [primitive.getAttribute('POSITION'), primitive.getAttribute('NORMAL'), primitive.getIndices()];
  for (const accessor of oldAccessors) {
    const users = originalNodes.flatMap(candidate => candidate.getMesh()?.listPrimitives() ?? [])
      .filter(candidate => candidate.getIndices() === accessor || candidate.listAttributes().includes(accessor));
    assert.equal(users.length, 1, `${id}: shared accessor cannot be replaced`);
  }
  const normalSolid = part.solid.calculateNormals(0, 35);
  let positions, normals, indices;
  try {
    const data = normalSolid.getMesh();
    positions = new Float32Array(data.numVert * 3); normals = new Float32Array(data.numVert * 3);
    for (let i = 0; i < data.numVert; i++) for (let axis = 0; axis < 3; axis++) {
      positions[i * 3 + axis] = data.vertProperties[i * data.numProp + axis];
      normals[i * 3 + axis] = data.vertProperties[i * data.numProp + axis + 3];
    }
    indices = new Uint32Array(data.triVerts);
  } finally { normalSolid.delete(); part.solid.delete(); }
  primitive.setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer));
  // Keep the original material object, existing node transform and all old extras.
  mesh.setName(part.name); node.setName(part.name)
    .setExtras({ ...node.getExtras(), ...part.extras, id, group: part.group });
  for (const accessor of oldAccessors) accessor.dispose();
}

// Read back the actual bytes to validate the export rounding and untouched data.
const updatedBytes = await io.writeBinary(document), updatedDocument = await io.readBinary(updatedBytes);
const updatedNodes = updatedDocument.getRoot().listNodes();
const after = new Map(updatedNodes.map(node => [node.getExtras().id, snapshot(node)]));
assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'The assembly part list changed');
const unchanged = [], changed = [];
for (const [id, previous] of before) {
  const next = after.get(id);
  assert.equal(next.transformSha256, previous.transformSha256, `${id}: node coordinates changed`);
  assert.equal(next.materialsSha256, previous.materialsSha256, `${id}: material changed`);
  if (targets.has(id)) changed.push({ id, oldGeometrySha256: previous.geometrySha256, newGeometrySha256: next.geometrySha256,
    transformSha256: next.transformSha256, materialsSha256: next.materialsSha256 });
  else {
    assert.deepEqual(next, previous, `${id}: an untargeted node changed`);
    unchanged.push({ id, oldGeometrySha256: previous.geometrySha256, newGeometrySha256: next.geometrySha256,
      transformSha256: next.transformSha256, materialsSha256: next.materialsSha256 });
  }
}

function worldBounds(node) {
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const matrix = new Matrix4().fromArray(node.getWorldMatrix()), point = new Vector3();
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const positions = primitive.getAttribute('POSITION').getArray();
    for (let i = 0; i < positions.length; i += 3) {
      point.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(matrix);
      for (let axis = 0; axis < 3; axis++) { const value = point.getComponent(axis); bounds.min[axis] = Math.min(bounds.min[axis], value); bounds.max[axis] = Math.max(bounds.max[axis], value); }
    }
  }
  return bounds;
}
function reconstruct(node) {
  const primitives = node.getMesh()?.listPrimitives() ?? [];
  assert.equal(primitives.length, 1, `${node.getExtras().id}: expected one collision primitive`);
  const primitive = primitives[0]; assert.equal(primitive.getMode(), 4, 'Collision check requires TRIANGLES');
  const mesh = new Mesh({ numProp: 3,
    vertProperties: new Float32Array(primitive.getAttribute('POSITION').getArray()),
    triVerts: new Uint32Array(primitive.getIndices().getArray()),
  });
  mesh.merge();
  const local = new M(mesh); let world;
  try { world = local.transform(Array.from(node.getWorldMatrix())); } finally { local.delete(); }
  assert.equal(world.status(), 'NoError', `${node.getExtras().id}: exported mesh is not watertight`);
  assert.ok(world.volume() > 0, `${node.getExtras().id}: empty exported mesh`);
  return world;
}
const bounds = new Map(updatedNodes.map(node => [node.getExtras().id, worldBounds(node)]));
const overlaps = (a, b) => [0, 1, 2].every(axis => a.min[axis] < b.max[axis] && b.min[axis] < a.max[axis]);
const collisions = [], checks = [], tested = new Set();
let broadPhasePairs = 0;
for (const id of targets) {
  const node = updatedNodes.find(candidate => candidate.getExtras().id === id), solid = reconstruct(node);
  try {
    const components = solid.decompose();
    const count = components.length; components.forEach(component => component.delete());
    assert.equal(count, 1, `${id}: updated component must be a connected solid`);
    for (const other of updatedNodes) {
      const otherId = other.getExtras().id;
      if (id === otherId) continue;
      const pair = [id, otherId].sort().join('|');
      if (tested.has(pair)) continue;
      tested.add(pair); broadPhasePairs++;
      if (!overlaps(bounds.get(id), bounds.get(otherId))) continue;
      console.log('Checking updated exported geometry:', id, '/', otherId);
      const obstacle = reconstruct(other); let intersection;
      try {
        intersection = solid.intersect(obstacle);
        const volumeMm3 = Math.max(0, intersection.volume());
        checks.push({ parts: [id, otherId], volumeMm3 });
        if (volumeMm3 > toleranceMm3) collisions.push({ parts: [id, otherId], volumeMm3 });
      } finally { intersection?.delete(); obstacle.delete(); }
    }
  } finally { solid.delete(); }
}
const targetedUpdate = { status: collisions.length ? 'failed' : 'passed', updatedAt: new Date().toISOString(),
  source: sourcePath, output: outputPath, oldModelSha256: sourceSha256, newModelSha256: hash(updatedBytes),
  oldReportSha256: hash(originalReportBytes), oldModelBytes: originalBytes.length, newModelBytes: updatedBytes.length,
  changedNodes: changed, unchangedNodeCount: unchanged.length, unchangedNodeGeometryHashes: unchanged,
  allUnchangedGeometryHashesMatch: true, allNodeTransformsUnchanged: true, allMaterialsUnchanged: true,
  collisionScope: 'Only the two updated exported solids against every other exported assembly part; previous non-target pairs are reused',
  toleranceSource: 'scripts/verify-new-design-compressor.mjs solidIntersections.toleranceMm3',
  toleranceMm3, broadPhasePairs, exactChecks: checks.length, maximumIntersectionVolumeMm3: Math.max(0, ...checks.map(check => check.volumeMm3)),
  checks, collisions, fluidAndStackGeneratorsRun: false,
};
await mkdir(qaDirectory, { recursive: true });
await writeFile(resolve(qaDirectory, 'targeted-machinery-update.json'), JSON.stringify(targetedUpdate, null, 2));
assert.equal(collisions.length, 0, `Updated machinery intersects the assembly: ${JSON.stringify(collisions)}`);

report.previousAssemblyChecks = { sourceModelSha256: sourceSha256, sourceReportSha256: hash(originalReportBytes),
  inheritedAt: targetedUpdate.updatedAt, fullAssemblyRecomputed: false,
  solidChecks: report.solidChecks, broadPhasePairs: report.broadPhasePairs, collisions: report.collisions,
  fluidChecks: report.fluidChecks, errors: report.errors,
  ...(report.previousAssemblyChecks ? { earlierAssemblyChecks: report.previousAssemblyChecks } : {}),
};
report.machinery = machinery;
report.dimensionSource = `${report.dimensionSource}; targeted spinner extension and second-stage rotor blade-radius revision, 2026-10-26`;
report.verificationScope = 'Targeted exported-machinery update; full prior assembly checks retained under previousAssemblyChecks';
report.solidChecks = checks.length; report.broadPhasePairs = broadPhasePairs; report.collisions = collisions;
report.targetedUpdate = targetedUpdate;
delete report.compressorGeometry;
delete report.exportedCompressorGeometry;
if (report.exportedCellGeometry) report.exportedCellGeometryReuse = {
  sourceModelSha256: sourceSha256, reason: 'All stack, plumbing, shell and wiring mesh/transform hashes are unchanged',
  unchangedStackNodeIds: unchanged.filter(item => item.id.startsWith('stack-')).map(item => item.id),
  changedNodesOutsideStackAxialEnvelope: [...targets].every(id => bounds.get(id).max[0] < P.stacks[0].front),
};
assert.ok(!report.exportedCellGeometryReuse || report.exportedCellGeometryReuse.changedNodesOutsideStackAxialEnvelope,
  'Cell verification cannot be reused for a change within the stack axial envelope');
await mkdir(dirname(outputPath), { recursive: true });
const pendingModel = `${outputPath}.pending-${process.pid}`, pendingReport = `${reportPath}.pending-${process.pid}`;
await writeFile(pendingModel, updatedBytes);
await writeFile(pendingReport, JSON.stringify(report, null, 2));
await rename(pendingModel, outputPath);
await rename(pendingReport, reportPath);
console.log(JSON.stringify({ status: 'passed', output: outputPath, modelSha256: targetedUpdate.newModelSha256,
  changedNodeIds: [...targets], unchangedNodes: unchanged.length, exactChecks: checks.length,
  maximumIntersectionVolumeMm3: targetedUpdate.maximumIntersectionVolumeMm3 }, null, 2));
