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
    { front: 740, rear: 1040, inner: 70, outer: 192, rearInner: 40, rearOuter: 162, modules: 1 },
    { front: 1140, rear: 1390, inner: 88, outer: 212, rearInner: 58, rearOuter: 182, modules: 1 },
    { front: 1490, rear: 1710, inner: 110, outer: 232, rearInner: 80, rearOuter: 202, modules: 1 },
  ],
  stackAppearance: { arrangement: 'schematic-concentric-frustum-lamellae', countIsIllustrative: true },
  air: { outer: 24, inner: 18, end: 1826, branchOuter: 5, branchInner: 3.5 },
  hydrogen: { outer: 4, inner: 2.5, inletX: 1876, headerRadius: 35, headerAngle: 135, rearOffset: 16,
    branchRearOffsets: [16,16,4.5],
    aftHeating: { frontOffset: 22, rearOffset: 36, radialInset: 35, turnDegrees: 360,
      outer: 3.3, inner: 2.1, rearEntryOffset: 1, stageStartAngles: [135,135,90] } },
  pump: { front: 1776, rear: 1816, centerY: -65, centerZ: 70, radius: 20, bore: 2.5 },
  outerShell: { front: 0, shoulder: 1710, rear: 1910, radius: 506, outletRadius: 476.2, wall: 6 },
  // Only the short stator hub support remains; there is no overall inner shell.
  statorSupport: { front: 232, rear: 288, inner: 243, radius: 248 },
  variableIntake: { stages: [2,3], petals: 24, activeLength: 90, frontAnchor: 'previous-midpoint', wall: 1.2,
    minimumRadialOffset: 20, maximumRadialOffset: 60, maxDeflectionDeg: 5,
    defaultOpening: .55 },
  interstage: { axialGap: 100, wall: 1.2, linerClearance: .8, tailGuideLength: 131 },
  clearance: 0.8,
};
/** Radius on the linear inner/outer wall of one truncated annular stack. */
export function stackRadiusAt(stack, x, side='outer') {
  const t=Math.max(0,Math.min(1,(x-stack.front)/(stack.rear-stack.front)));
  const front=stack[side],rear=stack[side==='inner'?'rearInner':'rearOuter'];
  return front+(rear-front)*t;
}
export const colors = {
  shell: '#8e979d', inner: '#8b949a', fan: '#c2cbd0', motor: '#ffc400', compressor: '#f6b900',
  air: '#087ec7', hydrogen: '#00b456', return: '#98e8b0', pump: '#f28b27', stack: '#363d43',
  plate: '#bac1c5', internal: '#68767a', shaft: '#dbab27',
  intakeOuter: '#477f9d', intakeInner: '#245670', compressorCase: '#c9a34b',
};
