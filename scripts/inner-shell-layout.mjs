/** Shared inner-casing surface and the one explicit electrical feedthrough. */
export function getInnerShellLayout(P) {
  const s = P.innerShell, last = P.stacks.at(-1);
  const smooth = t => t * t * (3 - 2 * t);
  const knots = [
    [s.front, s.inletRadius], [s.expansionStart, s.inletRadius],
    [P.stacks[0].front, s.firstStageRadius],
    [P.stacks[1].front, s.secondStageRadius],
    [last.front, last.outer],
  ];
  if (knots.some((p, i) => i && !(p[0] > knots[i - 1][0] && p[1] >= knots[i - 1][1]))) {
    throw new Error('The inner casing must widen monotonically and terminate at the third-stage front rim');
  }
  const slopes = knots.slice(1).map((p, i) => (p[1] - knots[i][1]) / (p[0] - knots[i][0]));
  // Harmonic slopes keep a continuous tangent without an artificial flat
  // shoulder at each stage station. The inlet and final contact lip are level.
  const tangents = knots.map((_, i) => i === 0 || i === knots.length - 1 || slopes[i - 1] === 0 || slopes[i] === 0
    ? 0 : 2 * slopes[i - 1] * slopes[i] / (slopes[i - 1] + slopes[i]));
  const profile = [knots[0]];
  for (let k = 0; k < knots.length - 1; k++) {
    const [a, ra] = knots[k], [b, rb] = knots[k + 1], length = b - a;
    const count = Math.max(1, Math.ceil(length / 6));
    for (let j = 1; j <= count; j++) {
      const t = j / count, t2 = t * t, t3 = t2 * t;
      profile.push([a + length * t, (2 * t3 - 3 * t2 + 1) * ra
        + (t3 - 2 * t2 + t) * length * tangents[k]
        + (-2 * t3 + 3 * t2) * rb + (t3 - t2) * length * tangents[k + 1]]);
    }
  }
  const radiusAt = x => {
    if (x <= profile[0][0]) return profile[0][1];
    if (x >= last.front) return last.outer;
    const index = profile.findIndex(p => p[0] >= x), a = profile[index - 1], b = profile[index];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  };
  const taperStart = last.front - s.terminalTaperLength;
  const wallAt = x => x <= taperStart ? s.wall : s.wall
    + (s.terminalWall - s.wall) * smooth(Math.min(1, (x - taperStart) / s.terminalTaperLength));
  // Include the thickness-transition station in the sampled solid as well.
  if (!profile.some(p => p[0] === taperStart)) profile.push([taperStart, radiusAt(taperStart)]);
  profile.sort((a, b) => a[0] - b[0]);
  const egressX = last.front - 42, egressRadius = radiusAt(egressX);
  const egress = { x: egressX, angle: 330, innerRadius: egressRadius - wallAt(egressX) - 1,
    outerRadius: egressRadius + 1, holeRadius: 4.35, sleeveRadius: 4.15, boreRadius: 2.9 };
  return { profile, radiusAt, wallAt, rear: last.front, terminalRadius: last.outer,
    terminalWall: s.terminalWall, taperStart, egress };
}
