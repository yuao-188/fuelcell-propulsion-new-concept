// Dimensions in mm. User tables and clarification, 2026-11-09.
// Pipe diameters, small compressor drives, blade profiles and fasteners are schematic.
export const parameters = {
  units: 'mm',
  fan: { x: 130, front: 50, rear: 210, spinnerFront: 0, radius: 498, hubRadius: 100, blades: 16, stators: 18, tipAngleToAxisDeg: 66 },
  motor: { front: 245, rear: 438, radius: 150 },
  // Latest user sketch reallocates this shared bay: shorter intake, longer compressor.
  motorHousing: { front: 210, rear: 480, outer: 172, inner: 165 },
  intakeLiner: { front: 210, rear: 480, inner: 152, outer: 156, contractionStart: 440, radialContraction: 16 },
  compressor: { front: 480, rear: 703, outlet: 740, outer: 172, inner: 165,
    bladesPerStage: 18, backplateSegments: 512,
    stages: [
      { bladeOuter: 162.8, backplateRadius: 143.8, diffuserFront: 552, diffuserRear: 567, diffuserInner: 148.2 },
      { bladeOuter: 134.8, backplateRadius: 114.8, diffuserFront: 619, diffuserRear: 629, diffuserInner: 119.2 },
    ] },
  stacks: [
    { front: 740, rear: 1211, inner: 50, outer: 177, cellInner: 50, cellOuter: 177, modules: 1, cells: 311 },
    { front: 1231, rear: 1651, inner: 73, outer: 197, cellInner: 73, cellOuter: 197, modules: 1, cells: 455 },
    { front: 1671, rear: 2064, inner: 95, outer: 217, cellInner: 95, cellOuter: 217, modules: 1, cells: 591 },
  ],
  cells: { plateThickness: .281, innerCoolingGap: .729, nominalPitch: 1.01, moduleGap: 0 },
  air: { outer: 24, inner: 18, end: 2180, branchOuter: 5, branchInner: 3.5 },
  hydrogen: { outer: 4, inner: 2.5, inletX: 2230 },
  pump: { front: 2130, rear: 2170, centerY: -65, centerZ: 70, radius: 20, bore: 2.5 },
  outerShell: { front: 0, shoulder: 2064, rear: 2264, radius: 506, outletRadius: 476.2, wall: 6 },
  // Only the short stator hub support remains; there is no overall inner shell.
  statorSupport: { front: 232, rear: 288, inner: 243, radius: 248 },
  variableIntake: { stages: [2,3], petals: 24, length: 90, wall: 1.2,
    minimumRadialOffset: 20, maximumRadialOffset: 60, maxDeflectionDeg: 5,
    defaultOpening: .55 },
  interstage: { axialGap: 20, wall: 1.2, linerClearance: .8 },
  clearance: 0.8,
};
export const colors = {
  shell: '#8e979d', inner: '#8b949a', fan: '#c2cbd0', motor: '#ffc400', compressor: '#f6b900',
  air: '#087ec7', hydrogen: '#00b456', return: '#98e8b0', pump: '#f28b27', stack: '#363d43',
  plate: '#bac1c5', internal: '#68767a', shaft: '#dbab27',
  intakeOuter: '#477f9d', intakeInner: '#245670', compressorCase: '#c9a34b',
};
