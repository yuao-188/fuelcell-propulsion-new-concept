/** Geometry checks on the exported mesh; these do not establish compressor performance. */
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import ManifoldModule from 'manifold-3d';
import { Matrix4, Vector3 } from 'three';
import { parameters as P } from '../new-design/parameters.mjs';

const root = resolve(import.meta.dirname, '..');
const modelPath = resolve(root, 'new-design/public/model.glb');
const reportPath = resolve(root, 'new-design/verification.json');
const machineIds = [
  'fan', 'fan-spinner', 'main-motor', 'motor-front-cap', 'motor-rear-cap',
  'motor-shaft-collar', 'motor-housing', 'compressor-drive', 'compressor-casing', 'compressor-shroud',
];

try {
  const api = await ManifoldModule();
  api.setup();
  const { Manifold: M, Mesh } = api;
  const document = await new NodeIO().read(modelPath);
  const parts = [];
  for (const node of document.getRoot().listNodes()) {
    const id = node.getExtras().id;
    if (!machineIds.includes(id)) continue;
    const primitives = node.getMesh()?.listPrimitives() ?? [];
    assert.equal(primitives.length, 1, `${id}: expected one exported primitive`);
    const primitive = primitives[0];
    const mesh = new Mesh({
      numProp: 3,
      vertProperties: new Float32Array(primitive.getAttribute('POSITION').getArray()),
      triVerts: new Uint32Array(primitive.getIndices().getArray()),
    });
    // Normal splitting duplicates boundary positions in GLB. Weld those positions
    // before reconstructing a watertight solid; never use AABBs as collision proof.
    mesh.merge();
    const solid = new M(mesh).transform(Array.from(node.getWorldMatrix()));
    assert.equal(solid.status(), 'NoError', `${id}: invalid exported solid`);
    assert.ok(solid.volume() > 0, `${id}: empty exported solid`);
    const components = solid.decompose();
    assert.equal(components.length, 1, `${id}: disconnected mechanical component`);
    components.forEach(component => component.delete());
    parts.push({ id, solid, bounds: solid.boundingBox() });
  }
  assert.deepEqual(parts.map(part => part.id).sort(), [...machineIds].sort(), 'Missing or duplicate front machinery');
  const getPart = id => parts.find(part => part.id === id);
  const overlaps = (a, b) => [0, 1, 2].every(i => a.min[i] < b.max[i] && b.min[i] < a.max[i]);
  const intersectionVolume = (a, b) => {
    const overlap = a.intersect(b), volume = Math.max(0, overlap.volume());
    overlap.delete();
    return volume;
  };
  const cylinder = (a, b, radius, segments = 32) => {
    const origin = new Vector3(...a), z = new Vector3(...b).sub(origin), length = z.length();
    assert.ok(length > 0, 'Zero-length probe segment');
    z.normalize();
    const auxiliary = Math.abs(z.z) < .8 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
    const x = auxiliary.cross(z).normalize(), y = z.clone().cross(x);
    return M.cylinder(length, radius, radius, segments)
      .transform(new Matrix4().makeBasis(x, y, z).setPosition(origin).elements);
  };
  const polar = (x, radius, angle) => [x, radius * Math.cos(angle), radius * Math.sin(angle)];
  const failures = [];
  const result = {
    status: 'passed',
    scope: 'Exported front machinery geometry only; no aerodynamic performance validation',
    modelModifiedAt: (await stat(modelPath)).mtime.toISOString(),
    units: P.units,
    frontParts: parts.length,
    solidIntersections: { toleranceMm3: .02, candidates: 0, maximumVolumeMm3: 0, collisions: [] },
  };
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (!overlaps(a.bounds, b.bounds)) continue;
    result.solidIntersections.candidates++;
    const volumeMm3 = intersectionVolume(a.solid, b.solid);
    result.solidIntersections.maximumVolumeMm3 = Math.max(result.solidIntersections.maximumVolumeMm3, volumeMm3);
    if (volumeMm3 > result.solidIntersections.toleranceMm3) {
      result.solidIntersections.collisions.push({ parts: [a.id, b.id], volumeMm3 });
    }
  }
  if (result.solidIntersections.collisions.length) failures.push('Front machinery intersects');

  // Follow one inter-blade passage rather than shooting through the solid hub.
  // Local waypoints describe the current report-sized inlet and aft collector.
  const K = P.compressor, length = (K.outlet - K.front) * .375;
  const plateX = K.front + length * .76;
  const inner = K.inner * .255 * .94, outer = K.inner * .88 - 1.2;
  const entryAngle = Math.PI / 12, exitAngle = entryAngle - .52;
  const workingRear = K.front + length;
  const neckStart = K.outlet - (K.outletNeckLength ?? (K.outlet - K.rear) * .5);
  const path = [
    [P.motorHousing.front + .5, K.inner - 10, 0],
    [K.front - 50, K.inner - 10, 0], [K.front, 80, 0], [K.front + 14.5, 60, 0],
    polar(K.front + 16, 36.5, entryAngle), polar(K.front + 24, 36.5, entryAngle),
  ];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    path.push(polar(plateX - length * (.30 - .17 * t) * .45,
      inner + (outer - inner) * t, entryAngle - .52 * t * t));
  }
  path.push(
    polar(plateX - length * .13 * .45, K.inner - 12, exitAngle),
    polar(workingRear - 6, K.inner - 12, exitAngle), polar(workingRear - 2, 80, exitAngle),
    polar(workingRear + 25, 50, exitAngle), polar(workingRear + 45, 25, exitAngle),
    [neckStart, 0, 0], [K.outlet - .5, 0, 0],
  );
  const passage = M.union(path.slice(1).map((point, i) => cylinder(path[i], point, .5)));
  const obstructionVolumes = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(passage, part.solid) }));
  result.inletToOutlet = {
    probeRadiusMm: .5, segments: path.length - 1, toleranceMm3: .001,
    maximumObstructionVolumeMm3: Math.max(...obstructionVolumes.map(item => item.volumeMm3)),
    obstructions: obstructionVolumes.filter(item => item.volumeMm3 > .001),
  };
  if (result.inletToOutlet.obstructions.length) failures.push('Inlet-to-outlet probe is obstructed');

  // Stop before the tapered casing: only the shroud should block this former
  // straight bypass around the impeller, rather than the downstream narrowing.
  const formerBypass = cylinder([K.front, K.inner - 10, 0], [workingRear - 5, K.inner - 10, 0], 1);
  const blockedVolume = intersectionVolume(formerBypass, getPart('compressor-shroud').solid);
  result.formerBypass = { radiusFromAxisMm: K.inner - 10, probeRadiusMm: 1, shroudIntersectionMm3: blockedVolume, blocked: blockedVolume > 1 };
  if (!result.formerBypass.blocked) failures.push('Former annular bypass remains open');

  const housing = getPart('motor-housing');
  const boreProbe = cylinder([P.motorHousing.front - .5, 0, 0], [P.motorHousing.rear + .5, 0, 0], P.motorHousing.inner - .1, 128);
  const housingMesh = housing.solid.getMesh();
  let innerRadius = Infinity;
  for (let i = 0; i < housingMesh.vertProperties.length; i += housingMesh.numProp) {
    innerRadius = Math.min(innerRadius, Math.hypot(housingMesh.vertProperties[i + 1], housingMesh.vertProperties[i + 2]));
  }
  const boreObstruction = intersectionVolume(boreProbe, housing.solid);
  result.blueSleeve = {
    specifiedBoreDiameterMm: P.motorHousing.inner * 2, measuredInnerVertexDiameterMm: innerRadius * 2,
    probeRadiusMm: P.motorHousing.inner - .1, openBoreObstructionMm3: boreObstruction,
    frontMm: housing.bounds.min[0], rearMm: housing.bounds.max[0],
  };
  if (Math.abs(innerRadius - P.motorHousing.inner) > .001 || boreObstruction > .001
    || Math.abs(housing.bounds.min[0] - P.motorHousing.front) > .001
    || Math.abs(housing.bounds.max[0] - P.motorHousing.rear) > .001) failures.push('Blue sleeve bore or open ends do not match parameters');

  result.status = failures.length ? 'failed' : 'passed';
  result.failures = failures;
  // Preserve all existing generator results and update only this named field.
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  report.compressorGeometry = result;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: error.message }, null, 2));
  process.exitCode = 1;
}
