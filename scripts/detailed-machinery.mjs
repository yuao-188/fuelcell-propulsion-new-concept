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
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
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
    const fanFront = F.front ?? (F.x - (P.motorHousing.front - F.x));
    const fanRear = F.rear ?? P.motorHousing.front;
    const halfAxial = Math.min(F.x - fanFront, fanRear - F.x) * .86;
    const rootRadius = F.hubRadius * .78;
    for (let k = 0; k <= spanSegments; k++) {
      const s = k / spanSegments;
      const chord = s <= .58
        ? lerp(F.hubRadius * .50, F.radius * .38, smooth(s / .58))
        : lerp(F.radius * .38, F.radius * .24, smooth((s - .58) / .42));
      const beta = lerp(38, 16, s) * Math.PI / 180;
      const sweep = .035 + .23 * s * s;
      // Tangential section coordinates increase the swept radius. The centre
      // is pulled inward near the tip so every vertex stays within F.radius.
      const radial = Math.min(lerp(rootRadius, F.radius, s),
        Math.sqrt((F.radius - .25) ** 2 - (.56 * chord) ** 2));
      for (const [u, side] of perimeter) {
        const q = chord * (u - .48);
        const thickness = 5 * .105 * chord * Math.max(0,
          .2969 * Math.sqrt(u) - .1260 * u - .3516 * u ** 2 + .2843 * u ** 3 - .1036 * u ** 4);
        const normal = side * thickness + .018 * chord * Math.sin(Math.PI * u);
        const tangential = q * Math.cos(beta) - normal * Math.sin(beta);
        const axial = clamp(q * Math.sin(beta) + normal * Math.cos(beta), -halfAxial, halfAxial);
        vertices.push(F.x + axial, radial * Math.cos(sweep) - tangential * Math.sin(sweep),
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

  // Main fan: eight broad swept airfoils with a real root buried in the hub.
  const F = P.fan, fanFront = F.front ?? F.x - (P.motorHousing.front - F.x);
  const fanRear = F.rear ?? P.motorHousing.front, fanLength = fanRear - fanFront;
  const hubFront = F.x - fanLength * .125, hubRear = fanRear - fanLength * .075;
  const blade = fanBlade();
  const fanPieces = [axisCylinder(hubFront, hubRear, F.hubRadius),
    solidLathe([[hubRear, F.hubRadius], [fanRear, F.hubRadius * .46]])];
  for (let i = 0; i < F.blades; i++) fanPieces.push(blade.rotate([i * 360 / F.blades, 0, 0]));
  const grooveFront = hubRear - fanLength * .045, grooveRear = hubRear - fanLength * .025;
  const hubGroove = axisCylinder(grooveFront, grooveRear, F.hubRadius + .2)
    .subtract(axisCylinder(grooveFront - .1, grooveRear + .1, F.hubRadius * .978));
  const fanSolid = union(fanPieces).subtract(hubGroove);
  add('fan', '宽弦后掠扭转风扇 · 实体翼型与轮毂', 'front', steel, fanSolid, { ...metal, rotor: 'main' });

  const nose = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    nose.push([lerp(fanFront, hubFront, t), Math.max(.35, F.hubRadius * Math.sqrt(1 - (1 - t) ** 2))]);
  }
  add('fan-spinner', '金属整流罩', 'front', paleSteel, solidLathe(nose), metal);
  // This recessed annular groove is cut into the hub itself, never laid on top
  // of another part. The separate spinner meets it at the shared end plane.

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

  // The motor bay remains open at both ends. Its independent liner creates a
  // real annular intake passage with the outer sleeve, without a solid tail cap.
  const I = P.intakeLiner;
  if (I) {
    const liner = hollowLathe([[I.front, I.outer], [I.rear, I.outer]], [[I.front, I.inner], [I.rear, I.inner]]);
    add('intake-inner-shell', '引气内壳 · 两端开口电机套筒', 'intakeInner', C.intakeInner ?? '#355565', liner,
      { metallic: .7, roughness: .32, finish: 'satin-blue-metal', clip: true });
  }

  // Centrifugal compressor. The rotor has an axial inlet eye, swept radial
  // vanes and a backplate. A separate motor and shaft drive the same connected
  // rotor; there is no extension of the propulsion-motor shaft into this unit.
  const K = P.compressor;
  // A short impeller chamber leaves a visibly long aft collector within the
  // unchanged installation length. K.rear still sets the outlet-neck datum.
  const workingRear = K.front + (K.outlet - K.front) * .375;
  const chamberLength = workingRear - K.front;
  const plateX = K.front + chamberLength * .76, plateThickness = chamberLength * .065;
  const impellerRadius = K.inner * .88, eyeRadius = K.inner * .255;
  const driveRadius = K.inner * .20, driveFront = K.front + chamberLength * .09;
  const driveRear = K.front + chamberLength * .32, smallShaft = K.inner * .075;
  const rotorPieces = [axisCylinder(driveFront, driveRear, driveRadius, 64),
    axisCylinder(driveRear, plateX + plateThickness, smallShaft, 48),
    axisCylinder(plateX, plateX + plateThickness, impellerRadius, 128),
    solidLathe([[K.front + chamberLength * .40, smallShaft * 1.15],
      [K.front + chamberLength * .56, eyeRadius * .74], [plateX, eyeRadius]])];

  function sweptRibbon(inner, outer, baseAngle, sweep, width, start, end, variableHeight = false) {
    const profile = [], steps = 28;
    for (const side of [1, -1]) for (let j = 0; j <= steps; j++) {
      const t = side === 1 ? j / steps : 1 - j / steps;
      const r = lerp(inner, outer, t), angle = baseAngle + sweep * t * t + side * width / (2 * r);
      profile.push([-r * Math.sin(angle), r * Math.cos(angle)]);
    }
    let signedArea = 0;
    for (let i = 0; i < profile.length; i++) {
      const a = profile[i], b = profile[(i + 1) % profile.length];
      signedArea += a[0] * b[1] - a[1] * b[0];
    }
    if (signedArea < 0) profile.reverse();
    let vane = new CS([profile]).extrude(1).rotate([0, 90, 0]);
    if (variableHeight) {
      vane = vane.warp(v => {
        const t = clamp((Math.hypot(v[1], v[2]) - inner) / (outer - inner), 0, 1);
        const height = lerp(chamberLength * .30, chamberLength * .13, t);
        v[0] = plateX - height * (1 - v[0]) + .25 * v[0];
      });
    } else vane = vane.scale([end - start, 1, 1]).translate([start, 0, 0]);
    return vane;
  }
  for (let i = 0; i < 12; i++) {
    rotorPieces.push(sweptRibbon(eyeRadius * .94, impellerRadius - 1.2,
      i * tau / 12, -.52, K.inner * .020, 0, 0, true));
  }
  add('compressor-drive', '独立驱动离心叶轮 · 后弯叶片与背盘', 'front', steel, union(rotorPieces),
    { ...metal, rotor: 'compressor' });

  const caseRadius = K.outer - Math.min(2.0, (K.outer - K.inner) * .25);
  const casingOutside = [[K.front, K.outer], [K.front + chamberLength * .08, K.outer],
    [K.front + chamberLength * .12, caseRadius], [workingRear - chamberLength * .14, caseRadius],
    [workingRear - chamberLength * .08, K.outer], [workingRear, K.outer]];
  const casingInside = [[K.front, K.inner], [workingRear, K.inner]];
  // The last half of the outlet section is a narrow straight neck. This leaves
  // the specified first-stack return pipes clear of the converging casing.
  const neckStart = K.outlet - (K.outletNeckLength ?? (K.outlet - K.rear) * .5);
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, x = lerp(workingRear, neckStart, t);
    casingOutside.push([x, lerp(K.outer, P.air.outer, smooth(t))]);
    casingInside.push([x, lerp(K.inner, P.air.inner, smooth(t))]);
  }
  casingOutside.push([K.outlet, P.air.outer]);
  casingInside.push([K.outlet, P.air.inner]);
  const casingParts = [hollowLathe(casingOutside, casingInside)];
  // Stationary diffuser vanes are fused only to their own casing. Their inner
  // tips have a positive radial gap to the rotating impeller/backplate.
  for (let i = 0; i < 18; i++) casingParts.push(sweptRibbon(impellerRadius + 3.2, K.inner + .5,
    (i + .35) * tau / 18, .13, K.inner * .014,
    plateX - chamberLength * .13, plateX + plateThickness + chamberLength * .025));
  // Two machined mounting bands occupy the existing casing envelope. Their
  // mating grooves include a small assembly gap so GLB quantisation does not
  // turn coincident surfaces into overlapping solids or flickering surfaces.
  const flangeDepth = Math.min(3, chamberLength * .06);
  const flangeInner = K.inner + 1.2, flangeGap = .04;
  const flangeLocations = [K.front + 1, workingRear - 1 - flangeDepth];
  const flangeParts = [], flangeSlots = [], compressorScrews = [];
  for (const [i, x] of flangeLocations.entries()) {
    const outerProfile = [[x, K.outer - .7], [x + .45, K.outer],
      [x + flangeDepth - .45, K.outer], [x + flangeDepth, K.outer - .7]];
    const flange = hollowLathe(outerProfile, [[x, flangeInner], [x + flangeDepth, flangeInner]]);
    flangeSlots.push(hollowLathe([[x - flangeGap, K.outer + flangeGap], [x + flangeDepth + flangeGap, K.outer + flangeGap]],
      [[x - flangeGap, flangeInner - flangeGap], [x + flangeDepth + flangeGap, flangeInner - flangeGap]]));
    const headVoids = [], heads = [];
    for (let j = 0; j < 12; j++) {
      const angle = (j + .5) * tau / 12;
      const point = radius => [x + flangeDepth / 2, radius * Math.cos(angle), radius * Math.sin(angle)];
      const head = cylinder(point(K.outer - 2.6), point(K.outer - .2), .95, .95, 24)
        .subtract(cylinder(point(K.outer - .85), point(K.outer), .42, .42, 6));
      heads.push(head);
      headVoids.push(cylinder(point(K.outer - 2.65), point(K.outer + .05), 1.02, 1.02, 24));
    }
    flangeParts.push(flange.subtract(union(headVoids)));
    compressorScrews.push(...heads);
    add(i === 0 ? 'compressor-front-flange' : 'compressor-rear-flange',
      i === 0 ? '增压机前部金属法兰' : '增压机后部金属法兰', 'compressorCase', paleSteel,
      flangeParts.at(-1), { ...metal, clip: true });
  }
  add('compressor-casing', '香槟金离心增压机 · 分段机匣与渐缩集气壳', 'compressorCase', C.compressorCase ?? '#b6a77c',
    union(casingParts).subtract(union(flangeSlots)),
    { metallic: .64, roughness: .31, finish: 'satin-champagne-metal', clip: true });
  add('compressor-fasteners', '增压机法兰沉头紧固件', 'compressorCase', darkSteel, union(compressorScrews),
    { ...metal, clip: true });

  // This stationary cover separates the inlet plenum from the impeller's
  // peripheral outlet. Its inner edge is the inlet eye; its downstream face
  // follows the blade inlet surface with a positive axial running clearance.
  // The outer edge meets the casing bore at the same revolved bearing surface,
  // so there is no open annular bypass around the impeller. The diffuser and
  // rear collector remain open beyond the backplate's outer radius.
  const runningClearance = Math.max(.65, P.clearance);
  const shroudThickness = Math.min(3, chamberLength * .075);
  const bladeInnerRadius = eyeRadius * .94;
  const bladeOuterRadius = impellerRadius - 1.2;
  const eyeFaceX = plateX - chamberLength * .30 - runningClearance;
  const rimFaceX = plateX - chamberLength * .13 - runningClearance;
  const shroudProfile = [
    [bladeInnerRadius, eyeFaceX],
    [bladeOuterRadius, rimFaceX],
    [K.inner, rimFaceX],
    [K.inner, rimFaceX - shroudThickness],
    [bladeInnerRadius + shroudThickness * 2, eyeFaceX - shroudThickness],
  ];
  const shroud = new CS([shroudProfile.reverse()]).revolve(128).rotate([0, 90, 0]);
  add('compressor-shroud', '离心叶轮静止导流罩 · 入口眼与隔流壁', 'front', paleSteel,
    shroud, { ...metal, clip: true });

  // Kept in the public signature for compatibility with the common generator.
  void revolved;
  return { fanFront, fanRear, mainFanRadius: F.radius, impellerRadius, workingRear, neckStart,
    fanBladeCount: F.blades, compressorBladeCount: 12 };
}
