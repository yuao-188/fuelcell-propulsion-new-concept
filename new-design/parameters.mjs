// Dimensions in mm: report inputs plus user-confirmed radial cells and casings.
// Pipe diameters, small compressor drives, blade profiles and fasteners are schematic.
export const parameters = {
  units: 'mm',
  fan: { x: 130, front: 50, rear: 210, radius: 498, hubRadius: 100, blades: 12, stators: 18 },
  motor: { front: 245, rear: 438, radius: 150 },
  // Latest user sketch reallocates this shared bay: shorter intake, longer compressor.
  motorHousing: { front: 210, rear: 480, outer: 172, inner: 165 },
  intakeLiner: { front: 210, rear: 480, inner: 152, outer: 156, contractionStart: 440, radialContraction: 16 },
  compressor: { front: 480, rear: 660, outlet: 690, outer: 172, inner: 165,
    bladesPerStage: 18, backplateSegments: 512 },
  stacks: [
    { front: 690, rear: 972, inner: 128, outer: 236.701, cellInner: 138, cellOuter: 233.7, modules: 3, firstSeam: 30, cells: 279 },
    { front: 992, rear: 1367, inner: 234, outer: 313.501, cellInner: 244, cellOuter: 310.5, modules: 4, firstSeam: 45, cells: 372 },
    { front: 1387, rear: 1762, inner: 234, outer: 350, cellInner: 244, cellOuter: 346.999, modules: 4, firstSeam: 45, cells: 372 },
  ],
  cells: { plateThickness: .55, innerCoolingGap: .46, moduleGap: 1 },
  air: { outer: 24, inner: 18, end: 1840, branchOuter: 9, branchInner: 6.5 },
  hydrogen: { outer: 6.5, inner: 4.5, inletX: 1880 },
  pump: { front: 1630, rear: 1680, centerZ: 70, radius: 25, bore: 4.5 },
  // Red outline: retain the fan inlet, contract to a waist, then contract again aft.
  outerShell: { front: 0, taperStart: 210, waistStart: 850, waistRadius: 410, shoulder: 1762, rear: 2012, radius: 506, outletRadius: 292, wall: 6 },
  // End on stage 3's outer front rim; its circumference and aft end stay exposed.
  innerShell: { front: 210, expansionStart: 285, inletRadius: 248, firstStageRadius: 325,
    secondStageRadius: 345, wall: 5, terminalWall: 2, terminalTaperLength: 52 },
  clearance: 0.8,
};
export const colors = {
  shell: '#8e979d', inner: '#8b949a', fan: '#c2cbd0', motor: '#ffc400', compressor: '#f6b900',
  air: '#087ec7', hydrogen: '#00b456', return: '#98e8b0', pump: '#f28b27', stack: '#363d43',
  plate: '#bac1c5', internal: '#68767a', shaft: '#dbab27',
  intakeOuter: '#477f9d', intakeInner: '#245670', compressorCase: '#c9a34b',
};
