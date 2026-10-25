/** Open motor-bay liner with a short, smoothly contracting aft lip. */
export function getIntakeLinerLayout(P) {
  const I = P.intakeLiner, wall = I.outer - I.inner;
  const start = I.contractionStart, contraction = I.radialContraction;
  if (!(I.front < start && start < I.rear && contraction > 0 && I.inner > contraction)) {
    throw new Error('Invalid open intake-liner contraction');
  }
  if (start < P.motor.rear + P.clearance) throw new Error('Intake contraction starts too close to the main motor');
  if (wall <= 0) throw new Error('Intake liner must retain positive wall thickness');
  const smooth = t => t * t * (3 - 2 * t), outerAt = x => x <= start ? I.outer
    : I.outer - contraction * smooth(Math.min(1, (x - start) / (I.rear - start)));
  const outside = [[I.front, I.outer], [start, I.outer]];
  for (let i = 1; i <= 32; i++) {
    const x = start + (I.rear - start) * i / 32;
    outside.push([x, outerAt(x)]);
  }
  const inside = outside.map(([x, radius]) => [x, radius - wall]);
  // The liner is revolved with 128 segments by detailed-machinery. Its bore's
  // inscribed polygon remains outside the unchanged cylindrical motor envelope.
  const minimumMotorEnvelopeClearance = I.inner * Math.cos(Math.PI / 128) - P.motor.radius;
  if (minimumMotorEnvelopeClearance < P.clearance) throw new Error('The inlet liner obstructs the motor envelope');
  return { outside, inside, outerAt, wall, minimumMotorEnvelopeClearance,
    verification: { contractionStart: start, rear: I.rear, radialContraction: contraction,
      forwardInnerDiameter: 2 * I.inner, forwardOuterDiameter: 2 * I.outer,
      rearInnerDiameter: 2 * (I.inner - contraction), rearOuterDiameter: 2 * (I.outer - contraction),
      wall, minimumMotorEnvelopeClearance, axialGapAfterMotor: start - P.motor.rear,
      curve: 'cubic Hermite; zero slope at contraction start and open rear lip',
      frontOpen: true, rearOpen: true, angularSegments: 128, contractionSamples: 32 } };
}
