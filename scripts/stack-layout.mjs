import { parameters as P } from '../new-design/parameters.mjs';

/** Layout for constant-thickness radial plates; all lengths are in mm. */
export function getStackLayout(s, options = {}) {
  const plateThickness = options.plateThickness ?? P.cells.plateThickness;
  const coolingGap = options.coolingGap ?? P.cells.innerCoolingGap;
  // Submicron relief preserves the nominal minimum after Float32 GLB export.
  const numericRelief = options.numericRelief ?? .0002;
  const constructedGap = coolingGap + numericRelief;
  const moduleGap = options.moduleGap ?? P.cells.moduleGap;
  const sealThickness = options.sealThickness ?? .5;
  const cellInner = s.cellInner ?? s.inner + 10;
  const cellOuter = s.cellOuter ?? s.outer - 3.001;
  const count = s.cells;
  if (!(Number.isInteger(count) && count > 1 && s.modules >= 1)) throw new Error('A stack requires its physical per-module cell count');
  if (!(s.inner < cellInner && cellInner < cellOuter && cellOuter < s.outer && s.front < s.rear)) {
    throw new Error('Invalid stack cell or mechanical envelope');
  }
  const halfPlate = plateThickness / 2;
  const cornerRadius = Math.hypot(cellOuter, halfPlate);
  // Adjacent inner corners have separation 2R sin(d/2) - t cos(d/2).
  const step = 2 * (Math.atan(halfPlate / cellInner)
    + Math.asin(constructedGap / Math.hypot(2 * cellInner, plateThickness)));
  // A full cooling gap is also retained at both radial end plates.
  const boundaryAngle = Math.atan(halfPlate / cellInner)
    + Math.asin(constructedGap / Math.hypot(cellInner, halfPlate));
  const activeAngle = (count - 1) * step + 2 * boundaryAngle;
  const modulePitch = 2 * Math.PI / s.modules;
  const gapAngle = 2 * Math.asin(moduleGap / (2 * s.inner));
  const sealAngle = sealThickness / cellInner;
  const sideFrameAngle = (modulePitch - gapAngle - activeAngle) / 2 - sealAngle;
  if (sideFrameAngle * cellInner < 2) throw new Error('Cell array leaves less than 2 mm for the radial end plates');
  if (s.outer - cornerRadius < 2.9) throw new Error('Cell corners leave insufficient outside frame thickness');
  const degrees = r => r * 180 / Math.PI;
  const modules = Array.from({ length: s.modules }, (_, j) => {
    const centre = (s.firstSeam ?? 0) * Math.PI / 180 + (j + .5) * modulePitch;
    const activeStart = centre - activeAngle / 2;
    const activeEnd = centre + activeAngle / 2;
    return {
      index: j,
      centre: degrees(centre),
      caseStart: degrees(centre - (modulePitch - gapAngle) / 2),
      caseEnd: degrees(centre + (modulePitch - gapAngle) / 2),
      activeStart: degrees(activeStart), activeEnd: degrees(activeEnd),
      plateAngles: Array.from({ length: count }, (_, k) => degrees(activeStart + boundaryAngle + k * step)),
      plateStart: degrees(activeStart + boundaryAngle), plateStep: degrees(step),
    };
  });
  return {
    plateThickness, coolingGap, constructedGap, numericRelief, count,
    cellInner, cellOuter, cellRadialLength: cellOuter - cellInner, cornerRadius,
    moduleGap, gapAngle: degrees(gapAngle), sealThickness, sealAngle: degrees(sealAngle),
    sideFrameMinimumThickness: sideFrameAngle * cellInner,
    outerCoolingGap: 2 * cellOuter * Math.sin(step / 2) - plateThickness * Math.cos(step / 2),
    moduleGapAtOuter: 2 * s.outer * Math.sin(gapAngle / 2), modules,
  };
}
