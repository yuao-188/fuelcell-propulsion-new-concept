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
import { buildDetailedMachinery, fanBladeSections } from './detailed-machinery.mjs';
import { getInnerShellLayout } from './inner-shell-layout.mjs';
import { getIntakeLinerLayout } from './intake-liner-layout.mjs';

const root = resolve(import.meta.dirname, '..');
const modelPath = resolve(root, 'new-design/public/model.glb');
const reportPath = resolve(root, 'new-design/verification.json');
const local = process.argv.includes('--local');
assert.ok(process.argv.slice(2).every(argument => argument === '--local'), 'Supported option: --local');
const machineIds = [
  'fan', 'fan-spinner', 'fan-stators', 'main-motor', 'motor-front-cap', 'motor-rear-cap',
  'motor-shaft-collar', 'motor-housing', 'compressor-motor-1', 'compressor-motor-2',
  'compressor-rotor-1', 'compressor-rotor-2', 'compressor-casing',
  'compressor-diffuser-1', 'compressor-diffuser-2',
  'intake-inner-shell', 'intake-fasteners', 'compressor-front-flange', 'compressor-rear-flange', 'compressor-fasteners',
];
const expectedComponents = { 'fan-stators': 18, 'intake-fasteners': 16, 'compressor-fasteners': 24,
  'compressor-diffuser-1': 18, 'compressor-diffuser-2': 18 };
