import { getStackLayout } from './stack-layout.mjs';

/** Independent module passages and hollow distribution pipes; dimensions in mm.
 * The passages represent plumbing connectivity, not resolved electrochemistry.
 */
export function buildFluidNetworks({ M, P, C, union, cylinder, tubePath, roundPath, polar, add, water }) {
  const margin = P.clearance ?? .8, ports = [], junctionChecks = [];
  const keys = ['air', 'cathode', 'feed', 'return'];
  const networks = Object.fromEntries(keys.map(k => [k, { outer: [], voids: [] }]));
  const cutters = P.stacks.map(() => []), moduleChecks = [];
  const rad = Math.PI / 180;
  const copy = p => [...p];
  const shiftEnd = (a, b, d) => {
    const v = b.map((x, i) => x - a[i]), length = Math.hypot(...v);
    return a.map((x, i) => x + v[i] * d / length);
  };
  const trimmed = (p, start = -.15, end = -.15) => {
    const q = p.map(copy);
    q[0] = shiftEnd(p[0], p[1], start);
    q[q.length - 1] = shiftEnd(p.at(-1), p.at(-2), end);
    return q;
  };

  // A directly meshed circular sweep keeps the numerous curved manifolds
  // inexpensive. Closed rings share their seam vertices; module arcs have caps.
  function arc(x, radius, start, end, tube, closed = false) {
    const steps = Math.ceil(Math.abs(end - start) / 3), sides = 20;
    const rows = closed ? steps : steps + 1, vertices = [], faces = [];
    for (let i = 0; i < rows; i++) {
      const t = (start + (end - start) * i / steps) * rad;
      for (let j = 0; j < sides; j++) {
        const p = j * 2 * Math.PI / sides, r = radius + tube * Math.sin(p);
        vertices.push(x + tube * Math.cos(p), r * Math.cos(t), r * Math.sin(t));
      }
    }
    for (let i = 0; i < steps; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides;
      const c = ((i + 1) % rows) * sides + (j + 1) % sides, d = ((i + 1) % rows) * sides + j;
      faces.push(a, b, c, a, c, d);
    }
    if (!closed) {
      const a = vertices.length / 3; vertices.push(...polar(x, radius, start));
      const b = vertices.length / 3; vertices.push(...polar(x, radius, end));
      for (let j = 0; j < sides; j++) {
        faces.push(a, (j + 1) % sides, j);
        faces.push(b, (rows - 1) * sides + j, (rows - 1) * sides + (j + 1) % sides);
      }
    }
    const solid = M.ofMesh({ numProp: 3, vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(faces) });
    if (solid.status() !== 'NoError' || solid.volume() <= 0) throw new Error('Invalid fluid arc');
    return solid;
  }

  function path(key, points, outer, inner, { stage, start = -.15, end = -.15, rounded = 0,
    separatorStart = false, separatorEnd = false } = {}) {
    const pp = rounded ? roundPath(points, rounded) : points;
    const wall = tubePath(pp, outer);
    const bores = [tubePath(trimmed(pp, separatorStart ? 1 : start, separatorEnd ? 1 : end), inner)];
    // The separator uses 40-sided axial port bores. Match those polygons at the
    // mating face; unequal 32/40-sided circles otherwise leave numerical slivers.
    if (separatorStart) {
      const p = pp[0];
      bores.push(cylinder([p[0] - .15, p[1], p[2]], [p[0] + 1.2, p[1], p[2]], inner, inner, 40));
    }
    if (separatorEnd) {
      const p = pp.at(-1);
      bores.push(cylinder([p[0] - 1.2, p[1], p[2]], [p[0] + .15, p[1], p[2]], inner, inner, 40));
    }
    const bore = union(bores);
    networks[key].outer.push(wall); networks[key].voids.push(bore);
    if (stage !== undefined) cutters[stage].push(tubePath(pp, outer + margin));
    return { outer: wall, bore, points: pp };
  }
  function manifold(key, x, radius, start, end, outer, inner, stage, closed = false) {
    const wall = arc(x, radius, start, end, outer, closed);
    // Unused ends of an independent module manifold remain sealed.
    const inset = closed ? 0 : .9 / radius / rad;
    const bore = arc(x, radius, start + inset, end - inset, inner, closed);
    networks[key].outer.push(wall); networks[key].voids.push(bore);
    if (stage !== undefined) cutters[stage].push(arc(x, radius, start, end, outer + margin, closed));
    return { outer: wall, bore };
  }
  const ring = (key, x, radius, outer, inner) => manifold(key, x, radius, 0, 360, outer, inner, undefined, true);
  const headerPoint = (x, radius, angle) => polar(x, radius, angle);
  const first = P.stacks[0], last = P.stacks.at(-1);
  const feedStart = first.rear + 5, returnStart = first.front - 5;
  const firstWet = first.front + .56 * (first.rear - first.front);
  const H = P.hydrogen;

  // Closed blind ends are slightly beyond the first tee. The compressor inlet,
  // fresh-H2 inlet and four separator mating faces remain genuinely open.
  path('air', [[P.compressor.outlet, 0, 0], [P.air.end, 0, 0]], P.air.outer, P.air.inner);
  path('feed', [headerPoint(feedStart - 6, 70, 45), headerPoint(H.inletX, 70, 45)], H.outer, H.inner, { start: 2 });
  path('return', [headerPoint(returnStart - 6, 70, 225), headerPoint(1415, 70, 225), [1430, -105, -90], water.anode.inlet.point],
    H.outer, H.inner, { start: 2, rounded: 7, separatorEnd: true });
  path('cathode', [headerPoint(firstWet - 6, 95, 315), headerPoint(1625, 95, 315)], 12, 9, { start: 2, end: -.15 });

  for (const [i, s] of P.stacks.entries()) {
    const layout = getStackLayout(s), length = s.rear - s.front, root = s.inner + 5;
    const airX = s.front + .32 * length, wetX = s.front + .56 * length;
    const feedX = s.rear + 5, returnX = s.front - 5;
    const internalFeedX = s.rear - 16, internalReturnX = s.front + 16;
    ring('feed', feedX, 50, 3.8, 2.2);
    ring('return', returnX, 120, 3.8, 2.2);
    ring('cathode', wetX, 85, 7, 4.5);
    path('feed', [polar(feedX, 50, 45), polar(feedX, 70, 45)], 3.8, 2.2);
    path('return', [polar(returnX, 70, 225), polar(returnX, 120, 225)], 3.8, 2.2);
    path('cathode', [polar(wetX, 85, 315), polar(wetX, 95, 315)], 7, 4.5);

    for (const module of layout.modules) {
      const j = module.index, theta = module.centre, start = module.caseStart + 4, end = module.caseEnd - 4;
      const airArc = manifold('air', airX, root, start, end, 4, 2.6, i);
      const wetArc = manifold('cathode', wetX, root, start, end, 4, 2.6, i);
      const feedArc = manifold('feed', internalFeedX, root, start, end, 3, 1.8, i);
      const returnArc = manifold('return', internalReturnX, root, start, end, 3, 1.8, i);

      // Large radial ports end flat inside the root rail, never in a large
      // spherical elbow. An inset bore cap lets the small arc open a true tee
      // without exposing the remainder of the larger port's blind end.
      const airBranch = path('air', [[airX, 0, 0], polar(airX, root, theta)], 9, 6.5, { stage: i, end: .8 });
      const wetBranch = path('cathode', [polar(wetX, 85, theta - 15), polar(wetX, root, theta - 15)], 7, 4.5,
        { stage: i, end: .8 });
      const feedBranch = path('feed', [polar(feedX, 50, theta), polar(feedX, root, theta), polar(internalFeedX, root, theta)],
        3.8, 2.2, { stage: i, end: .8, rounded: 5 });
      const returnBranch = path('return', [polar(returnX, 120, theta), polar(returnX, root, theta), polar(internalReturnX, root, theta)],
        3.8, 2.2, { stage: i, end: .8, rounded: 4 });

      // Short representative cathode passage stays entirely between its inlet
      // and wet outlet; the long cooling gaps around it remain axial and open.
      const cathodeMid = (airX + wetX) / 2;
      const cathodeIn = path('air', [polar(airX, root, theta), polar(cathodeMid, root, theta)], 3.8, 2.4, { stage: i });
      const cathodeOut = path('cathode', [polar(cathodeMid, root, theta), polar(wetX, root, theta)], 3.8, 2.4, { stage: i });
      const anodeMid = (internalReturnX + internalFeedX) / 2, anodeRadius = s.inner - 5, anodeTheta = theta + 15;
      const anodeIn = path('feed', [polar(internalFeedX, root, anodeTheta), polar(internalFeedX, anodeRadius, anodeTheta),
        polar(anodeMid, anodeRadius, anodeTheta)], 3.8, 2.2, { stage: i, rounded: 3 });
      const anodeOut = path('return', [polar(internalReturnX, root, anodeTheta), polar(internalReturnX, anodeRadius, anodeTheta),
        polar(anodeMid, anodeRadius, anodeTheta)], 3.8, 2.2, { stage: i, rounded: 3 });

      for (const [fluid, x, r, angle, direction, inner, outer] of [
        ['air', airX, s.inner, theta, [0, Math.cos(theta * rad), Math.sin(theta * rad)], 6.5, 9],
        ['cathode', wetX, s.inner, theta - 15, [0, -Math.cos((theta - 15) * rad), -Math.sin((theta - 15) * rad)], 4.5, 7],
        ['hydrogen', s.rear, root, theta, [-1, 0, 0], 2.2, 3.8],
        ['return', s.front, root, theta, [-1, 0, 0], 2.2, 3.8],
      ]) ports.push({ id: `${fluid}-${i + 1}-${j + 1}`, fluid, medium: fluid, stage: i + 1, module: j + 1,
        position: polar(x, r, angle), direction, inner, outer });

      for (const [name, a, b] of [
        ['air-port', airBranch.bore, airArc.bore], ['air-channel', airArc.bore, cathodeIn.bore],
        ['cathode-midpoint', cathodeIn.bore, cathodeOut.bore], ['wet-channel', cathodeOut.bore, wetArc.bore],
        ['wet-port', wetArc.bore, wetBranch.bore], ['feed-port', feedBranch.bore, feedArc.bore],
        ['feed-channel', feedArc.bore, anodeIn.bore], ['anode-midpoint', anodeIn.bore, anodeOut.bore],
        ['return-channel', anodeOut.bore, returnArc.bore], ['return-port', returnArc.bore, returnBranch.bore],
      ]) junctionChecks.push({ name: `${i + 1}-${j + 1}-${name}`, a, b });
      moduleChecks.push({ stage: i + 1, module: j + 1, rootRadius: root, airX, wetX,
        internalFeedX, internalReturnX, manifoldAngles: [start, end], cathodeRepresentativeLength: wetX - airX });
    }
  }

  // Separator faces and pump faces are exact solid mating planes. Their bores
  // overlap by 0.15 mm so the global fluid-connectivity test sees open joints.
  path('return', [water.anode.outlet.point, [1538, -105, -90], [1548, -105, 70], [1570, 0, 70],
    [P.pump.front, 0, P.pump.centerZ]], H.outer, H.inner, { rounded: 7, separatorStart: true });
  const pumpLoop = [[P.pump.rear, 0, P.pump.centerZ], [1695, 0, 70]];
  for (let k = 1; k <= 12; k++) pumpLoop.push(polar(1695, 70, 90 - 45 * k / 12));
  path('feed', pumpLoop, H.outer, H.inner);

  // The wet inlet skirts the core on the lower/port side; a straight line from
  // the wet header to this separator would cut through the main air duct.
  const wetRoute = [polar(1625, 95, 315), polar(1640, 125, 315)];
  const endAngle = Math.atan2(water.cathode.inlet.point[2], water.cathode.inlet.point[1]) / rad;
  for (let k = 1; k <= 30; k++) wetRoute.push(polar(1640 + 10 * k / 30, 125, 315 + (endAngle - 315) * k / 30));
  wetRoute.push([1664, -105, 90], water.cathode.inlet.point);
  path('cathode', wetRoute, 12, 9, { separatorEnd: true });
  path('cathode', [water.cathode.outlet.point, [1790, -105, 90], [1815, -70, 90], [1990, -70, 90]], 12, 9,
    { rounded: 8, separatorStart: true });

  const bores = Object.fromEntries(keys.map(k => [k, union(networks[k].voids)]));
  const fullCathode = union([bores.air, bores.cathode]);
  const fullAnode = union([bores.feed, bores.return]);
  const color = { air: C.air, cathode: C.cathode ?? '#66a5b5', feed: C.hydrogen, return: C.return };
  const groups = { air: 'air', cathode: 'cathodeExhaust', feed: 'hydrogen', return: 'return' };
  const names = { air: '空气主管 · 11模块独立进气支路', cathode: '11模块阴极湿尾气 · 分离器连接',
    feed: '氢气供给 · 11模块独立支路', return: '11模块阳极回气 · 除水后进循环泵' };
  const solids = {};
  for (const key of keys) {
    // Both halves of each colour boundary use the same full fluid cavity.
    solids[key] = union(networks[key].outer).subtract(key === 'air' || key === 'cathode' ? fullCathode : fullAnode);
    add(`${groups[key]}-network`, names[key], groups[key], color[key], solids[key], { clip: true, metallic: .45, roughness: .34 });
  }
  return {
    ports, stackCutters: cutters.map(union), airBore: bores.air, cathodeBore: bores.cathode,
    anodeBore: fullAnode, feedBore: bores.feed, returnBore: bores.return,
    junctionChecks, solids,
    checks: { units: 'mm', independentModules: 11, portCounts: { air: 11, cathode: 11, hydrogen: 11, return: 11 },
      moduleManifoldsAreIsolatedArcs: true, manifoldRootOffset: 5, modules: moduleChecks,
      internalChannelStatus: 'representative module connectivity; axial cooling gaps remain open',
      feedHeader: { radius: 70, angle: 45 }, returnHeader: { radius: 70, angle: 225 },
      wetHeader: { radius: 95, angle: 315 }, wetSeparatorRouteRadius: 125 },
  };
}
