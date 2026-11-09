/**
 * Illustrative annular frustum stacks for the independent concept page.
 * These twenty concentric lamellae show the sloping layered form; they are not
 * the former physical cell count or a recalculated electrochemical design.
 */
export function buildFrustumStacks(ctx, { stackCutters = [], linerCutters } = {}) {
  const { P, C, union, cylinder, add } = ctx;
  const checks = [], layerCount = 20, segments = 192;
  const interpolate = (a, b, t) => a + (b - a) * t;
  for (const [index, stack] of P.stacks.entries()) {
    const stage = index + 1, length = stack.rear - stack.front;
    const widthFront = stack.outer - stack.inner;
    const widthRear = stack.rearOuter - stack.rearInner;
    if (!(length > 0 && widthFront > 0 && widthRear > 0 && stack.rearInner > 0))
      throw new Error(`Frustum stack ${stage}: invalid annular envelope`);
    const radius = (x, side) => interpolate(stack[side],
      stack[side === 'inner' ? 'rearInner' : 'rearOuter'], (x - stack.front) / length);
    // Fractions describe radial positions between the two sloping walls.
    // Cylinder primitives use the same facet phase on every surface, so the
    // graphite/silver contact faces meet exactly without overlapping material.
    const band = (x0, x1, fraction0, fraction1) => {
      const radiusAt = (x, fraction) => interpolate(radius(x, 'inner'), radius(x, 'outer'), fraction);
      const outer = cylinder([x0, 0, 0], [x1, 0, 0], radiusAt(x0, fraction1), radiusAt(x1, fraction1), segments);
      // Extend the cutter on the same straight generator, keeping both ends
      // genuinely open even after Boolean or Float32 mesh conversion.
      const inner = cylinder([x0 - .05, 0, 0], [x1 + .05, 0, 0],
        radiusAt(x0 - .05, fraction0), radiusAt(x1 + .05, fraction0), segments);
      const result = outer.subtract(inner); outer.delete(); inner.delete();
      return result;
    };
    const nominalThickness = 4.9, layerFraction = nominalThickness / widthFront;
    const pitchFraction = (1 - layerFraction) / (layerCount - 1);
    const graphite = [], laminations = [];
    for (let layer = 0; layer < layerCount; layer++) {
      const start = layer * pitchFraction;
      // A silver interlayer embedded between two dark faces gives continuous
      // black/silver diagonal stripes in an axial cut, and a dark outer cone.
      const silverStart = start + 3.6 / widthFront;
      const silverEnd = silverStart + .65 / widthFront;
      // Separate the differently coloured mating skins by a visible-scale
      // negligible relief. Coincident double-sided faces otherwise flicker
      // in WebGL even though the closed solids have no intersecting volume.
      const interfaceRelief=.025/widthFront;
      graphite.push(band(stack.front, stack.rear, start, silverStart-interfaceRelief));
      graphite.push(band(stack.front, stack.rear, silverEnd+interfaceRelief, start + layerFraction));
      laminations.push(band(stack.front, stack.rear, silverStart+interfaceRelief, silverEnd-interfaceRelief));
    }
    // Four small seating collars stay within the first and last lamellae.
    // They never bridge the open channels or cover an entire axial end face.
    const collars = [], collarPockets = [];
    for (const x of [stack.front + 5, stack.rear - 7]) {
      collars.push(band(x, x + 2, 0, 1.15 / widthFront));
      collars.push(band(x, x + 2, 1 - 1.15 / widthFront, 1));
      // A small explicit seat relief avoids coincident cone facets producing
      // sliver intersections when exported at browser precision.
      collarPockets.push(band(x - .025, x + 2.025, -.025 / widthFront, 1.175 / widthFront));
      collarPockets.push(band(x - .025, x + 2.025, 1 - 1.175 / widthFront, 1 + .025 / widthFront));
    }
    const collarSeats = union(collars), pockets = union(collarPockets), services = stackCutters[index];
    const seatCuts = services ? union([pockets, services]) : pockets;
    const rawGraphite = union(graphite), rawLaminations = union(laminations);
    const body = rawGraphite.subtract(seatCuts), foil = rawLaminations.subtract(seatCuts);
    const frameCutter = linerCutters ?? services;
    const frame = frameCutter ? collarSeats.subtract(frameCutter) : collarSeats;
    const common = { stage, clip: true, countIsIllustrative: true,
      cellArrangement: 'schematic-concentric-frustum-lamellae' };
    add(`stack-${stage}-1`, `第${stage}级环形圆台电堆 · 黑色斜向叠层`, 'stacks', C.stack, body,
      { ...common, module: 1, illustrativeLayerCount: layerCount,
        metallic: .18, roughness: .49, finish: 'graphite-plates', localPortSeats: true });
    add(`stack-lamination-${stage}`, `第${stage}级圆台电堆 · 银灰薄夹层`, 'stacks', C.plate, foil,
      { ...common, metallic: .82, roughness: .3, finish: 'machined-aluminium' });
    add(`stack-frames-${stage}-1`, `第${stage}级圆台电堆 · 内外缘窄箍`, 'stacks', C.plate, frame,
      { ...common, metallic: .85, roughness: .26, finish: 'machined-aluminium' });
    checks.push({ stage, modules: 1, geometry: 'hollow-annular-frustum', countIsIllustrative: true,
      arrangement: 'schematic-concentric-frustum-lamellae', illustrativeLayerCount: layerCount,
      front: stack.front, rear: stack.rear, axialLength: length,
      frontInnerDiameter: 2 * stack.inner, frontOuterDiameter: 2 * stack.outer,
      rearInnerDiameter: 2 * stack.rearInner, rearOuterDiameter: 2 * stack.rearOuter,
      radialContraction: stack.outer - stack.rearOuter,
      slopeAngleDeg: Math.atan2(stack.outer - stack.rearOuter, length) * 180 / Math.PI,
      frontLayerThickness: nominalThickness, silverLayerThickness: .65,
      frontOpenGap: (pitchFraction - layerFraction) * widthFront,
      rearOpenGap: (pitchFraction - layerFraction) * widthRear,
      axialEnds: 'open-concentric-sloping-channels', centreBore: 'open-front-to-rear',
      serviceSeats: Boolean(services), bodyVolume: body.volume(), foilVolume: foil.volume() });
    for (const temporary of [...graphite, ...laminations, ...collars, ...collarPockets, rawGraphite, rawLaminations]) temporary.delete();
    if (seatCuts !== pockets) seatCuts.delete();
    pockets.delete();
    if (frame !== collarSeats) collarSeats.delete();
  }
  return checks;
}
