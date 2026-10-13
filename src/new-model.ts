import * as THREE from "three";

// All coordinates are physical millimetres. In particular, cell lengths,
// shell stations and flow paths now use the same axis without a hidden scale.
export const stackSizing = [
  { outerDiameter: 422, activeAxial: 120, mechanicalAxial: 124, activeRadial: 136, cells: 215 },
  { outerDiameter: 466, activeAxial: 103, mechanicalAxial: 107, activeRadial: 158, cells: 215 },
  { outerDiameter: 510, activeAxial: 90, mechanicalAxial: 94, activeRadial: 180, cells: 215 },
] as const;
export const stackFaces = [{ front: 350, rear: 474 }, { front: 524, rear: 631 }, { front: 681, rear: 775 }];
export const stations = stackFaces.map(({ front, rear }) => (front + rear) / 2);
export const boosterStations: number[] = [];
export const freshAirFanStation = 150;
export const ejectorXs = stackFaces.map(({ front }) => front - 25);
export const annularEjectorStations = ejectorXs;
export const injectorLayouts = ejectorXs.map((x, index) => ({
  x,
  feedStart: index === 0 ? 230 : x - 135,
  turnStart: x - 36,
  slotStart: x - 18,
  slotEnd: x + 18,
}));
export const galleryEndX = stackFaces.at(-1)!.rear + 200;
export const tailEndX = stackFaces.at(-1)!.rear + 265;
export const modelBounds = { minX: -455, maxX: tailEndX, radius: 528 };
export const stationRadii = stackSizing.map(stack => stack.outerDiameter / 2);
const stationInnerRadius = 75; // Mechanical bore diameter Ø150 mm.
const activeInnerRadius = stationInnerRadius;
export const axialMm = (x: number) => x;
// Convert only the inherited front-assembly coordinates. Applying this to
// those existing parts preserves the original fan, motor and drive geometry.
const frontMm = (x: number) => x <= 300 ? -450 + (x + 450) * 0.6 : (x - 300) * 1.25;
const frontLogical = (x: number) => x <= 0 ? (x + 450) / 0.6 - 450 : x / 1.25 + 300;

export type AirPath = "bypass" | "supply" | "reaction";
export type AirVisualPath = AirPath | "supplyInduction";
export type AssemblyPart = { group: THREE.Group; offset: THREE.Vector3 };
export type Rotor = { group: THREE.Group; axis: "x" | "y" | "z"; rate: number };

function interpolate(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return THREE.MathUtils.lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
  }
  return ys.at(-1)!;
}

export function stackRadiusAt(x: number) {
  return interpolate(stations, stationRadii, x);
}

// The lower wall retains the existing inlet/rim-fan envelope, then keeps a
// 27 mm radial allowance above each complete stack. Changes in diameter occur
// only in the 50 mm clear gaps, never across the active stack itself.
export function mainFlowOuterRadius(x: number) {
  if (x <= 225) return THREE.MathUtils.lerp(132, 202, THREE.MathUtils.smoothstep(frontLogical(x), 300, 620));
  if (x < injectorLayouts[0].slotStart) {
    const startRadius = THREE.MathUtils.lerp(132, 202, THREE.MathUtils.smoothstep(480, 300, 620));
    return THREE.MathUtils.lerp(startRadius, stationRadii[0] + 27, THREE.MathUtils.smoothstep(x, 225, injectorLayouts[0].slotStart));
  }
  for (let index = 0; index < stackFaces.length; index++) {
    if (x <= stackFaces[index].rear) return stationRadii[index] + 27;
    const next = stackFaces[index + 1];
    if (next && x < next.front) {
      return THREE.MathUtils.lerp(stationRadii[index] + 27, stationRadii[index + 1] + 27,
        THREE.MathUtils.smoothstep(x, stackFaces[index].rear, next.front));
    }
  }
  return THREE.MathUtils.lerp(stationRadii.at(-1)! + 27, stationRadii.at(-1)! - 30,
    THREE.MathUtils.smoothstep(x, stackFaces.at(-1)!.rear + 30, galleryEndX));
}

// Base gallery height before the extra upper-wall tail contraction.
export function freshGalleryThickness(x: number) {
  if (x <= 225) return THREE.MathUtils.lerp(76, 78, THREE.MathUtils.clamp((frontLogical(x) - 330) / (2200 - 330), 0, 1));
  const inletHeight = 76 + 2 * (480 - 330) / (2200 - 330);
  return THREE.MathUtils.lerp(inletHeight, 78, THREE.MathUtils.clamp((x - 225) / (galleryEndX - 225), 0, 1));
}

