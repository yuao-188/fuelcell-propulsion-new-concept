/** Two independently driven centrifugal stages. All drive sizes are schematic. */
export function buildTwoStageCompressor({ M, CS, P, C, union, cylinder, axisCylinder, solidLathe, hollowLathe, add }) {
  const tau = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), smooth = t => t * t * (3 - 2 * t);
  const metal = { metallic: .83, roughness: .27, finish: 'machined' };
  const steel = '#dce6ed', darkSteel = '#526673', paleSteel = '#b2bec6', vaneSteel = '#718794';
  const K = P.compressor, axialScale = (K.outlet - K.front) / 210;
  const ax = nominal => K.front + (nominal - 480) * axialScale;
  const rr = nominal => nominal * K.inner / 165;
  const neckStart = K.outlet - (K.outletNeckLength ?? (K.outlet - K.rear) * .5);
  const knots = [[K.front, K.inner], [ax(555), K.inner], [ax(590), rr(145)],
    [ax(622), rr(135)], [ax(650), rr(65)], [neckStart, P.air.inner], [K.outlet, P.air.inner]];
  const innerAt = x => {
    if (x >= K.outlet) return P.air.inner;
    const i = Math.max(1, knots.findIndex(p => p[0] >= x));
    const a = knots[i - 1], b = knots[i];
    return lerp(a[1], b[1], smooth(clamp((x - a[0]) / (b[0] - a[0]), 0, 1)));
  };
  const casingInside = [knots[0]];
  for (let i = 1; i < knots.length; i++) for (let j = 1; j <= 20; j++) {
    const x = lerp(knots[i - 1][0], knots[i][0], j / 20);
    casingInside.push([x, innerAt(x)]);
  }
  const casingOutside = casingInside.map(([x, r]) => [x, r + lerp(P.air.outer - P.air.inner,
    K.outer - K.inner, clamp((r - P.air.inner) / (K.inner - P.air.inner), 0, 1))]);
  const caseLumen = solidLathe(casingInside);
  const caseFree = solidLathe(casingInside.map(([x, r]) => [x, r - .08]));
  const casingWall = hollowLathe(casingOutside, casingInside);

  function radialVane(inner, outer, angle, sweep, width, start, end, heightAt, rootExtensionInner = inner) {
    const profile = [], steps = 28;
    const radii = [];
    if (rootExtensionInner < inner) for (let j = 0; j < 8; j++) radii.push(lerp(rootExtensionInner, inner, j / 8));
    radii.push(...Array.from({ length: steps + 1 }, (_, j) => lerp(inner, outer, j / steps)));
    for (const side of [1, -1]) for (const r of side === 1 ? radii : radii.toReversed()) {
      // Below the original working inner radius, continue its radial tangent
      // into the hub. The original swept blade profile is unchanged outside it.
      const t = Math.max(0, (r - inner) / (outer - inner));
      const a = angle + sweep * t * t + side * width / (2 * r);
      profile.push([-r * Math.sin(a), r * Math.cos(a)]);
    }
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const a = profile[i], b = profile[(i + 1) % profile.length]; area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) profile.reverse();
    let solid = new CS([profile]).extrude(1).rotate([0, 90, 0]);
    if (heightAt) solid = solid.warp(v => {
      const t = clamp((Math.hypot(v[1], v[2]) - inner) / (outer - inner), 0, 1);
      v[0] = end - heightAt(t) * (1 - v[0]) + .15 * v[0];
    });
    else solid = solid.scale([end - start, 1, 1]).translate([start, 0, 0]);
    return solid;
  }
  const [firstStage, secondStage] = K.stages;
  const stages = [
    { number: 1, plate: ax(544), back: ax(549), radius: rr(firstStage.backplateRadius), eye: rr(41),
      bladeInner: rr(39), bladeOuter: rr(firstStage.bladeOuter), heightIn: 22 * axialScale, heightOut: 9.5 * axialScale,
      hubStart: ax(514), hubShoulder: ax(522), shaftFront: ax(487), shaftRear: ax(549),
      diffuserStart: ax(firstStage.diffuserFront), diffuserEnd: ax(firstStage.diffuserRear), diffuserInner: rr(firstStage.diffuserInner) },
    { number: 2, plate: ax(611), back: ax(616), radius: rr(secondStage.backplateRadius), eye: rr(35.6),
      bladeInner: rr(33.5), bladeOuter: rr(secondStage.bladeOuter), heightIn: 27 * axialScale, heightOut: 11 * axialScale,
      hubStart: ax(576), hubShoulder: ax(584), shaftFront: ax(611), shaftRear: ax(638),
      diffuserStart: ax(secondStage.diffuserFront), diffuserEnd: ax(secondStage.diffuserRear), diffuserInner: rr(secondStage.diffuserInner) },
  ];
  const shaftRadius = rr(12.375), bladeCount = K.bladesPerStage;
  const backplateSegments = K.backplateSegments;
  for (const S of stages) {
    // Both stages' working blades extend beyond their unchanged rear disks.
    // The supported blade bottoms embed 0.15 mm into the corresponding disk.
    const rootFront = S.plate - S.heightIn, rootInner = S.eye * .69 - rr(.8);
    const rotor = [axisCylinder(S.shaftFront, S.shaftRear, shaftRadius, 64),
      axisCylinder(S.plate, S.back, S.radius, backplateSegments),
      solidLathe([[S.hubStart, shaftRadius * 1.15], [S.hubShoulder, S.eye * .69], [S.plate, S.eye]])];
    // The extended inner strips lie inside the original cone at their root,
    // then emerge exactly on its surface. They join along the full axial root
    // span rather than touching only the cone's downstream end.
    for (let i = 0; i < bladeCount; i++) rotor.push(radialVane(S.bladeInner, S.bladeOuter, i * tau / bladeCount,
      -.52, rr(2.6), 0, S.plate, t => lerp(S.heightIn, S.heightOut, t), rootInner));
    add(`compressor-rotor-${S.number}`, `第${S.number}级十八叶离心叶轮与后背盘`, 'front', steel,
      union(rotor), { ...metal, roughness: .21, clip: true, rotor: `compressor-${S.number}`, bladeCount,
        stage: S.number, backplate: true, shroud: false, backplateRadiusMm: S.radius, bladeTipRadiusMm: S.bladeOuter,
        bladeTipOverhangMm: S.bladeOuter - S.radius,
        backplateSegments, bladeRootAxialFrontMm: rootFront, bladeRootAxialRearMm: S.plate,
        bladeRootEmbeddingMm: rr(.8), bladeRootMount: 'continuous-conical-hub-and-backplate' });

    // Both static cover disks are also removed from the physical model.
    // Both diffuser rows sit aft of their respective rotor disks. Clip each
    // curved vane to the narrowing casing while keeping the inner passage open.
    const diffuser = [];
    for (let i = 0; i < 18; i++) diffuser.push(radialVane(S.diffuserInner, K.inner + .5,
      (i + .35) * tau / 18, .10, rr(2.1), S.diffuserStart, S.diffuserEnd).intersect(caseLumen));
    add(`compressor-diffuser-${S.number}`, `第${S.number}级十八扩压静叶`, 'front', vaneSteel,
      union(diffuser), { ...metal, roughness: .34, clip: true, stationary: true, bladeCount: 18, stage: S.number,
        axialFrontMm: S.diffuserStart, axialRearMm: S.diffuserEnd,
        axialGapBehindBackplateMm: S.diffuserStart - S.back });
  }

  // The complete eighteen-vane intermediate return assembly stays absent,
  // along with its former central diaphragm and the two stationary covers.

  // Restore the original first motor position and its three fine radial rods.
  // There are no inlet guide blades or interstage return guide blades.
  // These are packaging placeholders, not validated power-rated motor models.
  const motors = [{ number: 1, front: ax(484), rear: ax(510), support: ax(492) },
    { number: 2, front: ax(624), rear: ax(649), support: ax(634) }];
  for (const D of motors) {
    const motorRadius = rr(33), bore = shaftRadius + .9;
    const body = axisCylinder(D.front, D.rear, motorRadius, 96).subtract(axisCylinder(
      D.front - .1, D.number === 1 ? D.rear + .1 : ax(639.5), bore, 64));
    const pieces = [body];
    if (D.number === 2) pieces.push(solidLathe([[D.rear, motorRadius], [ax(662), .25]]));
    for (let i = 0; i < 3; i++) {
        const angle = i * tau / 3;
        const p = r => [D.support, r * Math.cos(angle), r * Math.sin(angle)];
        pieces.push(cylinder(p(motorRadius - .5), p(K.inner + 1), rr(2.4), rr(2.4), 32).intersect(caseFree));
      }
    add(`compressor-motor-${D.number}`, `第${D.number}级独立电机固定壳与支座`, 'front', darkSteel,
      union(pieces), { ...metal, clip: true, stationary: true, stage: D.number, motorSizing: 'schematic-only',
        supportCount: 3, supportAxialCentreMm: D.support, inletGuideVaneCount: 0 });
  }

  const flangeDepth = 3 * axialScale, flangeGap = .04;
  const flangeSlots = [], compressorScrews = [];
  for (const [i, x] of [K.front + axialScale, ax(619)].entries()) {
    const profile = Array.from({ length: 9 }, (_, j) => {
      const q = x + flangeDepth * j / 8, inner = innerAt(q);
      const wall = lerp(P.air.outer - P.air.inner, K.outer - K.inner,
        clamp((inner - P.air.inner) / (K.inner - P.air.inner), 0, 1));
      return [q, inner + wall];
    });
    const inside = profile.map(([q]) => [q, innerAt(q) + 1.2]);
    const flange = hollowLathe(profile, inside);
    const slotOutside = [[x - flangeGap, profile[0][1] + .1],
      ...profile.map(([q, r]) => [q, r + .1]), [x + flangeDepth + flangeGap, profile.at(-1)[1] + .1]];
    const slotInside = [[x - flangeGap, inside[0][1] - flangeGap],
      ...inside.map(([q, r]) => [q, r - flangeGap]), [x + flangeDepth + flangeGap, inside.at(-1)[1] - flangeGap]];
    flangeSlots.push(hollowLathe(slotOutside, slotInside));
    const headVoids = [];
    for (let j = 0; j < 12; j++) {
      const angle = (j + .5) * tau / 12, mid = x + flangeDepth / 2;
      const radius = profile[4][1], p = r => [mid, r * Math.cos(angle), r * Math.sin(angle)];
      compressorScrews.push(cylinder(p(radius - 2.6), p(radius - .2), .95, .95, 24)
        .subtract(cylinder(p(radius - .85), p(radius), .42, .42, 6)).intersect(flange));
      headVoids.push(cylinder(p(radius - 2.65), p(radius + .05), 1.02, 1.02, 24));
    }
    add(i === 0 ? 'compressor-front-flange' : 'compressor-rear-flange',
      i === 0 ? '压气机前装配法兰' : '第二级后装配法兰', 'compressorCase', paleSteel,
      flange.subtract(union(headVoids)), { ...metal, clip: true });
  }
  add('compressor-casing', '双级离心压气机渐缩机匣', 'compressorCase', C.compressorCase ?? '#b6a77c',
    casingWall.subtract(union(flangeSlots)),
    { metallic: .64, roughness: .31, finish: 'satin-champagne-metal', clip: true, stages: 2 });
  add('compressor-fasteners', '压气机装配法兰沉头紧固件', 'compressorCase', darkSteel,
    union(compressorScrews), { ...metal, clip: true });
  return { compressorStages: 2, compressorBladeCount: bladeCount, neckStart,
    driveArchitecture: 'independent-front-and-rear-motors', motorSizing: 'schematic-only', casingInside, stages,
    removedDiscSurfaces: ['compressor-shroud-1', 'compressor-return-diaphragm', 'compressor-shroud-2'],
    restoredBackplates: stages.map(S => ({ stage: S.number, front: S.plate, rear: S.back,
      radius: S.radius, segments: backplateSegments })),
    returnVaneCount: 0, returnDiaphragmSupportCount: 0, inletGuideVaneCount: 0 };
}
