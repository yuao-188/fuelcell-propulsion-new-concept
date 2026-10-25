import { getStackLayout } from './stack-layout.mjs';

/**
 * Real radial plate arrays: 279/372/372 plates per independent module.
 * Each 0.55 mm plate has parallel faces; its neighbouring cooling void extends
 * through the full axial length and widens towards the outer circumference.
 * A module is one aggregate plate mesh and one Boolean operation, not hundreds
 * of separate mesh nodes or a rotated surface texture.
 */
export function buildDetailedStack({ M, P, C, union, cylinder, sector, polar, add, s, i, cut }) {
  if (!M || !s || !cut) throw new Error('Detailed stack requires a stage and fluid clearance cutters');
  const stage = i + 1, layout = getStackLayout(s);
  const clearance = .035;
  const shaftRadius = .6, shaftPocket = .72;
  const headRadius = 1.05, washerRadius = 1.15, headDepth = 1.5, washerDepth = .5;
  const publish = (id, name, color, solid, extra = {}) => add(id, name, 'stacks', color,
    solid.subtract(cut), { stage, clip: true, ...extra });

  function plateArray(angles) {
    const vertices = new Float32Array(angles.length * 8 * 3);
    const indices = new Uint32Array(angles.length * 36);
    const corners = [
      [s.front, layout.cellInner, -layout.plateThickness / 2],
      [s.rear, layout.cellInner, -layout.plateThickness / 2],
      [s.rear, layout.cellOuter, -layout.plateThickness / 2],
      [s.front, layout.cellOuter, -layout.plateThickness / 2],
      [s.front, layout.cellInner, layout.plateThickness / 2],
      [s.rear, layout.cellInner, layout.plateThickness / 2],
      [s.rear, layout.cellOuter, layout.plateThickness / 2],
      [s.front, layout.cellOuter, layout.plateThickness / 2],
    ];
    const faces = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
    angles.forEach((theta, k) => {
      const angle = theta * Math.PI / 180, c = Math.cos(angle), q = Math.sin(angle);
      corners.forEach(([x, y, z], v) => vertices.set([x, y * c - z * q, y * q + z * c], (k * 8 + v) * 3));
      faces.forEach((v, j) => { indices[k * 36 + j] = k * 8 + v; });
    });
    const plates = M.ofMesh({ numProp: 3, vertProperties: vertices, triVerts: indices });
    if (plates.status() !== 'NoError') throw new Error('Radial plate mesh is invalid');
    return plates;
  }

  const physicalCounts = [];
  for (const module of layout.modules) {
    const id = `${stage}-${module.index + 1}`, label = `第${stage}级 · 模块${module.index + 1}`;
    const plates = plateArray(module.plateAngles);

    // Continuous inner header rail (10 mm radially) is reserved for the root
    // generator's independent air, H2, return and cathode-outlet manifolds.
    // The large central window is open at both axial ends. Its angular sides
    // form the two end plates that now clamp in the circumferential direction.
    const fullFrame = sector(s.front, s.rear, s.inner, s.outer, module.caseStart, module.caseEnd);
    // sector() has at most 2 degree angular facets. Compensating their sag makes
    // even the smallest inscribed window radius clear every outer plate corner.
    const windowOuter = (layout.cornerRadius + clearance) / Math.cos(Math.PI / 180);
    const window = sector(s.front - .1, s.rear + .1, layout.cellInner - clearance, windowOuter,
      module.activeStart, module.activeEnd);
    const frameEnvelope = fullFrame.subtract(window);

    const seals = [], sealPockets = [];
    const angularRelief = .025 / layout.cellInner * 180 / Math.PI;
    for (const [start, end] of [
      [module.activeStart - layout.sealAngle, module.activeStart],
      [module.activeEnd, module.activeEnd + layout.sealAngle],
    ]) {
      seals.push(sector(s.front, s.rear, s.inner + .4, s.outer - .4, start, end));
      sealPockets.push(sector(s.front - .025, s.rear + .025, s.inner + .375, s.outer - .375,
        start - angularRelief, end + angularRelief));
    }

    // Small assembly fasteners stay in the side end plates, clear of every
    // active cooling channel and of the 10 mm inner manifold rail.
    const fasteners = [], washers = [], hardwarePockets = [];
    const orbit = (layout.cellInner + layout.cellOuter) / 2;
    const boltAngles = [
      (module.caseStart + module.activeStart - layout.sealAngle) / 2,
      (module.activeEnd + layout.sealAngle + module.caseEnd) / 2,
    ];
    for (const [side, theta] of boltAngles.entries()) {
      const at = x => polar(x, orbit, theta);
      // The first side end plate carries the radial H2 inlet passage at rear-16.
      // Two short screws replace its former full-length tie rod, so neither a
      // rod nor an empty through-hole crosses the sealed feed passage.
      const shaftIntervals = side === 0
        ? [[s.front + headDepth, s.front + 8], [s.rear - 8, s.rear - headDepth]]
        : [[s.front + headDepth, s.rear - headDepth]];
      const pocketIntervals = side === 0
        ? [[s.front - .03, s.front + 8.1], [s.rear - 8.1, s.rear + .03]]
        : [[s.front - .03, s.rear + .03]];
      for (const [a, b] of shaftIntervals) fasteners.push(cylinder(at(a), at(b), shaftRadius, shaftRadius, 12));
      for (const [a, b] of pocketIntervals) hardwarePockets.push(cylinder(at(a), at(b), shaftPocket, shaftPocket, 16));
      for (const [a, b, wa, wb, sa, sb] of [
        [s.front, s.front + headDepth, s.front + headDepth, s.front + headDepth + washerDepth, s.front - .05, s.front + .6],
        [s.rear - headDepth, s.rear, s.rear - headDepth - washerDepth, s.rear - headDepth, s.rear - .6, s.rear + .05],
      ]) {
        fasteners.push(cylinder(at(a), at(b), headRadius, headRadius, 12)
          .subtract(cylinder(at(sa), at(sb), .45, .45, 6)));
        washers.push(cylinder(at(wa), at(wb), washerRadius, washerRadius, 24)
          .subtract(cylinder(at(wa - .05), at(wb + .05), shaftPocket, shaftPocket, 16)));
        hardwarePockets.push(cylinder(at(Math.min(a, wa) - .025), at(Math.max(b, wb) + .025),
          washerRadius + .05, washerRadius + .05, 24));
      }
    }
    const frame = frameEnvelope.subtract(union([...sealPockets, ...hardwarePockets]));
    publish(`stack-${id}`, label, C.stack, plates, {
      module: module.index + 1, laminated: false, layerCount: layout.count,
      physicalCells: layout.count, cellArrangement: 'radial-circumferential',
      plateThickness: layout.plateThickness, innerCoolingGap: layout.coolingGap,
      finish: 'graphite-plates', metallic: .16, roughness: .5,
    });
    publish(`stack-frames-${id}`, `${label} · 独立根部集管框与周向端板`, C.plate ?? '#bac1c5', frame,
      { finish: 'machined-aluminium', metallic: .82, roughness: .27 });
    publish(`stack-fasteners-${id}`, `${label} · 端框装配紧固件`, '#d5dde1', union(fasteners),
      { finish: 'machined-steel', metallic: .9, roughness: .24 });
    publish(`stack-washers-${id}`, `${label} · 紧固垫圈`, '#77858d', union(washers),
      { finish: 'brushed-steel', metallic: .8, roughness: .32 });
    publish(`stack-seals-${id}`, `${label} · 两侧绝缘密封条`, '#202b31', union(seals),
      { finish: 'insulating-seal', metallic: .03, roughness: .72 });
    physicalCounts.push(layout.count);
  }
  // P remains in the shared generator signature; dimensions come from each s.
  void P;
  return {
    stage, modules: s.modules, physicalCellsPerModule: physicalCounts,
    totalPhysicalCells: physicalCounts.reduce((sum, n) => sum + n, 0),
    plateThickness: layout.plateThickness, nominalInnerCoolingGap: layout.coolingGap,
    constructedInnerCoolingGap: layout.constructedGap, numericRelief: layout.numericRelief,
    outerCoolingGap: layout.outerCoolingGap, cellInner: layout.cellInner, cellOuter: layout.cellOuter,
    axialCoolingLength: s.rear - s.front, coolingDirection: 'front-to-rear',
    moduleGapAtInner: layout.moduleGap, moduleGapAtOuter: layout.moduleGapAtOuter,
    sideFrameMinimumThickness: layout.sideFrameMinimumThickness,
  };
}
