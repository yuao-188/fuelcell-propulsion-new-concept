/** Geometry checks on the exported mesh, or the same helper with --local.
 * These checks establish neither compressor performance nor motor power.
 */
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import ManifoldModule from 'manifold-3d';
import { Matrix4, Vector3 } from 'three';
import { parameters as P, colors as C } from '../new-design/parameters.mjs';
import { buildDetailedMachinery } from './detailed-machinery.mjs';

const root = resolve(import.meta.dirname, '..');
const modelPath = resolve(root, 'new-design/public/model.glb');
const reportPath = resolve(root, 'new-design/verification.json');
const local = process.argv.includes('--local');
assert.ok(process.argv.slice(2).every(argument => argument === '--local'), 'Supported option: --local');
const machineIds = [
  'fan', 'fan-spinner', 'fan-stators', 'main-motor', 'motor-front-cap', 'motor-rear-cap',
  'motor-shaft-collar', 'motor-housing', 'compressor-motor-1', 'compressor-motor-2',
  'compressor-rotor-1', 'compressor-rotor-2', 'compressor-casing',
  'compressor-shroud-1', 'compressor-shroud-2', 'compressor-return-channel',
  'intake-inner-shell', 'intake-fasteners', 'compressor-front-flange', 'compressor-rear-flange', 'compressor-fasteners',
];
const expectedComponents = { 'fan-stators': 18, 'intake-fasteners': 16, 'compressor-fasteners': 24 };
const shellIds = ['outer-shell', 'inner-shell'];
const retiredMachineIds = ['compressor-drive', 'compressor-shroud'];