const shellIds = ['outer-shell', 'inner-shell'];
const retiredMachineIds = ['compressor-drive', 'compressor-shroud',
  'compressor-shroud-1', 'compressor-shroud-2', 'compressor-return-diaphragm', 'compressor-return-channel'];

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
    assert.ok(!retiredMachineIds.includes(id), `${id}: removed compressor part remains`);
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
    const innerLayout = getInnerShellLayout(P);
    register('outer-shell', revolved(outerProfile, os.wall));
    register('inner-shell', revolved(innerLayout.profile, innerLayout.wallAt));
  } else {
    const document = await new NodeIO().read(modelPath);
    for (const node of document.getRoot().listNodes()) {
      const id = node.getExtras().id;
      assert.ok(!retiredMachineIds.includes(id), `${id}: removed compressor part remains in GLB`);
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
    scope: 'Two backed eighteen-blade rotors; static covers and interstage return assembly removed; structural geometry only',
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

  const fanMesh = fan.solid.getMesh(), fanVertices = [];
  for (let i = 0; i < fanMesh.vertProperties.length; i += fanMesh.numProp) {
    fanVertices.push(Array.from(fanMesh.vertProperties.slice(i, i + 3)));
  }
  const nearestVertex = point => {
    let nearest = null, errorMm = Infinity;
    for (const vertex of fanVertices) {
      const error = Math.hypot(...vertex.map((value, i) => value - point[i]));
      if (error < errorMm) { nearest = vertex; errorMm = error; }
    }
    return { position: nearest, errorMm };
  };
  const sections = fanBladeSections(P.fan);
  const measuredSections = sections.filter(section => section.radius > P.fan.hubRadius + 5).map(section => {
    const angle = section.angleToAxisDeg * Math.PI / 180;
    const endpoints = [0, 1].map(u => {
      const q = section.chord * (u - .48), tangential = q * Math.sin(angle);
      return nearestVertex([section.centreX + q * Math.cos(angle),
        section.radius * Math.cos(section.sweep) - tangential * Math.sin(section.sweep),
        section.radius * Math.sin(section.sweep) + tangential * Math.cos(section.sweep)]);
    });
    const chord = endpoints[1].position.map((value, i) => value - endpoints[0].position[i]);
    return { radiusMm: section.radius, spanFraction: section.span,
      specifiedAngleToAxisDeg: section.angleToAxisDeg,
      measuredAngleToAxisDeg: Math.acos(Math.abs(chord[0]) / Math.hypot(...chord)) * 180 / Math.PI,
      maximumEndpointErrorMm: Math.max(...endpoints.map(endpoint => endpoint.errorMm)) };
  });
  result.fanTwist = { buriedRootAngleToAxisDeg: sections[0].angleToAxisDeg,
    exposedRoot: measuredSections[0], tip: measuredSections.at(-1), measuredSections };
  if (measuredSections.some(section => section.maximumEndpointErrorMm > .004
    || Math.abs(section.measuredAngleToAxisDeg - section.specifiedAngleToAxisDeg) > .004)
    || measuredSections.some((section, i) => i && section.measuredAngleToAxisDeg <= measuredSections[i - 1].measuredAngleToAxisDeg)) {
    failures.push('Fan chord angles are not the requested continuous root-to-tip twist');
  }
  result.fanRadialSections = [125, 300, 470].map(radius => {
    const ring = probeCylinder([fan.bounds.min[0] - 1, 0, 0], [fan.bounds.max[0] + 1, 0, 0], radius + .15, 192)
      .subtract(probeCylinder([fan.bounds.min[0] - 2, 0, 0], [fan.bounds.max[0] + 2, 0, 0], radius - .15, 192));
    const intersections = fan.solid.intersect(ring), components = intersections.decompose();
    const bladeCount = components.length;
    components.forEach(component => component.delete()); intersections.delete(); ring.delete();
    return { radiusMm: radius, separatedBlades: bladeCount };
  });
  if (P.fan.blades !== 16 || result.fanRadialSections.some(section => section.separatedBlades !== 16)) failures.push('The main fan must retain sixteen separate blades outside the hub');
  if (Math.abs(result.fanTwist.tip.measuredAngleToAxisDeg - 66) > .004) failures.push('Main fan tip chord must make 66 degrees with the axis');

  // Lengthen only the cone upstream. Its original base plane and hub radius
  // remain at x=110 and R=100; the fan itself keeps its original placement.
  const spinner = getPart('fan-spinner'), spinnerMesh = spinner.solid.getMesh();
  let spinnerFrontRadius = 0, spinnerBaseRadius = 0, spinnerProfileError = 0;
  for (let i = 0; i < spinnerMesh.vertProperties.length; i += spinnerMesh.numProp) {
    const x = spinnerMesh.vertProperties[i], radius = Math.hypot(spinnerMesh.vertProperties[i + 1], spinnerMesh.vertProperties[i + 2]);
    if (Math.abs(x) < .001) spinnerFrontRadius = Math.max(spinnerFrontRadius, radius);
    if (Math.abs(x - 110) < .001) spinnerBaseRadius = Math.max(spinnerBaseRadius, radius);
    if (radius > .1) spinnerProfileError = Math.max(spinnerProfileError, Math.abs(radius - Math.max(.35, 100 * x / 110)));
  }
  result.fanSpinner = {
    frontMm: spinner.bounds.min[0], baseMm: spinner.bounds.max[0],
    axialLengthMm: spinner.bounds.max[0] - spinner.bounds.min[0],
    frontTipRadiusMm: spinnerFrontRadius, baseRadiusMm: spinnerBaseRadius,
    maximumConicalProfileErrorMm: spinnerProfileError,
    retainedFanPlacement: { frontMm: P.fan.front, centreMm: P.fan.x, rearMm: P.fan.rear },
    sharedHubBaseVertex: nearestVertex([110, 100, 0]),
  };
  if (P.fan.spinnerFront !== 0 || P.fan.front !== 50 || P.fan.x !== 130 || P.fan.rear !== 210
    || Math.abs(result.fanSpinner.frontMm) > .001 || Math.abs(result.fanSpinner.baseMm - 110) > .001
    || Math.abs(result.fanSpinner.axialLengthMm - 110) > .001
    || Math.abs(spinnerFrontRadius - .35) > .001 || Math.abs(spinnerBaseRadius - 100) > .001
    || spinnerProfileError > .001 || result.fanSpinner.sharedHubBaseVertex.errorMm > .001) {
    failures.push('The extended conical spinner must run from x=0 to the unchanged x=110/R=100 hub base without moving the fan');
  }

  // Remove the shared hub and examine every complete exposed leaf. This catches
  // a merger between the radial checkpoints and measures actual triangle-based
  // separation, instead of treating the whole joined rotor as collision proof.
  const hubMask = probeCylinder([fan.bounds.min[0] - 1, 0, 0], [fan.bounds.max[0] + 1, 0, 0],
    (P.fan.hubRadius + .1) / Math.cos(Math.PI / 192), 192);
  const exposedFan = fan.solid.subtract(hubMask), exposedBlades = exposedFan.decompose();
  const significantBlades = exposedBlades.filter(blade => blade.volume() > .001);
  const bladeGapSearchLimit = 50;
  let minimumBladeGap = bladeGapSearchLimit, bladeGapPairs = 0;
  for (let i = 0; i < significantBlades.length; i++) for (let j = i + 1; j < significantBlades.length; j++) {
    minimumBladeGap = Math.min(minimumBladeGap, significantBlades[i].minGap(significantBlades[j], bladeGapSearchLimit));
    bladeGapPairs++;
  }
  result.fanBladeSeparation = { exposedBladeCount: significantBlades.length,
    sharedHubExcludedToRadiusMm: P.fan.hubRadius + .1, checkedPairs: bladeGapPairs,
    minimumSeparationMm: minimumBladeGap, distanceSearchLimitMm: bladeGapSearchLimit };
  if (significantBlades.length !== 16 || !Number.isFinite(minimumBladeGap) || minimumBladeGap < P.clearance) {
    failures.push('Exposed main-fan leaves intersect or have less than the specified clearance');
  }
  exposedBlades.forEach(blade => blade.delete()); exposedFan.delete(); hubMask.delete();

  // Rotating a blade sweeps every azimuth. A convex hull in (x,r), revolved
  // with circumscribed facets, encloses that whole motion rather than sampling
  // a few angular positions. The extra radial 0.8 mm verifies the running gap.
  const motionGap = .8, revolutionSegments = 192;
  const hullPoints = fanVertices.map(([x, y, z]) => [x,
    (Math.hypot(y, z) + motionGap) / Math.cos(Math.PI / revolutionSegments)]);
  hullPoints.push([fan.bounds.min[0], 0], [fan.bounds.max[0], 0]);
  hullPoints.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const halfHull = points => {
    const hull = [];
    for (const point of points) {
      while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull;
  };
  const lowerHull = halfHull(hullPoints), upperHull = halfHull(hullPoints.toReversed());
  const motionHull = [...lowerHull.slice(0, -1), ...upperHull.slice(0, -1)].map(([x, r]) => [r, x]).reverse();
  const sweptEnvelope = new CS([motionHull]).revolve(revolutionSegments).rotate([0, 90, 0]);
  const sweptBounds = sweptEnvelope.boundingBox();
  const motionIntersections = [...parts, ...shells].filter(part => part.id !== 'fan' && part.id !== 'fan-spinner'
    && overlaps(sweptBounds, part.bounds)).map(part => ({ id: part.id, volumeMm3: intersectionVolume(sweptEnvelope, part.solid) }));
  result.fanMotionEnvelope = { radialRunningGapMm: motionGap, method: 'conservative continuous rotational envelope',
    maximumIntersectionMm3: Math.max(0, ...motionIntersections.map(item => item.volumeMm3)), intersections: motionIntersections };
  if (motionIntersections.some(item => item.volumeMm3 > .02)) failures.push('Fan rotational envelope with 0.8 mm running gap intersects a fixed part');
  sweptEnvelope.delete();

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

  // Independently specified axial/radial profiles enclose the complete rotor
  // sweep, including the shafts, cones, blade tips and backplates. Expanding
  // these profiles verifies a running gap at every azimuth, not just at the
  // current eighteen blade positions. Circumscribed facets prevent the
  // verification envelope from shrinking between revolution vertices.
  const rotorMotionProfiles = [
    [[487, 12.375], [514, 12.375], [514, 12.375 * 1.15], [522, 41 * .69],
      [522, 39], [534.5, 162.8], [544.15, 162.8], [544.15, 143.8], [549, 143.8]],
    [[576, 12.375 * 1.15], [584, 35.6 * .69], [584, 33.5], [600, 134.8],
      [611.15, 134.8], [611.15, 114.8], [616, 114.8], [616, 12.375], [638, 12.375]],
  ];
  result.compressorMotionEnvelopes = rotorMotionProfiles.map((profile, index) => {
    const rotor = compressorRotors[index], segments = 256, cornerSegments = 96;
    const section = new CS([[
      ...profile.map(([x, r]) => [rr(r), ax(x)]),
      [0, ax(profile.at(-1)[0])], [0, ax(profile[0][0])],
    ]]);
    const expanded = section.offset((P.clearance + .0001) / Math.cos(Math.PI / cornerSegments), 'Round', 2, cornerSegments);
    const circumscribed = expanded.scale([1 / Math.cos(Math.PI / segments), 1]);
    const envelope = circumscribed.revolve(segments).rotate([0, 90, 0]);
    section.delete(); expanded.delete(); circumscribed.delete();
    const missing = rotor.solid.subtract(envelope), uncoveredRotorMm3 = Math.max(0, missing.volume());
    missing.delete();
    const bounds = envelope.boundingBox();
    const intersections = parts.filter(part => part.id !== rotor.id && overlaps(bounds, part.bounds))
      .map(part => ({ id: part.id, volumeMm3: intersectionVolume(envelope, part.solid) }));
    const report = { stage: index + 1, method: 'continuous 360-degree swept profile with circumscribed facets',
      verifiedRunningGapMm: P.clearance, uncoveredRotorMm3,
      maximumIntersectionMm3: Math.max(0, ...intersections.map(item => item.volumeMm3)), intersections };
    envelope.delete();
    if (uncoveredRotorMm3 > .001 || report.maximumIntersectionMm3 > .001) {
      failures.push(`Compressor stage ${index + 1} full rotational envelope lacks the specified running clearance`);
    }
    return report;
  });

  // The first drive has its original three round supports again. Inspect
  // actual radial cuts to distinguish the three rods from the removed six
  // guide surfaces; do not make the old curved-guide metadata authoritative.
  const inletMotor = compressorMotors[0];
  const inletSupportSections = [45, 70, 100, 130, 155].map(nominalRadius => {
    const radius = rr(nominalRadius);
    const outside = probeCylinder([ax(480), 0, 0], [ax(512), 0, 0], radius + .1, 256);
    const inside = probeCylinder([ax(479.9), 0, 0], [ax(512.1), 0, 0], radius - .1, 256);
    const ring = outside.subtract(inside), cut = inletMotor.solid.intersect(ring), components = cut.decompose();
    const supports = components.filter(component => component.volume() > .001).map(component => {
      const bounds = component.boundingBox();
      return { centreXmm: (bounds.min[0] + bounds.max[0]) / 2, axialWidthMm: bounds.max[0] - bounds.min[0] };
    });
    components.forEach(component => component.delete()); cut.delete(); ring.delete(); outside.delete(); inside.delete();
    return { radiusMm: radius, separatedSupports: supports.length, supports };
  });
  const inletSupportPassages = Array.from({ length: 3 }, (_, index) => {
    const angle = (10 + index * 120) * Math.PI / 180;
    const radius = (P.motorHousing.inner + P.intakeLiner.outer) / 2;
    const points = [polar(P.intakeLiner.rear + .5, radius, angle), polar(ax(486), rr(80), angle),
      polar(ax(512), rr(36.5), angle), polar(ax(520), rr(36.5), angle)];
    const tubes = points.slice(1).map((point, i) => probeCylinder(points[i], point, 1));
    const probe = M.union(tubes);
    const obstructions = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(probe, part.solid) }))
      .filter(item => item.volumeMm3 > .001);
    probe.delete(); tubes.forEach(tube => tube.delete());
    return { channel: index + 1, probeRadiusMm: 1, obstructions };
  });
  const linerGap = inletMotor.bounds.min[0] - getPart('intake-inner-shell').bounds.max[0];
  result.compressorInletSupports = {
    stationary: inletMotor.extras.stationary === true && !inletMotor.extras.rotor,
    connectedMotorAndSupports: inletMotor.componentCount,
    motorFrontMm: inletMotor.bounds.min[0], motorRearMm: inletMotor.bounds.max[0],
    intakeLinerAxialClearanceLowerBoundMm: linerGap,
    radialSections: inletSupportSections, openChannels: inletSupportPassages,
  };
  if (!result.compressorInletSupports.stationary || inletMotor.componentCount !== 1
    || Math.abs(inletMotor.bounds.min[0] - ax(484)) > .001 || Math.abs(inletMotor.bounds.max[0] - ax(510)) > .001
    || inletSupportSections.some(section => section.separatedSupports !== 3
      || section.supports.some(support => Math.abs(support.centreXmm - ax(492)) > .001
        || Math.abs(support.axialWidthMm - rr(4.8)) > .001))) {
    failures.push('The first compressor motor must have its original three fixed round supports');
  }
  if (linerGap < P.clearance || inletSupportPassages.some(passage => passage.obstructions.length)) {
    failures.push('First compressor inlet supports obstruct a passage or lack intake-liner clearance');
  }

  const compressorStages = [
    { stage: 1, plate: 544, back: 549, inner: 39, outer: 162.8, backplateRadius: 143.8, eye: 41,
      heightIn: 22, heightOut: 9.5, witness: 80, diffuserInner: 148.2, diffuserFront: 552, diffuserRear: 567 },
    { stage: 2, plate: 611, back: 616, inner: 33.5, outer: 134.8, backplateRadius: 114.8, eye: 35.6,
      heightIn: 27, heightOut: 11, witness: 65, diffuserInner: 119.2, diffuserFront: 619, diffuserRear: 629 },
  ];
  result.compressorBladeSections = compressorRotors.flatMap((rotor, i) => {
    return (i === 0 ? [75, 120, 155] : [60, 100, 125]).map(nominalRadius => {
      // Stop ahead of the restored backplate, otherwise the disk joins all of
      // the blade intersections into one ring and hides the actual leaf count.
      const radius = rr(nominalRadius), front = rotor.bounds.min[0] - .1, rear = ax(compressorStages[i].plate) - .3;
      const outside = probeCylinder([front, 0, 0], [rear, 0, 0], radius + .15, 128);
      const inside = probeCylinder([front - .1, 0, 0], [rear + .1, 0, 0], radius - .15, 128);
      const ring = outside.subtract(inside), cut = rotor.solid.intersect(ring), blades = cut.decompose();
      const result = { stage: i + 1, radiusMm: radius, separatedBlades: blades.length,
        metadataBlades: rotor.extras.bladeCount };
      blades.forEach(blade => blade.delete()); cut.delete(); ring.delete(); outside.delete(); inside.delete();
      return result;
    });
  });
  if (result.compressorBladeSections.some(section => section.separatedBlades !== 18 || section.metadataBlades !== 18)) {
    failures.push('Each compressor rotor must retain eighteen separate blades ahead of its backplate');
  }
  result.restoredBackplates = [];
  result.compressorBladeAttachments = [];
  result.compressorAftDiffusers = [];
  for (const S of compressorStages) {
    const rotor = compressorRotors[S.stage - 1], diffuser = getPart(`compressor-diffuser-${S.stage}`);
    const outer = probeCylinder([ax(S.plate + .5), 0, 0], [ax(S.back - .5), 0, 0], rr(S.backplateRadius) - .1, 256);
    const inner = probeCylinder([ax(S.plate + .4), 0, 0], [ax(S.back - .4), 0, 0], rr(S.eye + 5), 128);
    const materialWitness = outer.subtract(inner), missing = materialWitness.subtract(rotor.solid);
    const missingVolume = Math.max(0, missing.volume());
    missing.delete(); materialWitness.delete(); outer.delete(); inner.delete();
    const rotorMesh = rotor.solid.getMesh();
    let backplateVertexRadius = 0, bladeTipRadius = 0, rotatingBladeAndDiscRear = -Infinity;
    for (let i = 0; i < rotorMesh.vertProperties.length; i += rotorMesh.numProp) {
      const r = Math.hypot(rotorMesh.vertProperties[i + 1], rotorMesh.vertProperties[i + 2]);
      bladeTipRadius = Math.max(bladeTipRadius, r);
      // Exclude only the thin short shaft which continues into the aft motor.
      if (r > rr(50)) rotatingBladeAndDiscRear = Math.max(rotatingBladeAndDiscRear, rotorMesh.vertProperties[i]);
      if (Math.abs(rotorMesh.vertProperties[i] - ax(S.back)) > .001) continue;
      backplateVertexRadius = Math.max(backplateVertexRadius, r);
    }
    const runningGap = probeCylinder([ax(S.plate) - .01, 0, 0], [ax(S.back) + .01, 0, 0], rr(S.backplateRadius) + P.clearance, 256);
    const diffuserObstruction = intersectionVolume(runningGap, diffuser.solid);
    const casingObstruction = intersectionVolume(runningGap, getPart('compressor-casing').solid);
    runningGap.delete();
    let materialBeyondBackplate = 0;
    if (S.outer > S.backplateRadius) {
      const out = probeCylinder([ax(S.plate + .5), 0, 0], [ax(S.back - .5), 0, 0], rr(S.outer) + .1, 256);
      const inside = probeCylinder([ax(S.plate + .4), 0, 0], [ax(S.back - .4), 0, 0], rr(S.backplateRadius) + .1, 256);
      const witness = out.subtract(inside);
      materialBeyondBackplate = intersectionVolume(witness, rotor.solid);
      witness.delete(); out.delete(); inside.delete();
    }
    result.restoredBackplates.push({ stage: S.stage, frontMm: ax(S.plate), rearMm: ax(S.back),
      specifiedRadiusMm: rr(S.backplateRadius), measuredRearVertexRadiusMm: backplateVertexRadius,
      specifiedBladeTipRadiusMm: rr(S.outer), measuredBladeTipRadiusMm: bladeTipRadius,
      bladeRadialOverhangMm: rr(S.outer - S.backplateRadius), materialBeyondBackplateMm3: materialBeyondBackplate,
      missingMaterialMm3: missingVolume,
      verifiedRunningGapMm: P.clearance, diffuserObstructionMm3: diffuserObstruction, casingObstructionMm3: casingObstruction });
    if (missingVolume > .001 || Math.abs(backplateVertexRadius - rr(S.backplateRadius)) > .001
      || Math.abs(bladeTipRadius - rr(S.outer)) > .001 || materialBeyondBackplate > .001
      || diffuserObstruction > .001 || casingObstruction > .001) failures.push(`Stage ${S.stage} backplate or its running clearance is invalid`);

    const axialGap = diffuser.bounds.min[0] - rotatingBladeAndDiscRear;
    result.compressorAftDiffusers.push({ stage: S.stage, vanes: diffuser.componentCount,
      stationary: diffuser.extras.stationary === true && !diffuser.extras.rotor,
      measuredFrontMm: diffuser.bounds.min[0], measuredRearMm: diffuser.bounds.max[0],
      rotatingBladeAndDiscRearMm: rotatingBladeAndDiscRear, axialGapMm: axialGap });
    if (diffuser.componentCount !== 18 || diffuser.extras.stationary !== true || diffuser.extras.rotor
      || Math.abs(diffuser.bounds.min[0] - ax(S.diffuserFront)) > .001
      || Math.abs(diffuser.bounds.max[0] - ax(S.diffuserRear)) > .001 || axialGap < P.clearance) {
      failures.push(`Stage ${S.stage} diffuser must contain eighteen fixed vanes aft of the entire impeller and backplate`);
    }

    // A continuous small probe just OUTSIDE the original cone must be covered
    // by each leaf over its complete root length. Axial bridge probes across
    // the backplate plane separately verify the blade bottoms join that disk.
    const rootFront = ax(S.plate - S.heightIn), rootRear = ax(S.plate);
    const hubRadius = x => rr(S.eye * .69 + S.eye * .31 * (x - rootFront) / (rootRear - rootFront));
    const thetaAt = (blade, radius) => blade * 2 * Math.PI / 18
      - .52 * Math.max(0, (radius - rr(S.inner)) / rr(S.outer - S.inner)) ** 2;
    const rootProbes = [], baseProbes = [];
    for (let blade = 0; blade < 18; blade++) {
      const rootPoints = Array.from({ length: 13 }, (_, k) => {
        const x = rootFront + .2 + (rootRear - rootFront - .4) * k / 12, radius = hubRadius(x) + .2;
        return polar(x, radius, thetaAt(blade, radius));
      });
      for (let k = 1; k < rootPoints.length; k++) rootProbes.push(probeCylinder(rootPoints[k - 1], rootPoints[k], .07, 12));
      for (let k = 0; k <= 8; k++) {
        const radius = rr(S.inner + (S.backplateRadius - S.inner - .5) * k / 8), theta = thetaAt(blade, radius);
        baseProbes.push(probeCylinder(polar(rootRear - .15, radius, theta), polar(rootRear + .15, radius, theta), .08, 12));
      }
    }
    const rootProbe = M.union(rootProbes), baseProbe = M.union(baseProbes);
    const rootMissing = rootProbe.subtract(rotor.solid), baseMissing = baseProbe.subtract(rotor.solid);
    const rootMissingVolume = Math.max(0, rootMissing.volume()), baseMissingVolume = Math.max(0, baseMissing.volume());
    result.compressorBladeAttachments.push({ stage: S.stage, rootFrontMm: rootFront, rootRearMm: rootRear,
      continuousRootProbeSegments: rootProbes.length, backplateBridgeProbes: baseProbes.length,
      bridgeProbeMaximumRadiusMm: rr(S.backplateRadius - .5), bladeRadialOverhangMm: rr(S.outer - S.backplateRadius),
      rootMissingMaterialMm3: rootMissingVolume, bladeBottomMissingMaterialMm3: baseMissingVolume,
      rotorConnectedComponents: rotor.componentCount });
    rootMissing.delete(); baseMissing.delete(); rootProbe.delete(); baseProbe.delete();
    rootProbes.forEach(probe => probe.delete()); baseProbes.forEach(probe => probe.delete());
    if (rootMissingVolume > .001 || baseMissingVolume > .001 || rotor.componentCount !== 1) failures.push(`Stage ${S.stage} blades are not continuously attached to hub and backplate`);
  }
  const entryAngle = Math.PI / 18, exitAngle = entryAngle - .52;
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
  bladePassage(544, 39, 162.8, 22, 9.5);
  path.push(
    polar(ax(539.725), rr(163.5), exitAngle), polar(ax(551), rr(163.5), exitAngle),
    polar(ax(568), rr(147), exitAngle), polar(ax(569), rr(144), exitAngle),
    polar(ax(569), rr(144), entryAngle), polar(ax(569), rr(44), entryAngle), polar(ax(578), rr(31), entryAngle),
    polar(ax(580), rr(31), entryAngle), polar(ax(582), rr(31), entryAngle),
  );
  bladePassage(611, 33.5, 134.8, 27, 11);
  path.push(polar(ax(606.05), rr(135.8), exitAngle), polar(ax(616), rr(135), exitAngle),
    polar(ax(619), rr(133), exitAngle),
    polar(ax(624), rr(85), exitAngle), polar(ax(635), rr(60), exitAngle),
    polar(ax(650), rr(43), exitAngle), polar(ax(660), rr(25), exitAngle), polar(ax(665), rr(12), exitAngle),
    [neckStart, 0, 0], [K.outlet - .5, 0, 0],
  );
  const passage = M.union(path.slice(1).map((point, i) => probeCylinder(path[i], point, .5)));
  const obstructionVolumes = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(passage, part.solid) }));
  result.inletToOutlet = {
    interpretation: 'A clear structural path through the open rotor and stator arrangement; no sealed pressure-stage claim',
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

  // Both static covers and the central diaphragm remain absent. The rotating
  // backplates are checked for positive material above, not listed as removed.
  const removalChecks = [];
  const recordRemoval = (id, probe) => {
    const obstructions = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(probe, part.solid) }))
      .filter(item => item.volumeMm3 > .001);
    removalChecks.push({ id, absentPartId: !parts.some(part => part.id === id),
      witnessVolumeMm3: probe.volume(), obstructions });
    probe.delete();
  };
  for (const S of compressorStages) {
    const u = (S.witness - S.inner) / (S.outer - S.inner);
    const coverFace = ax(S.plate - S.heightIn + (S.heightIn - S.heightOut) * u) - Math.max(.65, P.clearance);
    const x = coverFace - 1.5 * axialScale;
    recordRemoval(`compressor-shroud-${S.stage}`, probeCylinder(polar(x - .15 * axialScale, rr(S.witness), entryAngle),
      polar(x + .15 * axialScale, rr(S.witness), entryAngle), .25));
  }
  recordRemoval('compressor-return-diaphragm', probeCylinder([ax(551.7), 0, 0], [ax(554.3), 0, 0], rr(25), 64));
  result.removedDiscSurfaces = removalChecks;
  if (removalChecks.some(check => !check.absentPartId || check.obstructions.length)) failures.push('A removed compressor disc still occupies its witness volume');
  result.removedReturnVanes = { absentPartId: !parts.some(part => part.id === 'compressor-return-channel'),
    method: 'Removed part identity; the relocated first diffuser legitimately occupies part of the former witness region' };
  if (!result.removedReturnVanes.absentPartId) failures.push('Removed interstage return vane assembly is present');

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

  const liner = getPart('intake-inner-shell'), linerLayout = getIntakeLinerLayout(P);
  const rearInner = I.inner - I.radialContraction, rearOuter = I.outer - I.radialContraction;
  const linerBore = probeCylinder([I.front - .5, 0, 0], [I.rear + .5, 0, 0], rearInner - .1, 128);
  const linerBoreObstruction = intersectionVolume(linerBore, liner.solid);
  const linerMesh = liner.solid.getMesh();
  const linerStations = linerLayout.outside.map(([x, specifiedOuter]) => {
    let inner = Infinity, outer = 0, vertices = 0;
    for (let i = 0; i < linerMesh.vertProperties.length; i += linerMesh.numProp) {
      if (Math.abs(linerMesh.vertProperties[i] - x) > .001) continue;
      const radius = Math.hypot(linerMesh.vertProperties[i + 1], linerMesh.vertProperties[i + 2]);
      inner = Math.min(inner, radius); outer = Math.max(outer, radius); vertices++;
    }
    return { x, specifiedInnerRadiusMm: specifiedOuter - linerLayout.wall, specifiedOuterRadiusMm: specifiedOuter,
      measuredInnerRadiusMm: inner, measuredOuterRadiusMm: outer, measuredVertices: vertices };
  });
  const motorEnvelope = probeCylinder([P.motor.front - .1, 0, 0], [P.motor.rear + .1, 0, 0], P.motor.radius + P.clearance, 128);
  const motorEnvelopeObstruction = intersectionVolume(motorEnvelope, liner.solid);
  const straightBore = probeCylinder([I.front - .1, 0, 0], [I.contractionStart, 0, 0], I.inner - .1, 128);
  const straightBoreObstruction = intersectionVolume(straightBore, liner.solid);
  const rearOpening = probeCylinder([I.rear - .5, 0, 0], [I.rear + .5, 0, 0], rearInner - .1, 128);
  const rearOpeningObstruction = intersectionVolume(rearOpening, liner.solid);
  const curvedStations = linerStations.filter(station => station.x >= I.contractionStart);
  const averageSlope = I.radialContraction / (I.rear - I.contractionStart);
  const slopes = curvedStations.slice(1).map((station, i) => (curvedStations[i].measuredOuterRadiusMm - station.measuredOuterRadiusMm)
    / (station.x - curvedStations[i].x));
  const annularProbe = probeCylinder([I.front - .1, 0, 0], [I.rear + .1, 0, 0], P.motorHousing.inner - .1, 128)
    .subtract(probeCylinder([I.front - .2, 0, 0], [I.rear + .2, 0, 0], I.outer + .1, 128));
  const annularObstructions = parts.map(part => ({ id: part.id, volumeMm3: intersectionVolume(annularProbe, part.solid) }));
  result.intakeInnerShell = {
    forwardInnerDiameterMm: I.inner * 2, forwardOuterDiameterMm: I.outer * 2,
    rearInnerDiameterMm: rearInner * 2, rearOuterDiameterMm: rearOuter * 2,
    contractionStartMm: I.contractionStart, radialContractionMm: I.radialContraction,
    curve: 'sampled smooth cubic contraction, independently checked for monotonicity and eased end slopes',
    firstSlopeRelativeToAverage: slopes[0] / averageSlope, lastSlopeRelativeToAverage: slopes.at(-1) / averageSlope,
    stations: linerStations,
    motorRadialClearanceMm: linerLayout.minimumMotorEnvelopeClearance,
    motorEnvelopeExpansionMm: P.clearance, motorEnvelopeObstructionMm3: motorEnvelopeObstruction,
    axialGapAfterMotorMm: I.contractionStart - P.motor.rear,
    straightBoreObstructionMm3: straightBoreObstruction, rearOpeningObstructionMm3: rearOpeningObstruction,
    frontMm: liner.bounds.min[0], rearMm: liner.bounds.max[0], openBoreObstructionMm3: linerBoreObstruction,
  };
  result.intakeAnnulus = {
    radialGapMm: P.motorHousing.inner - I.outer,
    radialGapReference: 'minimum nominal gap in the forward constant-radius section',
    rearRadialGapMm: P.motorHousing.inner - rearOuter,
    nominalAreaMm2: Math.PI * (P.motorHousing.inner ** 2 - I.outer ** 2),
    rearNominalAreaMm2: Math.PI * (P.motorHousing.inner ** 2 - rearOuter ** 2),
    flowProbeRadiusFromAxisMm: annulusRadius,
    maximumObstructionVolumeMm3: Math.max(...annularObstructions.map(item => item.volumeMm3)),
    obstructions: annularObstructions.filter(item => item.volumeMm3 > .001),
  };
  if (linerStations.some(station => !station.measuredVertices
    || Math.abs(station.measuredInnerRadiusMm - station.specifiedInnerRadiusMm) > .001
    || Math.abs(station.measuredOuterRadiusMm - station.specifiedOuterRadiusMm) > .001)
    || Math.abs(liner.bounds.min[0] - I.front) > .001 || Math.abs(liner.bounds.max[0] - I.rear) > .001
    || linerBoreObstruction > .001 || straightBoreObstruction > .001 || rearOpeningObstruction > .001) {
    failures.push('Inner liner straight section, curved tail or open ends do not match parameters');
  }
  if (slopes.some(slope => !Number.isFinite(slope) || slope <= 0)
    || slopes[0] / averageSlope > .1 || slopes.at(-1) / averageSlope > .1
    || Math.max(...slopes) / averageSlope < 1.2) failures.push('Liner contraction lacks a continuous eased inward curve');
  if (motorEnvelopeObstruction > .001 || linerLayout.minimumMotorEnvelopeClearance < P.clearance
    || I.contractionStart - P.motor.rear < P.clearance) failures.push('Contracting liner obstructs the main motor envelope');
  if (result.intakeAnnulus.obstructions.length) failures.push('Double-wall intake annulus is obstructed');
  boreProbe.delete(); linerBore.delete(); motorEnvelope.delete(); straightBore.delete(); rearOpening.delete(); annularProbe.delete(); passage.delete();

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
