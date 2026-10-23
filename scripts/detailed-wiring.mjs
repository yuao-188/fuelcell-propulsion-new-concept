/** A small insulated multicore harness, not a circuit diagram or a common bus. */
export function buildWiring({ M, P, C, union, cylinder, tubePath, roundPath, polar, add }) {
  const angle = 330, sheathRadius = 2.4, branchRadius = 1.8;
  const shell = P.innerShell, smooth = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const midStation = shell.midStation ?? shell.shoulder, midRadius = shell.midRadius ?? shell.radius;
  const shellRadius = x => x <= shell.expansionStart ? shell.inletRadius
    : x <= midStation ? lerp(shell.inletRadius, midRadius, smooth((x - shell.expansionStart) / (midStation - shell.expansionStart)))
    : x <= shell.shoulder ? lerp(midRadius, shell.radius, smooth((x - midStation) / (shell.shoulder - midStation)))
    : lerp(shell.radius, shell.outletRadius, smooth((x - shell.shoulder) / (shell.rear - shell.shoulder)));
  // Match the actual sampled grey shell, including its piecewise-linear seats.
  const shellProfile = [[shell.front, shell.inletRadius], [shell.expansionStart, shell.inletRadius]];
  for (let i = 1; i <= 96; i++) {
    const x = lerp(shell.expansionStart, shell.shoulder, i / 96); shellProfile.push([x, shellRadius(x)]);
  }
  for (let i = 1; i <= 40; i++) {
    const x = lerp(shell.shoulder, shell.rear, i / 40); shellProfile.push([x, shellRadius(x)]);
  }
  const routeRadius = x => {
    if (x <= shellProfile[0][0]) return shellProfile[0][1] - shell.wall - 7;
    if (x >= shellProfile.at(-1)[0]) return shellProfile.at(-1)[1] - shell.wall - 7;
    const index = shellProfile.findIndex(point => point[0] >= x);
    const a = shellProfile[index - 1], b = shellProfile[index];
    return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])) - shell.wall - 7;
  };
  const at = (x, radius) => polar(x, radius, angle);
  const centre = point => at(point, routeRadius(point));
  const stageMid = P.stacks.map(s => (s.front + s.rear) / 2);
  const routeStart = P.compressor.front + 170, routeEnd = stageMid.at(-1) + 100;
  const boxX = P.compressor.front + 140, boxRadius = 210;
  const stations = [...new Set([routeStart, routeEnd, ...stageMid,
    ...stageMid.map(x => x - 45), ...shellProfile.map(point => point[0])])]
    .filter(x => x >= routeStart && x <= routeEnd).sort((a, b) => a - b);
  // Keep the first bend beyond the gland's rear face. The former +22 mm
  // station started its fillet inside the gland and clipped its metal rim.
  const mainPath = roundPath([at(boxX + 10, boxRadius), at(boxX + 30, boxRadius), ...stations.map(centre)], 6);
  const harness = [tubePath(mainPath, sheathRadius)];
  const connectors = [], clampPieces = [], branchPaths = [];

  // An accessible small enclosure is the external electrical interface. The
  // harness passes through its rear gland; there is no invented motor feedthrough.
  const boxOuter = M.cube([28, 16, 22], true).translate([boxX, boxRadius, 0]).rotate([angle, 0, 0]);
  const boxInner = M.cube([24, 12, 18], true).translate([boxX, boxRadius, 0]).rotate([angle, 0, 0]);
  const gland = cylinder(at(boxX + 14, boxRadius), at(boxX + 20, boxRadius), 4.2, 4.2, 40);
  const glandBore = cylinder(at(boxX + 9, boxRadius), at(boxX + 21, boxRadius), 2.8, 2.8, 40);
  connectors.push(union([boxOuter, gland]).subtract(union([boxInner, glandBore])));

  P.stacks.forEach((s, i) => {
    const x = stageMid[i], terminalX = x + 18;
    const terminalBottom = s.outer + .06, terminalTop = s.outer + 6;
    const branch = roundPath([centre(x), at(x + 12, routeRadius(x)),
      at(terminalX, s.outer + 9), at(terminalX, s.outer + 2)], 4);
    branchPaths.push(branch); harness.push(tubePath(branch, branchRadius));
    const socket = cylinder(at(terminalX, terminalBottom), at(terminalX, terminalTop), 4.2, 4.2, 32);
    const socketBore = cylinder(at(terminalX, s.outer + 1.5), at(terminalX, terminalTop + .15), 2.1, 2.1, 32);
    connectors.push(socket.subtract(socketBore));

    // Each narrow clamp has a sleeve clearance around the insulation and a
    // small radial foot meeting only the outside frame, never a cooling face.
    const clampX = x - 45, clampRadius = routeRadius(clampX);
    const a = centre(clampX - 1.3), b = centre(clampX + 1.3);
    const loop = cylinder(a, b, 5.1, 5.1, 40);
    const clearance = cylinder(centre(clampX - 2), centre(clampX + 2), 3.2, 3.2, 40);
    const foot = cylinder(at(clampX, s.outer + .06), at(clampX, clampRadius - 4.6), 1.8, 1.8, 32);
    clampPieces.push(union([loop, foot]).subtract(clearance));
  });

  const parts = [
    { id: 'wiring-harness', name: '多芯绝缘线束 · 整束外护套与三级短分支', color: '#303b44', solid: union(harness),
      finish: 'insulated-multicore-sheath', metallic: .04, roughness: .62 },
    { id: 'wiring-connectors', name: '外部电路接口盒与独立表面接头', color: '#64727b', solid: union(connectors),
      finish: 'satin-connector-shell', metallic: .66, roughness: .36 },
    { id: 'wiring-clamps', name: '三只线束固定卡箍', color: '#7b8991', solid: union(clampPieces),
      finish: 'machined-steel', metallic: .8, roughness: .32 },
  ];
  for (const part of parts) {
    if (part.solid.status() !== 'NoError' || !(part.solid.volume() > 0)) throw new Error(`${part.id}: invalid wiring solid`);
    add(part.id, part.name, 'wiring', part.color, part.solid,
      { clip: true, finish: part.finish, metallic: part.metallic, roughness: part.roughness,
        electricalRepresentation: 'multicore external sheath; not equipotential bus', schematic: true });
  }
  void C;
  return { parts, verification: { parts: parts.length, bundles: 1, shortBranches: branchPaths.length,
    frameConnectors: connectors.length - 1, clamps: clampPieces.length, angleDegrees: angle,
    sheathDiameter: 2 * sheathRadius, branchDiameter: 2 * branchRadius,
    interfaceBoxCentre: at(boxX, boxRadius), routeStart, routeEnd,
    representation: 'insulated multicore harness only; no conductor interconnection or power-electronics design' },
    mainPath, branchPaths };
}