export function freshOuterRadius(x: number) {
  // The two tail walls retain at least 38 mm separation at the outlet.
  const extraTailContraction = 40 * THREE.MathUtils.smoothstep(x, stackFaces.at(-1)!.rear, galleryEndX);
  return mainFlowOuterRadius(x) + freshGalleryThickness(x) - extraTailContraction;
}

// The exterior skin has one continuous rising crown and one tail contraction.
// Keep the original radius above as the reference for all existing internal
// parts and streamlines; only the outer skin and its trim rings use this curve.
export function freshOuterSkinRadius(x: number) {
  if (x <= 225) return freshOuterRadius(x);
  const hermite = (start: number, end: number, r0: number, r1: number, m0: number, m1: number) => {
    const t = THREE.MathUtils.clamp((x - start) / (end - start), 0, 1);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * r0 + (t3 - 2 * t2 + t) * (end - start) * m0
      + (-2 * t3 + 3 * t2) * r1 + (t3 - t2) * (end - start) * m1;
  };
  const inletSlope = 70 * 6 * (180 / 320) * (1 - 180 / 320) / 400 + 2 / (1870 * 1.25);
  if (x <= 310) return hermite(225, 310, freshOuterRadius(225), 315, inletSlope, 0.14);
  if (x <= 775) return hermite(310, 775, 315, 370, 0.14, 0);
  return hermite(775, galleryEndX, 370, freshOuterRadius(galleryEndX), 0, 0);
}

const tailConeProfile = [
  [stackFaces.at(-1)!.rear + 31.25, 106], [stackFaces.at(-1)!.rear + 81.25, 121],
  [stackFaces.at(-1)!.rear + 128.125, 116], [stackFaces.at(-1)!.rear + 168.75, 88],
  [stackFaces.at(-1)!.rear + 210, 42], [tailEndX, 2],
];

function tailConeOuterRadius(x: number) {
  return interpolate(tailConeProfile.map(point => point[0]), tailConeProfile.map(point => point[1]), x);
}

// Only the short front-fan shroud exists. This reference radius is constant;
// it is not an invented outer wall over the downstream free bypass jet.
export function outerRadius(x: number) {
  void x;
  return 520;
}

export const polar = (x: number, radius: number, angle: number) => new THREE.Vector3(axialMm(x), radius * Math.cos(angle), radius * Math.sin(angle));

function metal(color: number, roughness = 0.26, metalness = 0.93) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
}

/** Closed thin annular shell. X is the propulsion axis. */
function shell(profile: number[][], thickness: number, material: THREE.Material, local = false) {
  const map = local ? (x: number) => x : axialMm;
  const points = profile.map(([x, radius]) => new THREE.Vector2(radius, map(x)));
  for (const [x, radius] of [...profile].reverse()) points.push(new THREE.Vector2(Math.max(1, radius - thickness), map(x)));
  points.push(points[0].clone());
  const geometry = new THREE.LatheGeometry(points, 112);
  geometry.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

function sampledShell(start: number, end: number, step: number, radius: (x: number) => number, thickness: number, material: THREE.Material) {
  const profile: number[][] = [];
  for (let x = start; x < end; x += step) profile.push([x, radius(x)]);
  profile.push([end, radius(end)]);
  return shell(profile, thickness, material);
}

function ring(x: number, radius: number, tubeRadius: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeRadius, 10, 112), material);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.x = axialMm(x);
  return mesh;
}

const frontShell = (profile: number[][], thickness: number, material: THREE.Material) => shell(profile.map(([x, radius]) => [frontMm(x), radius]), thickness, material);
const frontRing = (x: number, radius: number, tubeRadius: number, material: THREE.Material) => ring(frontMm(x), radius, tubeRadius, material);
const frontPolar = (x: number, radius: number, angle: number) => polar(frontMm(x), radius, angle);

function tube(points: THREE.Vector3[], radius: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, radius, 8, false), material);
}

