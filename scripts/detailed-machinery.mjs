import { buildTwoStageCompressor } from './two-stage-compressor.mjs';
import { getIntakeLinerLayout } from './intake-liner-layout.mjs';

/** Physical chord stations, with the angle measured from the engine axis. */
export function fanBladeSections(F) {
  const smooth = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
  return Array.from({ length: 29 }, (_, k) => {
    const s = k / 28;
    const chord = s <= .45
      ? lerp(F.hubRadius * .60, F.radius * .273, smooth(s / .45))
      : lerp(F.radius * .273, F.radius * .285, smooth((s - .45) / .55));
    const angleToAxisDeg = lerp(25, F.tipAngleToAxisDeg, smooth(s));
    // Move the root slightly aft so its longer axial projection remains behind
    // the conical spinner. No airfoil coordinate is flattened by an axial clamp.
    const centreX = F.x + F.hubRadius * .1 * (1 - s) ** 2;
    const radius = Math.min(lerp(F.hubRadius * .78, F.radius, s),
      Math.sqrt((F.radius - .25) ** 2 - (.56 * chord) ** 2));
    return { span: s, chord, angleToAxisDeg, centreX, radius, sweep: .035 + .23 * s * s };
  });
}

/**
 * Detailed, watertight front machinery. All installation envelopes come from P.
 * Blade sections, bolts, cooling ribs and the centrifugal impeller are schematic
 * geometry, not a claimed aerodynamic or manufacturing design.
 *
 * This module does not write files or initialise Manifold. The caller supplies
 * the same modelling primitives and add() used by the complete assembly.
 */
