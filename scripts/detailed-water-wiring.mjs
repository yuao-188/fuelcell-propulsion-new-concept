/**
 * Two independent schematic gas/water separators. Dimensions are assembly
 * details, not a separator efficiency or pressure-drop calculation.
 *
 * Gas enters and leaves on the axial end faces. Offset internal baffle windows
 * leave a connected gas passage; the lower chamber communicates with a real
 * cup, open drain valve and an independent hollow tube to the tail.
 */
export function buildWaterManagement({ M, CS, P, C, union, cylinder, roundPath, tubePath, add }) {
  if (!M || !union || !cylinder || !roundPath || !tubePath || !add) {
    throw new Error('Water management requires the assembly geometry helpers');
  }
  const margin = P?.clearance ?? .8;
  const assemblies = [];

  function separator({ key, label, front, rear, centreY, centreZ, radius, gasInner, gasOuter, cupOuter }) {
    const x = (front + rear) / 2, length = rear - front, side = Math.sign(centreZ);
    const chamberRadius = radius - 3, cupInner = cupOuter - 2.5;
    const cupTop = centreY - chamberRadius + 1;
    const cupBottom = centreY - radius - 23;
    const valveTop = cupBottom - 6, valveBottom = valveTop - 12;
    const drainInner = 2, drainOuter = 3.5;
    const axial = xx => [xx, centreY, centreZ];
    const vertical = yy => [x, yy, centreZ];
    const inletPoint = axial(front - 8), outletPoint = axial(rear + 8);
    const port = point => ({ point, position: [...point], inner: gasInner, outer: gasOuter });

    // Integral flanges, short open gas stubs, cup and outlet neck. No cosmetic
    // rings are overlaid on the can: all contact regions belong to one solid.
    const canOuter = union([
      cylinder(axial(front), axial(front + 3), radius, radius, 64),
      cylinder(axial(front + 3), axial(front + 5), radius, radius - 1.2, 64),
      cylinder(axial(front + 5), axial(rear - 5), radius - 1.2, radius - 1.2, 64),
      cylinder(axial(rear - 5), axial(rear - 3), radius - 1.2, radius, 64),
      cylinder(axial(rear - 3), axial(rear), radius, radius, 64),
      cylinder(inletPoint, axial(front + 4), gasOuter, gasOuter, 40),
      cylinder(axial(rear - 4), outletPoint, gasOuter, gasOuter, 40),
      cylinder(vertical(cupBottom), vertical(cupTop), cupOuter, cupOuter, 48),
      cylinder(vertical(valveTop), vertical(cupBottom + 1), 4, 4, 32),
    ]);
    const rawGasBore = union([
      cylinder(axial(front + 3), axial(rear - 3), chamberRadius, chamberRadius, 64),
      cylinder(axial(front - 8.15), axial(front + 4), gasInner, gasInner, 40),
      cylinder(axial(rear - 4), axial(rear + 8.15), gasInner, gasInner, 40),
    ]);

    const drainControlPoints = [
      vertical(valveBottom),
      vertical(valveBottom - 25),
      [x + 38, valveBottom - 25, centreZ],
      [x + 76, -120, side * 130],
      [1990, -120, side * 130],
    ];
    const drainPath = roundPath(drainControlPoints, 8);
    const pipeBore = tubePath(drainPath, drainInner, .15);
    const cupBore = cylinder(vertical(cupBottom + 2), vertical(cupTop + 1), cupInner, cupInner, 48);
    const valveBore = cylinder(vertical(valveBottom - .15), vertical(cupBottom + 3), drainInner, drainInner, 32);
    const drainBore = union([cupBore, valveBore, pipeBore]);

    // Alternating windows make a baffle path. A separate bottom notch on each
    // baffle gives condensate a route into the shared lower collection region.
    // Exact seats are removed from the body, so every inserted baffle has a
    // mating surface but no duplicated material inside the shell.
    const baffles = [], baffleSeats = [];
    for (const [fraction, sign] of [[.3, 1], [.7, -1]]) {
      const bx = front + fraction * length;
      const disk = cylinder(axial(bx - .5), axial(bx + .5), chamberRadius + .4, chamberRadius + .4, 64);
      const windowY = centreY + sign * chamberRadius * .6;
      const window = cylinder([bx - .6, windowY, centreZ], [bx + .6, windowY, centreZ], chamberRadius * .58, chamberRadius * .58, 40);
      const drainNotch = cylinder([bx - .6, centreY - chamberRadius + 1, centreZ],
        [bx + .6, centreY - chamberRadius + 1, centreZ], 2, 2, 24);
      baffles.push(disk.subtract(union([window, drainNotch, drainBore])));
      baffleSeats.push(disk);
    }
    const baffleSolid = union(baffles);
    const gasBore = rawGasBore.subtract(baffleSolid);
    const can = canOuter.subtract(union([rawGasBore, drainBore, ...baffleSeats]));

    // Open valve body, a small external stem and a modest handle are one part.
    // Its lower face meets the tube end; the cavity continues across that face.
    const valveCentreY = (valveTop + valveBottom) / 2;
    const stem = cylinder([x, valveCentreY, centreZ + side * 5],
      [x, valveCentreY, centreZ + side * 10], 1.4, 1.4, 20);
    const handle = M.cube([10, 2, 2], true).translate([x, valveCentreY, centreZ + side * 10]);
    const valveOuter = union([
      cylinder(vertical(valveBottom), vertical(valveTop), 6, 6, 32),
      cylinder(vertical(valveTop - 2), vertical(valveTop), 6.8, 6.8, 12),
      cylinder(vertical(valveBottom), vertical(valveBottom + 2), 6.8, 6.8, 12),
      stem, handle,
    ]);
    const valve = valveOuter.subtract(drainBore);
    const pipeOuter = tubePath(drainPath, drainOuter);
    const pipe = pipeOuter.subtract(drainBore);
    const separatorGroup = `${key}Separator`, drainGroup = `${key}Drain`;
    const parts = [
      { id: `${key}-separator`, solid: can },
      { id: `${key}-separator-baffles`, solid: baffleSolid },
      { id: `${key}-drain-valve`, solid: valve },
      { id: `${key}-drain-pipe`, solid: pipe },
    ];
    add(parts[0].id, `${label}气水分离器 · 腔体与集水杯`, separatorGroup, '#8f9b9f', can,
      { clip: true, metallic: .72, roughness: .34, finish: 'machined', schematic: true });
    add(parts[1].id, `${label}分离器 · 交错挡板`, separatorGroup, '#adb9bd', baffleSolid,
      { clip: true, metallic: .7, roughness: .38, schematic: true });
    add(parts[2].id, `${label}独立排水阀`, drainGroup, '#737f85', valve,
      { clip: true, metallic: .7, roughness: .34, schematic: true });
    add(parts[3].id, `${label}独立尾部排水管`, drainGroup, '#99a5a9', pipe,
      { clip: true, metallic: .6, roughness: .38, schematic: true });

    // This is a reserved outer envelope, not a fluid cavity. The caller may use
    // it to keep other structures clear without deleting any separator walls.
    const clearance = union([
      cylinder(axial(front - margin), axial(rear + margin), radius + margin, radius + margin, 64),
      cylinder(axial(front - 8 - margin), axial(front + 4), gasOuter + margin, gasOuter + margin, 40),
      cylinder(axial(rear - 4), axial(rear + 8 + margin), gasOuter + margin, gasOuter + margin, 40),
      cylinder(vertical(cupBottom - margin), vertical(cupTop + margin), cupOuter + margin, cupOuter + margin, 48),
      cylinder(vertical(valveTop - margin), vertical(cupBottom + 1 + margin), 4 + margin, 4 + margin, 32),
      cylinder(vertical(valveBottom - margin), vertical(valveTop + margin), 6.8 + margin, 6.8 + margin, 32),
      M.cube([12 + 2 * margin, 5 + 2 * margin, 14 + 2 * margin], true)
        .translate([x, valveCentreY, centreZ + side * 6]),
      tubePath(drainPath, drainOuter + margin, margin),
    ]);
    const result = {
      inlet: port(inletPoint), outlet: port(outletPoint), gasBore, drainBore, clearance,
      drainOutlet: { point: drainPath.at(-1), position: [...drainPath.at(-1)], inner: drainInner, outer: drainOuter },
      parts, drainPath, drainControlPoints,
      dimensions: { front, rear, centre: [x, centreY, centreZ], radius, chamberRadius, cupOuter, cupInner,
        cupBottom, valveTop, valveBottom, baffleThickness: 1 },
    };
    assemblies.push(result);
    return result;
  }

  const anode = separator({ key: 'anode', label: '阳极', front: 1450, rear: 1510,
    centreY: -105, centreZ: -90, radius: 23, gasInner: 4.5, gasOuter: 6.5, cupOuter: 10 });
  const cathode = separator({ key: 'cathode', label: '阴极', front: 1685, rear: 1760,
    centreY: -105, centreZ: 90, radius: 27, gasInner: 9, gasOuter: 12, cupOuter: 12 });
  return {
    anode, cathode, clearance: union(assemblies.map(a => a.clearance)),
    parts: assemblies.flatMap(a => a.parts),
    verification: {
      dimensionStatus: 'schematic assembly detail; no separation efficiency claim',
      separatorCount: 2, independentDrainCount: 2, drainInnerDiameter: 4, drainOuterDiameter: 7,
      tailDrainPositions: [anode.drainOutlet.point, cathode.drainOutlet.point],
      groups: ['anodeSeparator', 'anodeDrain', 'cathodeSeparator', 'cathodeDrain'],
      baffleCountPerSeparator: 2, wiringIncluded: false,
    },
  };
}