try {
  assert.ok(P.intakeLiner, 'Double-wall intake parameters are required');
  const api = await ManifoldModule();
  api.setup();
  const { Manifold: M, Mesh, CrossSection: CS } = api;
  const cylinder = (a, b, radius, radius2 = radius, segments = 32) => {
    const origin = new Vector3(...a), z = new Vector3(...b).sub(origin), length = z.length();
    assert.ok(length > 0, 'Zero-length cylinder segment');
    z.normalize();
    const auxiliary = Math.abs(z.z) < .8 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
    const x = auxiliary.cross(z).normalize(), y = z.clone().cross(x);
    return M.cylinder(length, radius, radius2, segments)
      .transform(new Matrix4().makeBasis(x, y, z).setPosition(origin).elements);
  };
  const probeCylinder = (a, b, radius, segments = 32) => cylinder(a, b, radius, radius, segments);
  const revolved = (profile, wall) => new CS([[
    ...profile.map(([x, radius]) => [radius, x]),
    ...profile.toReversed().map(([x, radius]) => [radius - (typeof wall === 'function' ? wall(x) : wall), x]),
  ]]).revolve(144).rotate([0, 90, 0]);
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
    return new CS([points]).extrude(rear - front).rotate([0, 90, 0]).translate([front, 0, 0]);
  };
  const parts = [], shells = [];
  const register = (id, solid, extras = {}) => {
    assert.ok(!retiredMachineIds.includes(id), `${id}: obsolete single-stage part remains`);
    assert.equal(solid.status(), 'NoError', `${id}: invalid solid`);
    assert.ok(solid.volume() > 0, `${id}: empty solid`);
    const components = solid.decompose(), componentCount = components.length;
    if (machineIds.includes(id)) assert.equal(componentCount, expectedComponents[id] ?? 1, `${id}: unexpected disconnected components`);
    components.forEach(component => component.delete());
    (shellIds.includes(id) ? shells : parts).push({ id, solid, extras, componentCount, bounds: solid.boundingBox() });
  };
  if (local) {
    buildDetailedMachinery({ M, CS, P, C, union: solids => M.union(solids), cylinder, revolved, sector,
      add: (id, name, group, color, solid, extras) => register(id, solid, { name, group, color, ...extras }),
    });
    // Reproduce the unchanged envelope samples, omitting only recesses. A clear
    // result against these complete walls is conservative for the local stators.
    const os = P.outerShell, ins = P.innerShell, smooth = t => t * t * (3 - 2 * t);
    const outerProfile = [[os.front, os.radius + 10], [os.front + 4, os.radius + 7],
      [os.front + 12, os.radius + 3], [os.front + 25, os.radius], [os.taperStart, os.radius]];
    for (let i = 1; i <= 64; i++) outerProfile.push([os.taperStart + (os.waistStart - os.taperStart) * i / 64,
      os.radius + (os.waistRadius - os.radius) * smooth(i / 64)]);
    outerProfile.push([os.shoulder, os.waistRadius]);
    for (let i = 1; i <= 40; i++) outerProfile.push([os.shoulder + (os.rear - os.shoulder) * i / 40,
      os.waistRadius + (os.outletRadius - os.waistRadius) * smooth(i / 40)]);
    const innerProfile = [[ins.front, ins.inletRadius], [ins.expansionStart, ins.inletRadius]];
    for (let i = 1; i <= 96; i++) innerProfile.push([ins.expansionStart + (ins.shoulder - ins.expansionStart) * i / 96,
      ins.inletRadius + (ins.radius - ins.inletRadius) * smooth(i / 96)]);
    for (let i = 1; i <= 40; i++) innerProfile.push([ins.shoulder + (ins.rear - ins.shoulder) * i / 40,
      ins.radius + (ins.outletRadius - ins.radius) * smooth(i / 40)]);
    register('outer-shell', revolved(outerProfile, os.wall));
    register('inner-shell', revolved(innerProfile, ins.wall));
  } else {
    const document = await new NodeIO().read(modelPath);
    for (const node of document.getRoot().listNodes()) {
      const id = node.getExtras().id;
      assert.ok(!retiredMachineIds.includes(id), `${id}: obsolete single-stage part remains in GLB`);
      if (!machineIds.includes(id) && !shellIds.includes(id)) continue;
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
      register(id, solid, node.getExtras());
    }
  }
  assert.deepEqual(parts.map(part => part.id).sort(), [...machineIds].sort(), 'Missing or duplicate front machinery');
  assert.deepEqual(shells.map(part => part.id).sort(), [...shellIds].sort(), 'Missing or duplicate grey shells');
  const getPart = id => parts.find(part => part.id === id);
  const overlaps = (a, b) => [0, 1, 2].every(i => a.min[i] < b.max[i] && b.min[i] < a.max[i]);
  const intersectionVolume = (a, b) => {
    const overlap = a.intersect(b), volume = Math.max(0, overlap.volume());
    overlap.delete();
    return volume;
  };
  const polar = (x, radius, angle) => [x, radius * Math.cos(angle), radius * Math.sin(angle)];
  const failures = [];
  const result = {
    status: 'passed',
    scope: 'Front machinery geometry only; no aerodynamic performance or motor power validation',
    source: local ? 'local modelling helper' : 'exported GLB',
    ...(local ? {} : { modelModifiedAt: (await stat(modelPath)).mtime.toISOString() }),
    units: P.units,
    frontParts: parts.length,
    componentCounts: Object.fromEntries(parts.map(part => [part.id, part.componentCount])),
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

  const fan = getPart('fan'), stators = getPart('fan-stators');
  const shellIntersections = shells.map(shell => ({ id: shell.id,
    volumeMm3: overlaps(stators.bounds, shell.bounds) ? intersectionVolume(stators.solid, shell.solid) : 0,
  }));
  result.fanStators = {
    blades: stators.componentCount,
    stationary: !stators.extras.rotor,
    frontMm: stators.bounds.min[0], rearMm: stators.bounds.max[0],
    axialClearanceFromFanMm: stators.bounds.min[0] - fan.bounds.max[0],
    shellCheck: local ? 'complete sampled shell envelopes; conservative' : 'actual exported shell solids',
    shellIntersections,
  };
  if (!result.fanStators.stationary) failures.push('Fan stators must not be marked as a rotor');
  if (result.fanStators.axialClearanceFromFanMm <= .001) failures.push('Fan stators must have axial clearance behind the fan');
  if (shellIntersections.some(item => item.volumeMm3 > .02)) failures.push('Fan stators intersect a grey shell');

  const compressorRotors = [getPart('compressor-rotor-1'), getPart('compressor-rotor-2')];
  const compressorMotors = [getPart('compressor-motor-1'), getPart('compressor-motor-2')];
  result.independentDrives = {
    rotatingGroups: compressorRotors.map(part => ({ id: part.id, rotor: part.extras.rotor,
      frontMm: part.bounds.min[0], rearMm: part.bounds.max[0], connectedComponents: part.componentCount,
    })),
    motorHousingsStationary: compressorMotors.every(part => !part.extras.rotor),
    axialSeparationBetweenRotorsMm: compressorRotors[1].bounds.min[0] - compressorRotors[0].bounds.max[0],
    motorSizing: 'geometric placeholders; no 16 kW packaging or operating performance claim',
  };
  if (!result.independentDrives.motorHousingsStationary) failures.push('Compressor motor housings must remain stationary');
  if (compressorRotors.some(part => !part.extras.rotor)
    || compressorRotors[0].extras.rotor === compressorRotors[1].extras.rotor) failures.push('Compressor rotors need independent rotation groups');
  if (result.independentDrives.axialSeparationBetweenRotorsMm <= .001) failures.push('Compressor short shafts are not axially separated');

  // Independently specified checkpoints follow both blade passages and the
  // inward return passage. They are not taken from the helper's output.
  const K = P.compressor, axialScale = (K.outlet - K.front) / 210;
  const ax = nominal => K.front + (nominal - 480) * axialScale;
  const rr = nominal => nominal * K.inner / 165;
  const entryAngle = Math.PI / 12, exitAngle = entryAngle - .52;
  const neckStart = K.outlet - (K.outletNeckLength ?? (K.outlet - K.rear) * .5);
  const outletProbe = probeCylinder([neckStart + .1, 0, 0], [K.outlet - .1, 0, 0], P.air.inner - .1, 128);
  const outletObstructions = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(outletProbe, part.solid) }));
  const casingMesh = getPart('compressor-casing').solid.getMesh();
  let neckInner = Infinity, neckOuter = 0;
  for (let i = 0; i < casingMesh.vertProperties.length; i += casingMesh.numProp) {
    if (casingMesh.vertProperties[i] < neckStart - .001) continue;
    const radius = Math.hypot(casingMesh.vertProperties[i + 1], casingMesh.vertProperties[i + 2]);
    neckInner = Math.min(neckInner, radius);
    neckOuter = Math.max(neckOuter, radius);
  }
  result.outletNeck = {
    frontMm: neckStart, rearMm: K.outlet,
    specifiedInnerDiameterMm: P.air.inner * 2, specifiedOuterDiameterMm: P.air.outer * 2,
    measuredInnerVertexDiameterMm: neckInner * 2, measuredOuterVertexDiameterMm: neckOuter * 2,
    fullBoreProbeRadiusMm: P.air.inner - .1,
    obstructions: outletObstructions.filter(item => item.volumeMm3 > .001),
  };
  if (Math.abs(neckInner - P.air.inner) > .001 || Math.abs(neckOuter - P.air.outer) > .001) failures.push('Outlet neck does not match specified ID/OD');
  if (result.outletNeck.obstructions.length) failures.push('Outlet neck full bore is obstructed');
  outletProbe.delete();
  const I = P.intakeLiner;
  const annulusRadius = (P.motorHousing.inner + I.outer) / 2;
  // Stay between the two physical walls until beyond the liner's OPEN aft end.
  // Moving toward the axis earlier would incorrectly cut through the liner.
  const path = [
    polar(P.motorHousing.front + .5, annulusRadius, entryAngle), polar(I.rear + 1, annulusRadius, entryAngle),
    polar(ax(486), rr(80), entryAngle), polar(ax(512), rr(36.5), entryAngle),
    polar(ax(520), rr(36.5), entryAngle),
  ];
  const bladePassage = (plate, inner, outer, inletHeight, outletHeight) => {
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, height = inletHeight + (outletHeight - inletHeight) * t;
      path.push(polar(ax(plate - height * .45), rr(inner + (outer - inner) * t), entryAngle - .52 * t * t));
    }
  };
  bladePassage(544, 39, 143.8, 22, 9.5);
  const returnEntryAngle = -7 * Math.PI / 180, returnOuterAngle = returnEntryAngle + .18;
  path.push(
    polar(ax(539.725), rr(158), exitAngle), polar(ax(551), rr(158), exitAngle),
    polar(ax(559), rr(158), returnOuterAngle), polar(ax(565), rr(153), returnOuterAngle),
  );
  for (let i = 32; i >= 0; i--) {
    const t = i / 32;
    path.push(polar(ax(565), rr(48 + (152.8 - 48) * t), returnEntryAngle + .18 * t * t));
  }
  path.push(polar(ax(565), rr(44), returnEntryAngle), polar(ax(578), rr(31), returnEntryAngle),
    polar(ax(580), rr(31), entryAngle), polar(ax(582), rr(31), entryAngle));
  bladePassage(611, 33.5, 114.8, 27, 11);
  path.push(polar(ax(606.05), rr(126), exitAngle), polar(ax(619), rr(126), exitAngle),
    polar(ax(624), rr(85), exitAngle), polar(ax(635), rr(60), exitAngle),
    polar(ax(650), rr(43), exitAngle), polar(ax(660), rr(25), exitAngle), polar(ax(665), rr(12), exitAngle),
    [neckStart, 0, 0], [K.outlet - .5, 0, 0],
  );
  const passage = M.union(path.slice(1).map((point, i) => probeCylinder(path[i], point, .5)));
  const obstructionVolumes = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(passage, part.solid) }));
  result.inletToOutlet = {
    probeRadiusMm: .5, segments: path.length - 1, toleranceMm3: .001,
    maximumObstructionVolumeMm3: Math.max(...obstructionVolumes.map(item => item.volumeMm3)),
    obstructions: obstructionVolumes.filter(item => item.volumeMm3 > .001),
  };
  if (result.inletToOutlet.obstructions.length) {
    result.inletToOutlet.obstructedSegments = [];
    for (let i = 0; i < path.length - 1; i++) {
      const segment = probeCylinder(path[i], path[i + 1], .5);
      for (const { id } of result.inletToOutlet.obstructions) {
        const volumeMm3 = intersectionVolume(segment, getPart(id).solid);
        if (volumeMm3 > .001) result.inletToOutlet.obstructedSegments.push({ id, segment: i,
          from: path[i], to: path[i + 1], volumeMm3,
        });
      }
      segment.delete();
    }
  }
  if (result.inletToOutlet.obstructions.length) failures.push('Inlet-to-outlet probe is obstructed');

  // Only each stage's cover is tested as the blocker, so casing convergence
  // cannot produce a false pass for a missing separator.
  result.formerBypass = [
    { stage: 1, front: 480, rear: 540, radius: 155 },
    { stage: 2, front: 578, rear: 606, radius: 125 },
  ].map(({ stage, front, rear, radius }) => {
    const probe = probeCylinder([ax(front), rr(radius), 0], [ax(rear), rr(radius), 0], 1);
    const volumeMm3 = intersectionVolume(probe, getPart(`compressor-shroud-${stage}`).solid);
    probe.delete();
    return { stage, radiusFromAxisMm: rr(radius), probeRadiusMm: 1, shroudIntersectionMm3: volumeMm3, blocked: volumeMm3 > 1 };
  });
  if (result.formerBypass.some(probe => !probe.blocked)) failures.push('A compressor stage has an open outer bypass');
  const centreBypass = probeCylinder([ax(550), 0, 0], [ax(575), 0, 0], .75);
  const diaphragmBlockage = intersectionVolume(centreBypass, getPart('compressor-return-channel').solid);
  result.returnDiaphragm = { centreBlocked: diaphragmBlockage > 1, intersectionVolumeMm3: diaphragmBlockage };
  if (!result.returnDiaphragm.centreBlocked) failures.push('Return diaphragm centre is open despite the separate short shafts');
  centreBypass.delete();

  const housing = getPart('motor-housing');
  const boreProbe = probeCylinder([P.motorHousing.front - .5, 0, 0], [P.motorHousing.rear + .5, 0, 0], P.motorHousing.inner - .1, 128);
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

  const liner = getPart('intake-inner-shell');
  const linerBore = probeCylinder([I.front - .5, 0, 0], [I.rear + .5, 0, 0], I.inner - .1, 128);
  const linerBoreObstruction = intersectionVolume(linerBore, liner.solid);
  const linerMesh = liner.solid.getMesh();
  let linerInner = Infinity, linerOuter = 0;
  for (let i = 0; i < linerMesh.vertProperties.length; i += linerMesh.numProp) {
    const radius = Math.hypot(linerMesh.vertProperties[i + 1], linerMesh.vertProperties[i + 2]);
    linerInner = Math.min(linerInner, radius);
    linerOuter = Math.max(linerOuter, radius);
  }
  const annularProbe = probeCylinder([I.front - .1, 0, 0], [I.rear + .1, 0, 0], P.motorHousing.inner - .1, 128)
    .subtract(probeCylinder([I.front - .2, 0, 0], [I.rear + .2, 0, 0], I.outer + .1, 128));
  const annularObstructions = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(annularProbe, part.solid) }));
  result.intakeInnerShell = {
    specifiedInnerDiameterMm: I.inner * 2, specifiedOuterDiameterMm: I.outer * 2,
    measuredInnerVertexDiameterMm: linerInner * 2, measuredOuterVertexDiameterMm: linerOuter * 2,
    motorRadialClearanceMm: I.inner - P.motor.radius,
    frontMm: liner.bounds.min[0], rearMm: liner.bounds.max[0], openBoreObstructionMm3: linerBoreObstruction,
  };
  result.intakeAnnulus = {
    radialGapMm: P.motorHousing.inner - I.outer,
    nominalAreaMm2: Math.PI * (P.motorHousing.inner ** 2 - I.outer ** 2),
    flowProbeRadiusFromAxisMm: annulusRadius,
    maximumObstructionVolumeMm3: Math.max(...annularObstructions.map(item => item.volumeMm3)),
    obstructions: annularObstructions.filter(item => item.volumeMm3 > .001),
  };
  if (Math.abs(linerInner - I.inner) > .001 || Math.abs(linerOuter - I.outer) > .001
    || Math.abs(liner.bounds.min[0] - I.front) > .001 || Math.abs(liner.bounds.max[0] - I.rear) > .001
    || linerBoreObstruction > .001) failures.push('Inner liner dimensions or open ends do not match parameters');
  if (result.intakeAnnulus.obstructions.length) failures.push('Double-wall intake annulus is obstructed');

  result.status = failures.length ? 'failed' : 'passed';
  result.failures = failures;
  // Preserve all existing generator results and update only this named field.
  if (!local) {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.compressorGeometry = result;
    await writeFile(reportPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: error.message }, null, 2));
  process.exitCode = 1;
}