export function buildDetailedMachinery({ M, CS, P, C, union, cylinder, revolved, sector, add }) {
  const tau = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const axisCylinder = (a, b, r, n = 96) => cylinder([a, 0, 0], [b, 0, 0], r, r, n);
  const metal = { metallic: .83, roughness: .27, finish: 'machined' };
  const satin = { metallic: .62, roughness: .34, finish: 'cast-metal' };
  const paint = { metallic: .35, roughness: .29, finish: 'powder-coat' };
  const steel = '#aebcc7', darkSteel = '#526673', paleSteel = '#d2dce2';

  // Profiles run from upstream to downstream. Cross-sections are closed solids
  // or closed annular walls, so both the inner and outer surface really exist.
  const solidLathe = profile => new CS([[
    ...profile.map(([x, r]) => [r, x]),
    [0, profile.at(-1)[0]], [0, profile[0][0]],
  ]]).revolve(128).rotate([0, 90, 0]);
  const hollowLathe = (outside, inside) => new CS([[
    ...outside.map(([x, r]) => [r, x]),
    ...inside.toReversed().map(([x, r]) => [r, x]),
  ]]).revolve(128).rotate([0, 90, 0]);

  function closedMesh(vertices, triangles) {
    // A signed-volume check makes the handedness explicit after the axis map.
    let sixVolume = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3;
      sixVolume += vertices[a] * (vertices[b + 1] * vertices[c + 2] - vertices[b + 2] * vertices[c + 1])
        + vertices[a + 1] * (vertices[b + 2] * vertices[c] - vertices[b] * vertices[c + 2])
        + vertices[a + 2] * (vertices[b] * vertices[c + 1] - vertices[b + 1] * vertices[c]);
    }
    if (sixVolume < 0) for (let i = 0; i < triangles.length; i += 3) {
      [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]];
    }
    return M.ofMesh({ numProp: 3, vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(triangles) });
  }

  /** A lofted airfoil with rounded leading edge, closed trailing edge, spanwise
   * twist and aft sweep. This is a thick solid, not a twisted rectangular plate.
   */
  function fanBlade() {
    const F = P.fan, spanSegments = 28, chordSegments = 28;
    const perimeter = [];
    for (let j = 0; j <= chordSegments; j++) perimeter.push([(1 - Math.cos(j * Math.PI / chordSegments)) / 2, 1]);
    for (let j = chordSegments - 1; j > 0; j--) perimeter.push([(1 - Math.cos(j * Math.PI / chordSegments)) / 2, -1]);
    const vertices = [], triangles = [], ringSize = perimeter.length;
    for (const section of fanBladeSections(F)) {
      // The visible midspan and tip have similar chord. Only the buried/root
      // region narrows enough to keep neighbouring blades separate.
      const { chord, centreX, radius: radial, sweep } = section;
      const beta = (90 - section.angleToAxisDeg) * Math.PI / 180;
      // Tangential section coordinates increase the swept radius. The centre
      // is pulled inward near the tip so every vertex stays within F.radius.
      for (const [u, side] of perimeter) {
        const q = chord * (u - .48);
        const thickness = 5 * .105 * chord * Math.max(0,
          .2969 * Math.sqrt(u) - .1260 * u - .3516 * u ** 2 + .2843 * u ** 3 - .1036 * u ** 4);
        const normal = side * thickness + .018 * chord * Math.sin(Math.PI * u);
        const tangential = q * Math.cos(beta) - normal * Math.sin(beta);
        const axial = q * Math.sin(beta) + normal * Math.cos(beta);
        vertices.push(centreX + axial, radial * Math.cos(sweep) - tangential * Math.sin(sweep),
          radial * Math.sin(sweep) + tangential * Math.cos(sweep));
      }
    }
    for (let k = 0; k < spanSegments; k++) for (let j = 0; j < ringSize; j++) {
      const a = k * ringSize + j, b = k * ringSize + (j + 1) % ringSize;
      const c = (k + 1) * ringSize + j, d = (k + 1) * ringSize + (j + 1) % ringSize;
      triangles.push(a, c, b, b, c, d);
    }
    for (const k of [0, spanSegments]) {
      const centre = [0, 0, 0];
      for (let j = 0; j < ringSize; j++) for (let a = 0; a < 3; a++) centre[a] += vertices[(k * ringSize + j) * 3 + a] / ringSize;
      const ci = vertices.length / 3;
      vertices.push(...centre);
      for (let j = 0; j < ringSize; j++) {
        const a = k * ringSize + j, b = k * ringSize + (j + 1) % ringSize;
        triangles.push(...(k === 0 ? [ci, a, b] : [ci, b, a]));
      }
    }
    return closedMesh(vertices, triangles);
  }

  // Main fan: swept airfoils with a real root buried in the hub.
  const F = P.fan, fanFront = F.front ?? F.x - (P.motorHousing.front - F.x);
  const fanRear = F.rear ?? P.motorHousing.front, fanLength = fanRear - fanFront;
  const hubFront = F.x - fanLength * .125, hubRear = fanRear - fanLength * .075;
  const blade = fanBlade();
  const fanPieces = [axisCylinder(hubFront, hubRear, F.hubRadius),
    solidLathe([[hubRear, F.hubRadius], [fanRear, F.hubRadius * .46]])];
  const fanBladeCount = F.blades;
  for (let i = 0; i < fanBladeCount; i++) fanPieces.push(blade.rotate([i * 360 / fanBladeCount, 0, 0]));
  const grooveFront = hubRear - fanLength * .045, grooveRear = hubRear - fanLength * .025;
  const hubGroove = axisCylinder(grooveFront, grooveRear, F.hubRadius + .2)
    .subtract(axisCylinder(grooveFront - .1, grooveRear + .1, F.hubRadius * .978));
  const fanSolid = union(fanPieces).subtract(hubGroove);
  add('fan', `${fanBladeCount}叶后掠扭转风扇 · 叶根25°至叶尖${F.tipAngleToAxisDeg}°`, 'front', steel, fanSolid,
    { ...metal, rotor: 'main', bladeCount: fanBladeCount, rootChordAngleToAxis: 25, tipChordAngleToAxis: F.tipAngleToAxisDeg });

  const nose = [], spinnerFront = F.spinnerFront ?? fanFront;
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    nose.push([lerp(spinnerFront, hubFront, t), Math.max(.35, F.hubRadius * t)]);
  }
  add('fan-spinner', '锥形金属整流罩', 'front', paleSteel, solidLathe(nose), metal);
  // This recessed annular groove is cut into the hub itself, never laid on top
  // of another part. The separate spinner meets it at the shared end plane.

  // Downstream fixed vanes span only the passage outside the grey inner casing.
  // Their small integral feet stop short of both shells; no blue intake wall is
  // crossed and no unapproved socket is cut into the shared casing generator.
  const statorFront = fanRear + 25, statorRear = fanRear + 75;
  const os = P.outerShell, ins = P.innerShell;
  const outerBore = x => {
    const step = (os.waistStart - os.taperStart) / 64;
    const station = Math.max(0, Math.min(63, Math.floor((x - os.taperStart) / step)));
    const a = os.taperStart + station * step, b = a + step;
    const radius = q => os.radius + (os.waistRadius - os.radius) * smooth((q - os.taperStart) / (os.waistStart - os.taperStart));
    return lerp(radius(a), radius(b), (x - a) / step) - os.wall;
  };
  const statorRoot = ins.inletRadius + .06;
  const statorTip = x => outerBore(x) * Math.cos(Math.PI / 144) - .12;
  const statorVertices = [], statorTriangles = [], statorPerimeter = [];
  const statorSpans = 12, statorChords = 22;
  for (let j = 0; j <= statorChords; j++) statorPerimeter.push([(1 - Math.cos(j * Math.PI / statorChords)) / 2, 1]);
  for (let j = statorChords - 1; j > 0; j--) statorPerimeter.push([(1 - Math.cos(j * Math.PI / statorChords)) / 2, -1]);
  const statorRing = statorPerimeter.length;
  for (let k = 0; k <= statorSpans; k++) {
    const span = k / statorSpans;
    for (const [u, side] of statorPerimeter) {
      const x = lerp(statorFront, statorRear, u), r = lerp(statorRoot, statorTip(x), span);
      const thickness = 5 * .09 * (statorRear - statorFront) * Math.max(0,
        .2969 * Math.sqrt(u) - .1260 * u - .3516 * u ** 2 + .2843 * u ** 3 - .1036 * u ** 4);
      const tangent = lerp(8, 4, span) * (1 - u) + 4 * Math.sin(Math.PI * u) + side * thickness;
      statorVertices.push(x, Math.sqrt(r * r - tangent * tangent), tangent);
    }
  }
  for (let k = 0; k < statorSpans; k++) for (let j = 0; j < statorRing; j++) {
    const a = k * statorRing + j, b = k * statorRing + (j + 1) % statorRing;
    const c = (k + 1) * statorRing + j, d = (k + 1) * statorRing + (j + 1) % statorRing;
    statorTriangles.push(a, c, b, b, c, d);
  }
  for (const k of [0, statorSpans]) {
    const center = [0, 0, 0];
    for (let j = 0; j < statorRing; j++) for (let a = 0; a < 3; a++) center[a] += statorVertices[(k * statorRing + j) * 3 + a] / statorRing;
    const ci = statorVertices.length / 3; statorVertices.push(...center);
    for (let j = 0; j < statorRing; j++) {
      const a = k * statorRing + j, b = k * statorRing + (j + 1) % statorRing;
      statorTriangles.push(...(k === 0 ? [ci, a, b] : [ci, b, a]));
    }
  }
  const footFront = statorFront + 7, footRear = statorRear - 7;
  const tipFootProfile = Array.from({ length: 19 }, (_, i) => {
    const x = lerp(footFront, footRear, i / 18); return [x, statorTip(x)];
  });
  const statorFoot = sector(footFront, footRear, statorRoot, statorRoot + 2.8, -1.2, 3.3);
  const statorTipFoot = hollowLathe(tipFootProfile, tipFootProfile.map(([x, r]) => [x, r - 2.8]))
    .intersect(sector(footFront, footRear, 1, os.radius, -.6, 1.9));
  const oneStator = union([closedMesh(statorVertices, statorTriangles), statorFoot, statorTipFoot]);
  add('fan-stators', '十八叶后静叶 · 内外端安装脚', 'front', steel,
    union(Array.from({ length: 18 }, (_, i) => oneStator.rotate([i * 20, 0, 0]))),
    { ...metal, clip: true, stationary: true, bladeCount: 18, components: 18 });

  const motor = P.motor, motorLength = motor.rear - motor.front;
  const shaftRadius = motor.radius * .12;
  const capLength = motorLength * .11;
  const bodyFront = motor.front + capLength, bodyRear = motor.rear - capLength;
  const ribOuter = Math.min(P.motorHousing.inner - P.clearance * 4, motor.radius);
  const motorBodyRadius = Math.min(motor.radius * .96, ribOuter - 1);
  const bodyPieces = [axisCylinder(bodyFront, bodyRear, motorBodyRadius), axisCylinder(fanRear, motor.rear, shaftRadius, 64)];
  for (let i = 0; i < 28; i++) {
    bodyPieces.push(sector(motor.front + motorLength * .20, motor.rear - motorLength * .20,
      motorBodyRadius - .7, ribOuter, i * 360 / 28 - .9, i * 360 / 28 + .9));
  }
  add('main-motor', '主电机 · 纵向散热筋与传动轴', 'front', C.motor, union(bodyPieces), paint);

  function motorCap(frontSide) {
    const lo = frontSide ? motor.front : bodyRear;
    const hi = frontSide ? bodyFront : motor.rear;
    const boltHeight = Math.min(3.2, capLength * .18);
    const start = frontSide ? lo + boltHeight : lo;
    const end = frontSide ? hi : hi - boltHeight;
    const radial = motor.radius;
    const cap = hollowLathe([
      [start, radial * .95], [start + (end - start) * .20, radial],
      [end - (end - start) * .20, radial], [end, radial * .99],
    ], [[start, shaftRadius + .8], [end, shaftRadius + .8]]);
    const heads = [], sockets = [];
    const headRadius = motor.radius * .034, boltRing = motor.radius * .80;
    for (let i = 0; i < 12; i++) {
      const t = i * tau / 12, y = boltRing * Math.cos(t), z = boltRing * Math.sin(t);
      const a = frontSide ? lo : end - .05, b = frontSide ? start + .05 : hi;
      heads.push(cylinder([a, y, z], [b, y, z], headRadius, headRadius, 12));
      sockets.push(frontSide
        ? cylinder([lo - .05, y, z], [lo + boltHeight * .62, y, z], headRadius * .48, headRadius * .48, 6)
        : cylinder([hi - boltHeight * .62, y, z], [hi + .05, y, z], headRadius * .48, headRadius * .48, 6));
    }
    return union([cap, ...heads]).subtract(union(sockets));
  }
  add('motor-front-cap', '主电机前端盖 · 十二枚内六角紧固件', 'front', paleSteel, motorCap(true), metal);
  add('motor-rear-cap', '主电机后端盖 · 十二枚内六角紧固件', 'front', steel, motorCap(false), metal);

  // A shaft collar outside the motor cap, with a true clearance bore. Its rear
  // face meets the cap; the shaft itself remains part of main-motor.
  const collarStart = motor.front - (motor.front - fanRear) * .48;
  const collar = hollowLathe([[collarStart, shaftRadius * 1.65], [motor.front, shaftRadius * 1.65]],
    [[collarStart, shaftRadius + .65], [motor.front, shaftRadius + .65]]);
  add('motor-shaft-collar', '主轴定位套', 'front', darkSteel, collar, metal);

  // Open blue intake sleeve: constant functional bore and thin end lands.
  // The smooth wall reads as a duct, and no disk closes either end.
  const H = P.motorHousing, housingLength = H.rear - H.front;
  const shellLand = Math.min((H.outer - H.inner) * .32, 2.4);
  const bodyRadius = H.outer - shellLand, landLength = housingLength * .055;
  const housingOuter = [[H.front, H.outer], [H.front + landLength, H.outer],
    [H.front + landLength * 1.35, bodyRadius], [H.rear - landLength * 1.35, bodyRadius],
    [H.rear - landLength, H.outer], [H.rear, H.outer]];
  const housingWall = hollowLathe(housingOuter, [[H.front, H.inner], [H.rear, H.inner]]);
  const housingHoles = [];
  const intakeScrews = [];
  for (let i = 0; i < 16; i++) {
    const t = (i + .5) * tau / 16, r = (H.inner + H.outer) / 2;
    const point = x => [x, r * Math.cos(t), r * Math.sin(t)];
    const holeRadius = (H.outer - H.inner) * .19;
    housingHoles.push(cylinder(point(H.front - .05), point(H.front + 2), holeRadius, holeRadius, 24));
    intakeScrews.push(cylinder(point(H.front + .15), point(H.front + 2), holeRadius - .22, holeRadius - .22, 24)
      .subtract(cylinder(point(H.front + .1), point(H.front + .8), holeRadius * .42, holeRadius * .42, 6)));
  }
  const housingSeams = [H.front + landLength * 2, H.rear - landLength * 2].map(x =>
    hollowLathe([[x - .22, bodyRadius + .1], [x + .22, bodyRadius + .1]],
      [[x - .22, bodyRadius - .55], [x + .22, bodyRadius - .55]]));
  add('motor-housing', '蓝色中空进气筒 · 薄壁口沿与端部螺孔', 'intakeOuter', C.intakeOuter ?? '#587c8e',
    housingWall.subtract(union([...housingHoles, ...housingSeams])),
    { metallic: .68, roughness: .3, finish: 'satin-blue-metal', clip: true });
  add('intake-fasteners', '引气外壳口沿沉头紧固件', 'intakeOuter', darkSteel, union(intakeScrews),
    { ...metal, clip: true });

  // The motor bay remains open at both ends. After the unchanged motor envelope,
  // the liner contracts with a continuous tangent into a smaller open rear lip.
  // This widens the annular intake passage without introducing any closing disk.
  const I = P.intakeLiner;
  let intakeLiner;
  if (I) {
    const layout = getIntakeLinerLayout(P);
    const liner = hollowLathe(layout.outside, layout.inside);
    intakeLiner = layout.verification;
    add('intake-inner-shell', '引气内壳 · 圆滑内收开口尾缘', 'intakeInner', C.intakeInner ?? '#355565', liner,
      { metallic: .7, roughness: .32, finish: 'satin-blue-metal', clip: true,
        rearOpen: true, radialContraction: I.radialContraction });
  }

  const compressor = buildTwoStageCompressor({ M, CS, P, C, union, cylinder, axisCylinder, solidLathe, hollowLathe, add });
  void revolved;
  return { fanFront, fanRear, spinnerFront, spinnerRear: hubFront, spinnerLength: hubFront-spinnerFront, mainFanRadius: F.radius, fanBladeCount,
    fanStatorCount: 18, statorFront, statorRear, intakeLiner, ...compressor };
}
