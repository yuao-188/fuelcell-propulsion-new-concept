// Relative modelling units only. No manufacturing dimensions are implied.
export const parameters = {
  units: 'relative',
  fan: { x: 0, radius: 500, hubRadius: 48, blades: 8 },
  motor: { front: 75, rear: 265, radius: 72 },
  motorHousing: { front: 60, rear: 280, outer: 105, inner: 98 },
  compressor: { front: 280, rear: 360, outlet: 405, outer: 105, inner: 98 },
  stacks: [
    { front: 460, rear: 590, inner: 80, outer: 170, modules: 3, firstSeam: 30 },
    { front: 700, rear: 815, inner: 145, outer: 245, modules: 4, firstSeam: 45 },
    { front: 930, rear: 1035, inner: 205, outer: 320, modules: 4, firstSeam: 45 },
  ],
  moduleGapDegrees: 7,
  air: { outer: 24, inner: 18, end: 1190, branchOuter: 9, branchInner: 6.5, ringInset: 18 },
  hydrogen: { outer: 6.5, inner: 4.5, offset: 55, ringInset: 36, ringOuter: 5, ringInner: 3.4, inletX: 1320 },
  pump: { front: 1135, rear: 1185, centerZ: 65, radius: 25, bore: 4.5 },
  outerShell: { front: -75, shoulder: 1120, rear: 1450, radius: 530, outletRadius: 395, wall: 6 },
  innerShell: { front: 410, shoulder: 1080, rear: 1280, inletRadius: 310, radius: 365, outletRadius: 295, wall: 5 },
  clearance: 0.8,
};
export const colors = {
  shell: '#8e979d', inner: '#8b949a', fan: '#c2cbd0', motor: '#ffc400', compressor: '#f6b900',
  air: '#087ec7', hydrogen: '#00b456', return: '#98e8b0', pump: '#f28b27', stack: '#363d43',
  plate: '#bac1c5', internal: '#68767a', shaft: '#dbab27',
};
