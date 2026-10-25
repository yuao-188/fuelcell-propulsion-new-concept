/** The fixed inlet guide also supports the first independent motor casing.
 * Coordinates describe installation geometry; they do not prescribe incidence
 * or claim a compressor aerodynamic operating point.
 */
export function getCompressorInletGuideLayout(P) {
  const K = P.compressor, G = K.inletGuide;
  const axialScale = (K.outlet - K.front) / 210, radialScale = K.inner / 165;
  const ax = nominal => K.front + (nominal - 480) * axialScale;
  const rr = nominal => nominal * radialScale;
  const lerp = (a, b, t) => a + (b - a) * t, smooth = t => t * t * (3 - 2 * t);
  const layout = { count: G.count, motorFront: ax(G.motorFront), motorRear: ax(G.motorRear),
    motorRadius: rr(33), rootRadius: rr(32.5), outerConstructionRadius: K.inner + rr(.5),
    innerCentreX: ax(G.innerCentreX), outerCentreX: ax(G.outerCentreX),
    innerChord: G.innerChord * axialScale, outerChord: G.outerChord * axialScale,
    maximumThickness: rr(G.thickness), sweepDeg: G.sweepDeg, phaseDeg: G.phaseDeg,
    inwardTurn: rr(G.inwardTurn), camber: rr(G.camber), spanSegments: 32, chordSegments: 24 };
  // span runs from motor to outer casing; chord runs from leading to trailing
  // edge. The downstream edge turns inward, while the centreline sweeps aft
  // towards the motor. A bowed span and cambered chord make a curved surface.
  const point = (span, chord, side = 0, index = 0) => {
    const r = lerp(layout.rootRadius, layout.outerConstructionRadius, span)
      - layout.inwardTurn * Math.sin(Math.PI * span) * chord ** 2;
    const x = lerp(layout.innerCentreX, layout.outerCentreX, smooth(span))
      + lerp(layout.innerChord, layout.outerChord, span) * (chord - .5);
    const centreAngle = (layout.phaseDeg + index * 360 / layout.count
      + layout.sweepDeg * smooth(span)) * Math.PI / 180;
    const camber = layout.camber * Math.sin(Math.PI * chord);
    // Finite, rounded-nose-scale edges keep the closed mesh well conditioned.
    const halfThickness = .5 * layout.maximumThickness * (.25 + .75 * Math.sin(Math.PI * chord));
    const theta = centreAngle + (camber + side * halfThickness) / r;
    return [x, r * Math.cos(theta), r * Math.sin(theta)];
  };
  return { ...layout, point };
}
