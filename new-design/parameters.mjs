// Main envelopes in mm from report_构型计算_完整版.md supplied by the user.
// Pipe diameters, blade profiles, fasteners and casing thickness remain schematic.
export const parameters = {
  units: 'mm',
  fan: { x: 130, front: 50, rear: 210, radius: 498, hubRadius: 100, blades: 8 },
  motor: { front: 245, rear: 438, radius: 150 },
  motorHousing: { front: 210, rear: 570, outer: 172, inner: 165 },
  compressor: { front: 570, rear: 660, outlet: 690, outer: 172, inner: 165 },
  stacks: [
    { front: 690, rear: 972, inner: 80, outer: 175.5, modules: 3, firstSeam: 30, cells: 279 },
    { front: 992, rear: 1367, inner: 150.5, outer: 217, modules: 4, firstSeam: 45, cells: 372 },
    { front: 1387, rear: 1762, inner: 192, outer: 248, modules: 4, firstSeam: 45, cells: 372 },
  ],
  moduleGapDegrees: 7,
  air: { outer: 24, inner: 18, end: 1840, branchOuter: 9, branchInner: 6.5, ringInset: 18 },
  hydrogen: { outer: 6.5, inner: 4.5, offset: 55, ringInset: 36, ringOuter: 5, ringInner: 3.4, inletX: 1880, faceOffset: 7.2 },
  pump: { front: 1630, rear: 1680, centerZ: 70, radius: 25, bore: 4.5 },
  outerShell: { front: 0, shoulder: 1762, rear: 2012, radius: 506, outletRadius: 472, wall: 6 },
  innerShell: { front: 690, shoulder: 1780, rear: 1940, inletRadius: 210, radius: 282, outletRadius: 218, wall: 5 },
  clearance: 0.8,
};
export const colors = {
  shell: '#8e979d', inner: '#8b949a', fan: '#c2cbd0', motor: '#ffc400', compressor: '#f6b900',
  air: '#087ec7', hydrogen: '#00b456', return: '#98e8b0', pump: '#f28b27', stack: '#363d43',
  plate: '#bac1c5', internal: '#68767a', shaft: '#dbab27',
};
