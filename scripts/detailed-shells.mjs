/**
 * Continuous casing envelopes with recessed assembly details.
 * Dimensions are in mm. Detail pieces are seated in explicit matching pockets;
 * none enlarges either design envelope or projects into the flow passages.
 */
export function buildDetailedShells({ M, CS, P, union, cylinder, revolved, polar, add }) {
  const os = P.outerShell, ins = P.innerShell;
  const relief = .025;
  const smooth = t => t * t * (3 - 2 * t);
  const expansionStart = ins.expansionStart;
  if (!(ins.front < expansionStart && expansionStart < ins.shoulder && ins.shoulder < ins.rear)) {
    throw new Error('innerShell requires front < expansionStart < shoulder < rear');
  }
  if (!(os.front + 25 <= os.taperStart && os.taperStart < os.waistStart
      && os.waistStart < os.shoulder && os.shoulder < os.rear)) {
    throw new Error('outerShell requires inlet < taperStart < waistStart < shoulder < rear');
  }
  if (!(ins.wall > 2.2 && os.wall > 2.3)) throw new Error('Casing walls are too thin for the recessed details');

  // The unchanged inlet clears the complete rotating fan envelope. Both aft
  // contractions meet the level waist with zero slope, rather than hard corners.
  const outerProfile = [
    [os.front, os.radius + 10], [os.front + 4, os.radius + 7],
    [os.front + 12, os.radius + 3], [os.front + 25, os.radius],
    [os.taperStart, os.radius],
  ];
  for (let i = 1; i <= 64; i++) {
    const t = i / 64;
    outerProfile.push([os.taperStart + (os.waistStart - os.taperStart) * t,
      os.radius + (os.waistRadius - os.radius) * smooth(t)]);
  }
  outerProfile.push([os.shoulder, os.waistRadius]);
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    outerProfile.push([os.shoulder + (os.rear - os.shoulder) * t,
      os.waistRadius + (os.outletRadius - os.waistRadius) * smooth(t)]);
  }

  // Cubic Hermite transitions have exactly zero slope at every join. Unlike a
  // linear loft, this retains a level forward section and no expansion shoulder.
  const midStation = ins.midStation ?? ins.shoulder;
  const midRadius = ins.midRadius ?? ins.radius;
  const innerRadius = x => x <= expansionStart ? ins.inletRadius
    : x <= midStation ? ins.inletRadius + (midRadius - ins.inletRadius)
      * smooth((x - expansionStart) / (midStation - expansionStart))
    : x <= ins.shoulder ? midRadius + (ins.radius - midRadius)
      * smooth((x - midStation) / (ins.shoulder - midStation))
      : ins.radius + (ins.outletRadius - ins.radius)
      * smooth((x - ins.shoulder) / (ins.rear - ins.shoulder));
  const innerProfile = [[ins.front, ins.inletRadius], [expansionStart, ins.inletRadius]];
  for (let i = 1; i <= 96; i++) {
    const x = expansionStart + (ins.shoulder - expansionStart) * i / 96;
    innerProfile.push([x, innerRadius(x)]);
  }
  for (let i = 1; i <= 40; i++) {
    const x = ins.shoulder + (ins.rear - ins.shoulder) * i / 40;
    innerProfile.push([x, innerRadius(x)]);
  }
  const outerEnvelope = revolved(outerProfile, os.wall);
  const innerEnvelope = revolved(innerProfile, ins.wall);

  // All machining details use the same sampled surface as the body. Inserting
  // exact boundary stations preserves that piecewise-linear envelope at seats.
  const sampledRadius = (profile, x) => {
    const next = profile.findIndex(p => p[0] >= x);
    if (next === 0) return profile[0][1];
    if (next < 0) return profile.at(-1)[1];
    const a = profile[next - 1], b = profile[next];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  };
  const surfaceSlope = (profile, x) => {
    const next = Math.max(1, profile.findIndex(p => p[0] > x));
    const a = profile[next - 1], b = profile[next];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const profileRange = (profile, front, rear, offset = 0) => [
    [front, sampledRadius(profile, front) + offset],
    ...profile.filter(p => p[0] > front && p[0] < rear).map(([x, r]) => [x, r + offset]),
    [rear, sampledRadius(profile, rear) + offset],
  ];

  // A sector uses the same angular convention as polar and the main generator.
  const sector = (front, rear, inner, outer, start, end) => {
    const points = [], count = Math.ceil((end - start) / .5);
    for (let i = 0; i <= count; i++) {
      const a = (start + (end - start) * i / count) * Math.PI / 180;
      points.push([-outer * Math.sin(a), outer * Math.cos(a)]);
    }
    for (let i = count; i >= 0; i--) {
      const a = (start + (end - start) * i / count) * Math.PI / 180;
      points.push([-inner * Math.sin(a), inner * Math.cos(a)]);
    }
    return new CS([points]).extrude(rear - front).rotate([0, 90, 0]).translate([front, 0, 0]);
  };
  const axialSlice = (front, rear, radius) => cylinder([front, 0, 0], [rear, 0, 0], radius, radius, 144);
  const outerCuts = [], innerCuts = [], outerScrews = [], innerScrews = [];

  // End trim is taken from the existing lip and nozzle material. Axial relief
  // keeps the separately exported parts disjoint after Float32 mesh conversion.
  const inletTrimEnd = os.front + 18, exitTrimStart = os.rear - 6;
  const endTrims = union([
    outerEnvelope.intersect(axialSlice(os.front, inletTrimEnd, os.radius + 20)),
    outerEnvelope.intersect(axialSlice(exitTrimStart, os.rear, os.radius + 20)),
  ]);
  outerCuts.push(
    axialSlice(os.front - relief, inletTrimEnd + relief, os.radius + 20),
    axialSlice(exitTrimStart - relief, os.rear + relief, os.radius + 20),
  );

  // Narrow, shallow circumferential joints leave a continuous wall underneath.
  // No band is layered on top of the housing and the prescribed OD is retained.
  const seamStations = [550, 1110, 1750];
  for (const x of seamStations) {
    outerCuts.push(revolved(profileRange(outerProfile, x - .45, x + .45, .05), .7));
  }

  const countersunk = (x, r, slope, angle, headRadius, depth, envelope, cuts, screws) => {
    // Screw axes follow the local conical surface normal; clipped heads end on
    // the actual casing surface rather than floating over a constant-radius tube.
    const theta = angle * Math.PI / 180, scale = Math.hypot(1, slope);
    const n = [-slope / scale, Math.cos(theta) / scale, Math.sin(theta) / scale];
    const origin = polar(x, r, angle), point = d => origin.map((v, i) => v + d * n[i]);
    const a = point(-depth), b = point(.04);
    const head = cylinder(a, b, headRadius * .48, headRadius, 24).intersect(envelope);
    const socket = cylinder(point(-.65), point(.15), headRadius * .36, headRadius * .36, 6);
    screws.push(head.subtract(socket));
    // The pocket is slightly deeper and wider than the inserted screw. It is
    // wholly inside the wall, so the remaining inner wall stays unperforated.
    cuts.push(cylinder(point(-depth - relief), point(.12),
      headRadius * .48 + .06, headRadius + .09, 24));
  };

  // Three small flush access covers use curved surfaces matching the casing.
  // Their radial seats and perimeter gaps are removed before adding each lid.
  const coverCentre = os.front + 400, covers = [], coverCuts = [];
  const coverFront = coverCentre - 48, coverRear = coverCentre + 48;
  for (const angle of [45, 165, 285]) {
    const coverWedge = sector(coverFront, coverRear, 1, os.radius + 20, angle - 4, angle + 4);
    const cover = revolved(profileRange(outerProfile, coverFront, coverRear, -.1), 1.9)
      .intersect(coverWedge).intersect(outerEnvelope);
    const pocketWedge = sector(coverFront - .18, coverRear + .18, 1, os.radius + 20,
      angle - 4.03, angle + 4.03);
    outerCuts.push(revolved(profileRange(outerProfile, coverFront - .18, coverRear + .18, .2), 2.35)
      .intersect(pocketWedge));
    const seats = [];
    for (const x of [coverCentre - 31, coverCentre + 31]) {
      countersunk(x, sampledRadius(outerProfile, x) - .1, surfaceSlope(outerProfile, x),
        angle, 2.5, 1.35, cover, seats, outerScrews);
    }
    coverCuts.push(...seats);
    covers.push(cover.subtract(union(seats)));
  }

  for (const x of [os.front + 40, 558, 1118, 1740]) {
    for (let j = 0; j < 8; j++) {
      countersunk(x, sampledRadius(outerProfile, x), surfaceSlope(outerProfile, x), 22.5 + j * 45, 2.8, 1.8,
        outerEnvelope, outerCuts, outerScrews);
    }
  }
  // The inner casing remains one connected, continuous shell. Only the front
  // inspection fasteners are inset, within the flat-radius portion of its wall.
  for (let j = 0; j < 8; j++) {
    countersunk(ins.front + 15, ins.inletRadius, 0, 22.5 + j * 45, 2.4, 1.5,
      innerEnvelope, innerCuts, innerScrews);
  }

  add('outer-shell', '连续曲面涵道机匣', 'outerShell', '#9ca9b3',
    outerEnvelope.subtract(union([...outerCuts, ...coverCuts])),
    { clip: true, metallic: .84, roughness: .33, finish: 'satin-aluminium' });
  add('outer-shell-port-trims', '进出口滚边与端口精加工环', 'outerShell', '#c6d0d6', endTrims,
    { clip: true, metallic: .9, roughness: .24 });
  add('outer-shell-access-covers', '嵌入式曲面检修盖', 'outerShell', '#8998a3', union(covers),
    { clip: true, metallic: .82, roughness: .37, finish: 'satin-aluminium' });
  add('outer-shell-fasteners', '机匣沉头内六角紧固件', 'outerShell', '#596975', union(outerScrews),
    { clip: true, metallic: .88, roughness: .25 });
  add('inner-shell', '等径前段与连续渐扩收缩内壳', 'innerShell', '#8897a2',
    innerEnvelope.subtract(union(innerCuts)),
    { clip: true, metallic: .78, roughness: .32, finish: 'satin-aluminium' });
  add('inner-shell-fasteners', '内壳前端沉头检修紧固件', 'innerShell', '#c1cbd1', union(innerScrews),
    { clip: true, metallic: .88, roughness: .23 });

  // Conservative clearance includes the 144-sided bore's radial sag. Evaluating
  // both profiles' knots gives the minimum of their piecewise-linear difference.
  const polygonFactor = Math.cos(Math.PI / 144);
  const minimumAt = (stations, gapAt) => stations.map(x => ({ x, gap: gapAt(x) }))
    .reduce((a, b) => a.gap < b.gap ? a : b);
  const stackClearances = P.stacks.map((s, i) => {
    const stations = [s.front, s.rear, ...innerProfile.filter(p => p[0] > s.front && p[0] < s.rear).map(p => p[0])];
    const minimum = minimumAt(stations, x => (sampledRadius(innerProfile, x) - ins.wall) * polygonFactor - s.outer);
    if (minimum.gap < P.clearance) throw new Error(`Inner casing clearance too small at stack ${i + 1}: ${minimum.gap}`);
    return { stage: i + 1, minimumRadialClearance: minimum.gap, x: minimum.x,
      rearRadialClearance: (sampledRadius(innerProfile, s.rear) - ins.wall) * polygonFactor - s.outer };
  });
  const overlapFront = Math.max(ins.front, os.front), overlapRear = Math.min(ins.rear, os.rear);
  const shellStations = [overlapFront, overlapRear, ...[...outerProfile, ...innerProfile]
    .filter(p => p[0] > overlapFront && p[0] < overlapRear).map(p => p[0])];
  const shellGap = minimumAt(shellStations, x => (sampledRadius(outerProfile, x) - os.wall)
    * polygonFactor - sampledRadius(innerProfile, x));
  if (shellGap.gap < P.clearance) throw new Error(`Outer and inner casing clearance too small: ${shellGap.gap}`);
  const fanStations = [P.fan.front, P.fan.rear, ...outerProfile
    .filter(p => p[0] > P.fan.front && p[0] < P.fan.rear).map(p => p[0])];
  const fanGap = minimumAt(fanStations, x => (sampledRadius(outerProfile, x) - os.wall)
    * polygonFactor - P.fan.radius);
  if (fanGap.gap < P.clearance) throw new Error(`Outer casing obstructs rotating fan envelope: ${fanGap.gap}`);
  const fanSweep = axialSlice(P.fan.front, P.fan.rear, P.fan.radius);
  const sweptOverlap = outerEnvelope.intersect(fanSweep), sweptOverlapVolume = sweptOverlap.volume();
  sweptOverlap.delete(); fanSweep.delete();
  if (sweptOverlapVolume > .02) throw new Error('Outer casing intersects the full fan sweep');
  return {
    profiles: { outer: outerProfile, inner: innerProfile },
    verification: {
      innerCurve: 'cubic Hermite, zero slope at expansionStart, shoulder and rear',
      outerCurve: 'preserved fan inlet; cubic Hermite contraction, constant waist, cubic Hermite tail contraction',
      outerWaist: { front: os.waistStart, rear: os.shoulder, radius: os.waistRadius },
      innerConstantRadius: { front: ins.front, rear: expansionStart, radius: ins.inletRadius },
      innerWall: ins.wall, stackClearances, seamStations,
      fanSweptClearance: { front: P.fan.front, rear: P.fan.rear, radius: P.fan.radius,
        minimumRadialClearance: fanGap.gap, x: fanGap.x, intersectionVolume: sweptOverlapVolume },
      interShellClearance: { minimumRadialClearance: shellGap.gap, x: shellGap.x },
      outerAccessCovers: covers.length, outerFasteners: outerScrews.length, innerFasteners: innerScrews.length,
      detailRelief: relief, detailsWithinOriginalEnvelope: true,
    },
  };
}