function bladedRotor(radius: number, hub: number, count: number, material: THREE.Material, axialChord = 32) {
  const rotor = new THREE.Group();
  const positions: number[] = [], indices: number[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const r = hub + t * (radius - hub);
    const sweep = 0.25 * t * t;
    const angularChord = 0.19 - 0.055 * t;
    for (let side = 0; side < 2; side++) {
      const edge = side ? 1 : -1;
      positions.push(edge * (axialChord - t * axialChord * 0.38), r * Math.cos(sweep + edge * angularChord), r * Math.sin(sweep + edge * angularChord));
    }
    if (k < 12) {
      const i = k * 2;
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  for (let i = 0; i < count; i++) {
    const blade = new THREE.Mesh(geometry, material);
    blade.rotation.x = i * Math.PI * 2 / count;
    rotor.add(blade);
  }
  rotor.add(shell([[-28, hub], [28, hub]], 9, material, true));
  return rotor;
}

// Fixed outlet-guide vanes behind the main fan. Unlike the rotating blade
// geometry above, each vane has an axial camber line: it accepts residual
// swirl at the inlet and curves continuously toward an axial outlet angle.
function curvedOutletGuideVanes(radius: number, hub: number, count: number, material: THREE.Material, axialChord = 72) {
  const row = new THREE.Group();
  const radialSegments = 12;
  const chordSegments = 10;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex++) {
    const radialFraction = radialIndex / radialSegments;
    const r = THREE.MathUtils.lerp(hub, radius, radialFraction);
    for (let chordIndex = 0; chordIndex <= chordSegments; chordIndex++) {
      const chordFraction = chordIndex / chordSegments;
      const x = THREE.MathUtils.lerp(-axialChord / 2, axialChord / 2, chordFraction);
      // Strong inlet turning that relaxes quadratically to zero at exit.
      // A small spanwise reduction prevents all radii reading as one flat fin.
      const inletTurn = THREE.MathUtils.lerp(0.24, 0.18, radialFraction);
      const angle = inletTurn * (1 - chordFraction) * (1 - chordFraction);
      positions.push(x, r * Math.cos(angle), r * Math.sin(angle));
    }
  }
  const stride = chordSegments + 1;
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
    for (let chordIndex = 0; chordIndex < chordSegments; chordIndex++) {
      const a = radialIndex * stride + chordIndex;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  for (let index = 0; index < count; index++) {
    const vane = new THREE.Mesh(geometry, material);
    vane.rotation.x = index * Math.PI * 2 / count;
    row.add(vane);
  }
  return row;
}

// An annular blade row attached at its outer rim. There is deliberately no
// central hub, shaft or disk: the core remains open inside innerRadius.
function rimBladeRow(innerRadius: number, outerRadius: number, count: number, material: THREE.Material, axialChord: number) {
  const row = new THREE.Group();
  const positions: number[] = [], indices: number[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, t);
    const twist = 0.13 * (1 - t) + 0.08 * t * t;
    const halfPitch = THREE.MathUtils.lerp(0.14, 0.105, t);
    for (const side of [-1, 1]) {
      positions.push(side * axialChord * (1 - 0.22 * t), radius * Math.cos(twist + side * halfPitch), radius * Math.sin(twist + side * halfPitch));
    }
    if (k < 10) {
      const index = k * 2;
      indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  for (let bladeIndex = 0; bladeIndex < count; bladeIndex++) {
    const blade = new THREE.Mesh(geometry, material);
    blade.rotation.x = bladeIndex * Math.PI * 2 / count;
    row.add(blade);
  }
  return row;
}

function spinner(startX: number, endX: number, maximumRadius: number, material: THREE.Material) {
  return shell([
    [startX, 2],
    [THREE.MathUtils.lerp(startX, endX, 0.35), maximumRadius * 0.72],
    [THREE.MathUtils.lerp(startX, endX, 0.72), maximumRadius],
    [endX, maximumRadius],
  ], 1.5, material);
}

export function createNewConceptPropulsion() {
  const root = new THREE.Group();
  root.name = "NewConcept_HighBypass_ProgressiveStacks";
  const parts: AssemblyPart[] = [], rotors: Rotor[] = [], cutawayDetails: THREE.Group[] = [];
  const cutawayHidden: THREE.Group[] = [];
  const inductionSpriteMaterials: THREE.SpriteMaterial[] = [];
  const silver = metal(0xbfc8ce, 0.2);
  const brightSilver = metal(0xd5dde1, 0.17);
  const darkMetal = metal(0x596a76, 0.29);
  const titanium = metal(0x83929c, 0.24);
  const copper = metal(0xc57a42, 0.3);
  const driveMetal = metal(0xd6a43f, 0.22);
  const graphite = metal(0x27343d, 0.46, 0.55);

  const makePart = (name: string, explodedOffset: [number, number, number]) => {
    const group = new THREE.Group();
    group.name = name;
    root.add(group);
    parts.push({ group, offset: new THREE.Vector3(...explodedOffset) });
    return group;
  };

  const addAxialMotor = (part: THREE.Group, start: number, end: number, radius: number) => {
    // The housing remains part of the complete assembly. The stator, windings,
    // rotor and shaft are revealed only by the longitudinal cutaway view.
    part.add(frontShell([[start, radius], [end, radius]], 6, titanium.clone()));
    part.add(frontRing(start, radius - 4, 2, brightSilver));
    part.add(frontRing(end, radius - 4, 2, brightSilver));

    const interior = new THREE.Group();
    interior.name = "电机纵向剖面内部";
    part.add(interior);
    cutawayDetails.push(interior);

    const statorOuter = radius - 10;
    const rotorRadius = radius * 0.43;
    const shaftRadius = radius * 0.18;
    const coilRadius = radius - 19;
    interior.add(frontShell([[start + 8, statorOuter], [end - 8, statorOuter]], 15, darkMetal.clone()));
    interior.add(frontShell([[start + 3, rotorRadius], [end - 3, rotorRadius]], 8, brightSilver.clone()));
    interior.add(frontShell([[start - 10, shaftRadius], [end + 10, shaftRadius]], 5, titanium.clone()));
    for (let x = start + 16; x <= end - 16; x += 14) interior.add(frontRing(x, statorOuter - 3, 1.7, titanium.clone()));
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      interior.add(tube([frontPolar(start + 13, coilRadius, angle), frontPolar(end - 13, coilRadius, angle)], 4.2, copper.clone()));
    }

    // Explicit longitudinal section faces make the motor read as a cut-open
    // machine from oblique views instead of a set of rings around the shaft.
    const sectionMetal = brightSilver.clone();
    const sectionStator = darkMetal.clone();
    const sectionCopper = metal(0xe8933f, 0.2, 0.9);
    const sectionRotor = graphite.clone();
    const sectionShaft = titanium.clone();
    [sectionMetal, sectionStator, sectionCopper, sectionRotor, sectionShaft].forEach(material => {
      material.userData.noCutawayClip = true;
    });
    const sectionLength = end - start;
    const sectionFace = new THREE.Group();
    sectionFace.name = "电机剖切面";
    const addSectionBox = (length: number, height: number, x: number, y: number, z: number, material: THREE.Material) => {
      const width = frontMm(x + length / 2) - frontMm(x - length / 2);
      const face = new THREE.Mesh(new THREE.BoxGeometry(width, height, 5), material);
      face.position.set(frontMm(x), y, z);
      sectionFace.add(face);
    };
    const midX = (start + end) / 2;
    addSectionBox(sectionLength, 5, midX, radius - 3, 1, sectionMetal);
    addSectionBox(sectionLength, 5, midX, -radius + 3, 1, sectionMetal);
    addSectionBox(sectionLength - 16, 15, midX, statorOuter - 7.5, 3, sectionStator);
    addSectionBox(sectionLength - 16, 15, midX, -statorOuter + 7.5, 3, sectionStator);
    addSectionBox(sectionLength - 30, 11, midX, coilRadius, 7, sectionCopper);
    addSectionBox(sectionLength - 30, 11, midX, -coilRadius, 7, sectionCopper);
    addSectionBox(sectionLength - 6, rotorRadius * 2, midX, 0, 2, sectionRotor);
    addSectionBox(sectionLength + 20, shaftRadius * 2, midX, 0, 7, sectionShaft);
    [start + 14, end - 14].forEach(x => {
      addSectionBox(8, Math.max(8, coilRadius - rotorRadius - 5), x, (coilRadius + rotorRadius) / 2, 7, sectionCopper);
      addSectionBox(8, Math.max(8, coilRadius - rotorRadius - 5), x, -(coilRadius + rotorRadius) / 2, 7, sectionCopper);
    });
    interior.add(sectionFace);
  };

  const addShortDrive = (part: THREE.Group, fanX: number, motorStart: number) => {
    const transmission = new THREE.Group();
    transmission.name = "电机转子到风扇短轴传动";
    part.add(transmission);
    cutawayDetails.push(transmission);

    // Gold components rotate together: motor rotor coupling, short shaft and
    // fan-hub flange. Dark rings are the stationary radial/thrust bearings.
    transmission.add(frontShell([[fanX - 8, 25], [motorStart + 18, 25]], 22, driveMetal.clone()));
    transmission.add(frontShell([[fanX - 20, 62], [fanX + 18, 35]], 30, driveMetal.clone()));
    transmission.add(frontRing(fanX + 18, 34, 5, driveMetal.clone()));
    transmission.add(frontShell([[motorStart - 18, 45], [motorStart + 2, 45]], 13, darkMetal.clone()));
    transmission.add(frontRing(motorStart - 9, 31, 4.5, brightSilver.clone()));
    transmission.add(frontShell([[fanX + 19, 49], [fanX + 34, 49]], 14, darkMetal.clone()));
    transmission.add(frontRing(fanX + 27, 34, 4, brightSilver.clone()));
  };

  const casing = makePart("直筒式前风扇机匣", [0, 550, -250]);
  casing.add(frontShell([
    [-450, 520], [-380, 520], [-250, 520], [-145, 520], [-40, 520], [80, 520], [205, 520], [300, 520], [340, 520],
  ], 8, silver));
  casing.add(frontRing(-445, 520, 8, brightSilver));
  casing.add(frontRing(340, outerRadius(frontMm(340)), 4, darkMetal));

  const freshGallery = makePart("入口内壁渐扩与尾部双壁平顺收缩的新鲜空气环道", [0, 470, -130]);
  // A single smooth outer skin, including the tail contraction. Fine axial
  // sampling prevents the previously visible fold/overlap at its aft end.
  freshGallery.add(sampledShell(0, galleryEndX, 5, freshOuterSkinRadius, 7, brightSilver));
  // Split the inner wall at each ejector station so the annular injection
  // openings are real gaps rather than markings on a continuous surface.
  // Centre each 36 mm opening in its 50 mm inter-stack gap. It stays clear
  // of both stack mechanical faces (7 mm margin on either side).
  const wallSegments: Array<[number, number]> = [];
  let wallStart = 0;
  injectorLayouts.forEach(({ slotStart, slotEnd }) => {
    wallSegments.push([wallStart, slotStart]);
    wallStart = slotEnd;
  });
  wallSegments.push([wallStart, galleryEndX]);
  wallSegments.forEach(([start, end]) => freshGallery.add(sampledShell(start, end, 5, mainFlowOuterRadius, 6, darkMetal)));
  stations.forEach(x => {
    freshGallery.add(ring(x, freshOuterSkinRadius(x), 3, titanium));
    freshGallery.add(ring(x, mainFlowOuterRadius(x), 2.4, darkMetal));
  });

  // Single rim-driven annular pressure stage before the first 360-degree
  // bleed. Its fixed stator is bonded to the *outer* gallery wall; the blade
  // carrier rotates just inside it, separated by a visible radial air gap.
  // No central drive shaft obstructs the main/core flow.
  const freshFan = makePart("新鲜空气环道外缘驱动增压级", [0, 360, 130]);
  const fixedStator = new THREE.Group();
  fixedStator.name = "固定定子环与下游整流导叶";
  freshFan.add(fixedStator);
  const statorThermal = new THREE.Group();
  statorThermal.name = "温度显示-环道定子";
  fixedStator.add(statorThermal);
  statorThermal.add(sampledShell(frontMm(380), frontMm(480), 25, x => freshOuterRadius(x) - 5, 7, titanium));
  [395, 405, 420, 435, 445].map(frontMm).forEach(x => statorThermal.add(ring(x, freshOuterRadius(x) - 10, 2.5, copper)));
  const guideVanes = rimBladeRow(
    mainFlowOuterRadius(frontMm(470)) + 10,
    freshOuterRadius(frontMm(470)) - 12,
    11,
    brightSilver,
    8,
  );
  guideVanes.position.x = frontMm(470);
  fixedStator.add(guideVanes);

  const annularRotor = new THREE.Group();
  annularRotor.name = "外缘转子与环形叶片_无中央轮毂";
  annularRotor.position.x = axialMm(freshAirFanStation);
  const rotorOuterRadius = freshOuterRadius(freshAirFanStation) - 18;
  annularRotor.add(shell([[-22, rotorOuterRadius], [22, rotorOuterRadius]], 9, darkMetal, true));
  annularRotor.add(rimBladeRow(
    mainFlowOuterRadius(freshAirFanStation) + 14,
    rotorOuterRadius - 8,
    13,
    darkMetal,
    18,
  ));
  freshFan.add(annularRotor);
  rotors.push({ group: annularRotor, axis: "x", rate: 4.2 });

  const frontFan = makePart("直径1米主风扇", [-400, 0, 0]);
  const mainRotor = bladedRotor(500, 128, 8, darkMetal, 54);
  mainRotor.position.x = frontMm(-120);
  frontFan.add(mainRotor);
  rotors.push({ group: mainRotor, axis: "x", rate: 2.8 });
  frontFan.add(spinner(frontMm(-430), frontMm(-120), 124, brightSilver));

  const outletGuide = makePart("出口整流导叶", [-210, -230, 0]);
  const mainOutletGuideVanes = curvedOutletGuideVanes(492, 136, 12, titanium, 72);
  mainOutletGuideVanes.position.x = frontMm(38);
  outletGuide.add(mainOutletGuideVanes);
  outletGuide.add(frontShell([[0, 129], [78, 129]], 10, brightSilver));

  const driveMotor = makePart("前移加大的主驱动电机", [-80, -410, 0]);
  // Ø250 main motor is wholly upstream of stack 1's Ø150 bore.
  const mainMotorThermal = new THREE.Group();
  mainMotorThermal.name = "温度显示-主电机";
  driveMotor.add(mainMotorThermal);
  addAxialMotor(mainMotorThermal, 430, 520, 125);
  // Only the main fan retains a forward drive shaft. There is no common shaft
  // extending through the three stacks.
  addShortDrive(driveMotor, -120, 430);
  driveMotor.add(frontShell([[410, 62], [430, 125]], 7, brightSilver));

  stations.forEach((x, index) => {
    const part = makePart(`环形电堆 ${index + 1}`, [(index - 1) * 150, 0, 0]);
    const outer = stationRadii[index], inner = stationInnerRadius;
    const activeOuter = outer;
    const axialLength = stackSizing[index].activeAxial;
    // 215 cells cannot retain the old 3.2 mm tangential plate thickness at
    // Ø150 bore (pitch is only 2.19 mm). These 1 mm sheets are geometry-only.
    const cellGeometry = new THREE.BoxGeometry(axialLength, activeOuter - activeInnerRadius, 1);
    const cells = new THREE.InstancedMesh(cellGeometry, graphite, stackSizing[index].cells);
    const dummy = new THREE.Object3D();
    for (let cell = 0; cell < stackSizing[index].cells; cell++) {
      const angle = (cell + 0.5) * Math.PI * 2 / stackSizing[index].cells;
      dummy.position.copy(polar(x, (activeOuter + activeInnerRadius) / 2, angle));
      dummy.rotation.x = angle;
      dummy.updateMatrix();
      cells.setMatrixAt(cell, dummy.matrix);
    }
    cells.instanceMatrix.needsUpdate = true;
    part.add(cells);
    const { front, rear } = stackFaces[index];
    // Each 2 mm cap lies inside the mechanical envelope, immediately outside
    // the active face, rather than adding another 2 mm beyond that envelope.
    [[front, front + 2], [rear - 2, rear]].forEach(([left, right]) => {
      part.add(shell([[left, outer + 2], [right, outer + 2]], 2, copper));
      part.add(shell([[left, inner], [right, inner]], 2, copper));
    });
    for (let rod = 0; rod < 8; rod++) {
      const angle = rod * Math.PI / 4;
      part.add(tube([polar(front, outer + 5, angle), polar(rear, outer + 5, angle)], 2, brightSilver));
    }
  });

  // Full-annulus ejectors: each local capture shroud converges from the fresh
  // gallery into a narrow 360-degree slot in the core wall. The cyan ring is
  // the visible nozzle throat, not a fan.
  const ejectorThroat = new THREE.MeshStandardMaterial({
    color: 0x0ab8c7, emissive: 0x075864, emissiveIntensity: 0.72,
    roughness: 0.2, metalness: 0.78, side: THREE.DoubleSide,
  });
  injectorLayouts.forEach(({ x, feedStart, turnStart, slotStart, slotEnd }, index) => {
    const part = makePart(`360度环形引射器 ${index + 1}`, [(index - 1) * 210, 250, 0]);
    // A single thin guide wall runs close to the core-side wall of the fresh-
    // air gallery, exactly above the stack envelope. The existing core wall is
    // the opposite boundary, forming one uniformly narrow feeder slot.
    // The first mouth starts after the retained annular fan/stator; later
    // mouths start after the preceding hood, so collectors never overlap.
    const guideWallThickness = 3.5;
    const guideClearance = (atX: number) => {
      // Preserve exactly the 32-to-8 clear height and the existing endpoints;
      // ease only the contraction between them.
      const progress = THREE.MathUtils.smoothstep(atX, feedStart, turnStart);
      return THREE.MathUtils.lerp(32, 8, progress);
    };
    const guideRadius = (atX: number) => {
      // shell() subtracts its thickness toward the flow passage, therefore
      // add that thickness here so the clear flow height is truly 32 -> 8.
      return mainFlowOuterRadius(atX) + guideClearance(atX) + guideWallThickness;
    };
    const guideProfile: number[][] = [];
    for (let atX = feedStart; atX < turnStart; atX += 5) guideProfile.push([atX, guideRadius(atX)]);
    guideProfile.push(
      [turnStart, guideRadius(turnStart)],
      [x - 28, mainFlowOuterRadius(x - 28) + 11.5],
      // Span over the break in the lower wall, then blend the white shroud
      // into the downstream lower-wall segment.  The gas opening remains the
      // annular gap between the two lower-wall segments underneath this hood.
      [slotStart, mainFlowOuterRadius(slotStart) + 11.5],
      [x + 1, mainFlowOuterRadius(x + 1) + 8.5],
      [slotEnd, mainFlowOuterRadius(slotEnd) + guideWallThickness],
    );
    part.add(shell(guideProfile, guideWallThickness, brightSilver.clone()));
    // Mark only the upper lip of the bend.  Keep the lower-wall break fully
    // open so the fresh air can turn radially into the stack passage.
    part.add(ring(x - 16, mainFlowOuterRadius(x - 16) + 9.5, 1.25, ejectorThroat.clone()));
  });

  // The centre tail cone remains separate from the new, smoothly contracting
  // fresh-air passage; there is no extra annular throat or layered tail skin.
  const rearEjector = makePart("保留中央尾锥", [470, 90, 0]);
  rearEjector.add(shell(tailConeProfile, 1.8, brightSilver.clone()));

  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });

  const order = [frontFan, outletGuide, driveMotor, casing, freshGallery, freshFan,
    ...stations.flatMap((_, index) => [
      parts.find(part => part.group.name === `360度环形引射器 ${index + 1}`)!.group,
      parts.find(part => part.group.name === `环形电堆 ${index + 1}`)!.group,
    ]), rearEjector];

  root.updateMatrixWorld(true);
  const axialParts = order.map(group => ({ group, bounds: new THREE.Box3().setFromObject(group) }));
  const axialLayout = (amount: number) => {
    const gap = 70 + 220 * THREE.MathUtils.clamp(amount, 0, 1);
    const width = axialParts.reduce((sum, part) => sum + part.bounds.max.x - part.bounds.min.x, 0) + gap * (axialParts.length - 1);
    const center = (modelBounds.minX + modelBounds.maxX) / 2;
    let cursor = center - width / 2;
    const offsets = new Map<THREE.Group, number>();
    for (const part of axialParts) {
      offsets.set(part.group, cursor - part.bounds.min.x);
      cursor += part.bounds.max.x - part.bounds.min.x + gap;
    }
    return { offsets, minX: center - width / 2, maxX: center + width / 2 };
  };

  return { root, parts, rotors, cutawayDetails, cutawayHidden, inductionSpriteMaterials, axialLayout };
}

