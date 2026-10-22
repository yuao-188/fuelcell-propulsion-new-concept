/**
 * Detailed, bounded stack assemblies for the report-sized concept model.
 *
 * The report rounds the 279/372 nominal cells at a 1.01 mm pitch to 282/375 mm.
 * These are schematic mechanical details, not manufacturing cell CAD. Peripheral
 * clamping frames occupy the existing envelope instead of adding axial length.
 * A physical edge is retained every eighth nominal layer; the core's layerPitch
 * metadata supplies the remaining fine axial lines in the viewport material.
 * No per-cell solid boolean is needed, and hardware is never buried in the core.
 */
export function buildDetailedStack({ M, P, C, union, cylinder, sector, polar, add, s, i, cut }) {
  if (!M || !s || !cut) throw new Error('Detailed stack requires Manifold, a stage and its fluid clearance cutter.');
  const stage = i + 1;
  const modulePitch = 360 / s.modules;
  const layerPitch = 1.01;
  const layerCount = s.cells ?? (i === 0 ? 279 : 372);
  const edgeLodStride = 8;
  const frameDepth = 6;
  const frameOuterWidth = 12;
  const frameInnerWidth = 6;
  const frameSideDegrees = 3;
  const rodRadius = 2;
  const rodClearance = 2.15;
  const rodOrbit = s.outer - 8.5;
  const headRadius = 3.9;
  const headDepth = 2.5;
  const washerRadius = 4.7;
  const washerDepth = 0.8;
  const metalColor = C.plate ?? '#bac1c5';
  const summary = { stage, modules: s.modules, layerPitch, layerCount, edgeLodStride, physicalEdgesPerModule: [] };

  const publish = (id, label, color, solid, extra = {}) => {
    // Applying the same cutter to every part makes real gas passages continuous
    // even if a later layout change brings a port through a clamp or end frame.
    const result = solid.subtract(cut);
    add(id, label, 'stacks', color, result, { stage, clip: true, ...extra });
  };

  for (let j = 0; j < s.modules; j++) {
    const id = `${stage}-${j + 1}`;
    const label = `第${stage}级 · 模块${j + 1}`;
    const start = s.firstSeam + j * modulePitch + P.moduleGapDegrees / 2;
    const end = s.firstSeam + (j + 1) * modulePitch - P.moduleGapDegrees / 2;
    // The widest first-stage sectors need a third clamp. At the narrow third
    // stage the two edge clamps avoid the central anode channel and all ports.
    const clampAngles = end - start > 100
      ? [start + 8, (start + end) / 2, end - 8]
      : [start + 8, end - 8];

    const rawFrames = [];
    for (const [front, rear] of [[s.front, s.front + frameDepth], [s.rear - frameDepth, s.rear]]) {
      const full = sector(front, rear, s.inner, s.outer, start, end);
      const window = sector(front - 0.1, rear + 0.1,
        s.inner + frameInnerWidth, s.outer - frameOuterWidth,
        start + frameSideDegrees, end - frameSideDegrees);
      rawFrames.push(full.subtract(window));
    }
    const frameEnvelope = union(rawFrames);

    const fasteners = [];
    const washers = [];
    const hardwareVoids = [];
    for (const theta of clampAngles) {
      const point = x => polar(x, rodOrbit, theta);
      // The shaft meets the end heads at faces; washers have genuine shaft
      // holes, so the metal components share bearing faces without overlap.
      fasteners.push(cylinder(point(s.front + headDepth), point(s.rear - headDepth), rodRadius, rodRadius, 16));
      hardwareVoids.push(cylinder(point(s.front - 0.1), point(s.rear + 0.1), rodClearance, rodClearance, 20));
      for (const [headFront, headRear, washerFront, washerRear, socketFront, socketRear] of [
        [s.front, s.front + headDepth, s.front + headDepth, s.front + headDepth + washerDepth, s.front - 0.1, s.front + 0.85],
        [s.rear - headDepth, s.rear, s.rear - headDepth - washerDepth, s.rear - headDepth, s.rear - 0.85, s.rear + 0.1],
      ]) {
        const hexHead = cylinder(point(headFront), point(headRear), headRadius, headRadius, 6);
        const socket = cylinder(point(socketFront), point(socketRear), 1.25, 1.25, 6);
        fasteners.push(hexHead.subtract(socket));
        const washer = cylinder(point(washerFront), point(washerRear), washerRadius, washerRadius, 24)
          .subtract(cylinder(point(washerFront - 0.1), point(washerRear + 0.1), rodClearance, rodClearance, 20));
        washers.push(washer);
        // Counterbores accommodate both the recessed washer and the hex head;
        // all remain within the reported front/rear faces and outer radius.
        hardwareVoids.push(cylinder(point(Math.min(headFront, washerFront) - 0.01),
          point(Math.max(headRear, washerRear) + 0.01), washerRadius + 0.15, washerRadius + 0.15, 24));
      }
    }
    const hardwareClearance = union(hardwareVoids);
    const frames = frameEnvelope.subtract(hardwareClearance);

    // Sparse physical outer edges are a geometry LOD, placed at exact multiples
    // of the nominal pitch. Fine 1.01 mm stripes are supplied for every cell by
    // the shader, including the inner bore and radial seam faces.
    const edgePieces = [];
    for (let layer = 0; layer < layerCount; layer += edgeLodStride) {
      const x = s.front + (layer + 0.5) * layerPitch;
      if (x <= s.front + frameDepth + 1 || x >= s.rear - frameDepth - 1) continue;
      // Exactly the same angular tessellation as the core gives a shared
      // bearing surface; the rib need not be boolean-carved into that core.
      edgePieces.push(sector(x - 0.11, x + 0.11, s.outer - 0.35, s.outer, start, end));
    }
    const edgeEnvelope = union(edgePieces);
    const edges = edgeEnvelope.subtract(hardwareClearance).subtract(frameEnvelope);

    // The core is slightly recessed at its outside edge. The physical plate
    // edges then read as shallow, real relief without increasing the envelope.
    const core = sector(s.front, s.rear, s.inner, s.outer - 0.35, start, end)
      .subtract(frameEnvelope).subtract(hardwareClearance);
    publish(`stack-${id}`, label, C.stack, core, {
      module: j + 1,
      laminated: true,
      layerPitch,
      layerOrigin: s.front,
      layerCount,
      edgeLodStride,
      finish: 'graphite-layered',
      metallic: 0.16,
      roughness: 0.5,
    });
    publish(`stack-frames-${id}`, `${label} · 外围端压框`, metalColor, frames,
      { finish: 'machined-aluminium', metallic: 0.82, roughness: 0.27 });
    publish(`stack-fasteners-${id}`, `${label} · 夹紧杆与六角紧固件`, '#d5dde1', union(fasteners),
      { finish: 'machined-steel', metallic: 0.9, roughness: 0.24 });
    publish(`stack-washers-${id}`, `${label} · 预紧垫圈`, '#77858d', union(washers),
      { finish: 'brushed-steel', metallic: 0.8, roughness: 0.32 });
    publish(`stack-edges-${id}`, `${label} · 层叠板边缘（几何LOD）`, '#7c888e', edges,
      { finish: 'plate-edge', metallic: 0.64, roughness: 0.34, edgeLodStride, layerPitch });
    summary.physicalEdgesPerModule.push(edgePieces.length);
  }
  return summary;
}