export function createAirPaths(): Record<AirVisualPath, THREE.CatmullRomCurve3[]> {
  const paths: Record<AirVisualPath, THREE.CatmullRomCurve3[]> = { bypass: [], supply: [], supplyInduction: [], reaction: [] };
  const curve = (points: THREE.Vector3[]) => new THREE.CatmullRomCurve3(points, false, "centripetal");
  const flowExitX = tailEndX + 350;
  // Match the spaces between the 215 radial sheets instead of sending a
  // streamline through an arbitrary solid plate angle.
  const channelAngle = (lane: number, count: number) => Math.floor(lane * stackSizing[0].cells / count) * Math.PI * 2 / stackSizing[0].cells;

  // The free bypass jet passes outside the fresh-air duct. It follows the
  // largest upstream duct radius and never turns back through the tail skin.
  const bypassEnvelope: Array<[number, number]> = [];
  let largestDuctRadius = freshOuterRadius(0);
  for (let x = 0; x < galleryEndX; x += 15) {
    largestDuctRadius = Math.max(largestDuctRadius, freshOuterRadius(x) + 3);
    bypassEnvelope.push([x, largestDuctRadius]);
  }
  bypassEnvelope.push([galleryEndX, largestDuctRadius]);
  const inletDuctRadius = freshOuterRadius(0);
  for (let lane = 0; lane < 180; lane++) {
    const angle = (lane % 30) / 30 * Math.PI * 2;
    const fraction = (Math.floor(lane / 30) + 0.5) / 6;
    const radius = (envelope: number) => THREE.MathUtils.lerp(envelope + 12, 488 + 0.70 * (envelope - inletDuctRadius), fraction);
    const inletRadius = radius(inletDuctRadius);
    const exitRadius = radius(largestDuctRadius);
    paths.bypass.push(curve([
      polar(-450, inletRadius, angle), polar(-252, inletRadius, angle),
      ...bypassEnvelope.map(([x, envelope]) => polar(x, radius(envelope), angle)),
      polar(tailEndX + 30, exitRadius, angle), polar(flowExitX, exitRadius, angle),
    ]));
  }

  // Upstream lanes pass inside the preserved rim-rotor carrier. After its
  // stator, the through-flow rises above each collector hood, leaving the
  // narrowing lower feeder passage to that stack's induction paths.
  for (let lane = 0; lane < 72; lane++) {
    const angle = (lane % 24) / 24 * Math.PI * 2;
    const layer = Math.floor(lane / 24);
    const radius = (x: number) => {
      const entryFraction = 0.26 + layer * 0.13;
      const hoodFraction = 0.64 + layer * 0.10;
      const fraction = THREE.MathUtils.lerp(entryFraction, hoodFraction, THREE.MathUtils.smoothstep(x, 180, 230));
      const inner = mainFlowOuterRadius(x) + 3;
      const outer = freshOuterRadius(x) - 10; // 7 mm skin plus 3 mm clearance.
      return THREE.MathUtils.lerp(inner, outer, fraction);
    };
    const points = [polar(-438, 146 + layer * 17, angle), polar(-120, 146 + layer * 17, angle)];
    for (let x = 0; x < galleryEndX; x += 5) points.push(polar(x, radius(x), angle));
    points.push(polar(galleryEndX, radius(galleryEndX), angle), polar(tailEndX + 30, radius(galleryEndX), angle), polar(flowExitX, radius(galleryEndX), angle));
    paths.supply.push(curve(points));
  }

  // Exactly 32 paths enter every collector. Each branch passes through its
  // real 36 mm wall opening and the immediately following stack only.
  injectorLayouts.forEach(({ x, feedStart, turnStart }, index) => {
    const { front, rear } = stackFaces[index];
    for (let lane = 0; lane < 32; lane++) {
      const angle = channelAngle(lane, 32);
      const targetRadius = THREE.MathUtils.lerp(125, stationRadii[index] - 15, 0.7);
      const points = [polar(feedStart - 12, mainFlowOuterRadius(feedStart - 12) + 17, angle)];
      for (let atX = feedStart; atX < turnStart; atX += 5) {
        const clearance = THREE.MathUtils.lerp(32, 8, THREE.MathUtils.smoothstep(atX, feedStart, turnStart));
        points.push(polar(atX, mainFlowOuterRadius(atX) + clearance * 0.48, angle));
      }
      points.push(
        polar(turnStart, mainFlowOuterRadius(turnStart) + 3.8, angle),
        polar(x - 20, mainFlowOuterRadius(x - 20) + 3.8, angle),
        polar(x - 11, mainFlowOuterRadius(x - 11) + 1.5, angle),
        polar(x, mainFlowOuterRadius(x) - 15, angle),
        polar(x + 12, targetRadius + 8, angle),
        polar(front - 2, targetRadius, angle),
        polar(front + 2, targetRadius, angle),
        polar(rear - 2, targetRadius, angle),
        polar(rear + 2, targetRadius, angle),
        polar(rear + 10, targetRadius, angle),
      );
      paths.supplyInduction.push(curve(points));
    }
  });

  for (let lane = 0; lane < 72; lane++) {
    const angle = channelAngle(lane % 18, 18);
    const fraction = 0.16 + Math.floor(lane / 18) * 0.22;
    const radius = (index: number) => THREE.MathUtils.lerp(136, stationRadii[index] - 12, fraction);
    const inletCoreRadius = (x: number) => {
      const inner = THREE.MathUtils.lerp(75, 130, THREE.MathUtils.smoothstep(x, 70, 162.5));
      return THREE.MathUtils.lerp(inner, mainFlowOuterRadius(x) - 12, fraction);
    };
    const points = [
      polar(-450, radius(0), angle), polar(-252, radius(0), angle),
      polar(-115, radius(0), angle), polar(-45, inletCoreRadius(0), angle),
    ];
    for (let x = 0; x <= 290; x += 10) points.push(polar(x, inletCoreRadius(x), angle));
    stackFaces.forEach(({ front, rear }, index) => {
      points.push(polar(front - 5, radius(index), angle), polar(front + 2, radius(index), angle),
        polar(rear - 2, radius(index), angle), polar(rear + 5, radius(index), angle));
    });
    const finalRear = stackFaces.at(-1)!.rear;
    const tailRadius = (x: number) => {
      const expansion = THREE.MathUtils.clamp((x - finalRear) / (tailEndX - finalRear), 0, 1);
      const inner = tailConeOuterRadius(x) + 14;
      const outer = THREE.MathUtils.lerp(stationRadii.at(-1)! - 15, mainFlowOuterRadius(x) - 14, expansion);
      return THREE.MathUtils.lerp(inner, outer, fraction);
    };
    tailConeProfile.forEach(([x]) => points.push(polar(x, tailRadius(x), angle)));
    const finalRadius = tailRadius(tailEndX);
    points.push(polar(tailEndX + 80, finalRadius, angle), polar(flowExitX, finalRadius, angle));
    paths.reaction.push(curve(points));
  }
  return paths;
}
