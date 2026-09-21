import * as THREE from "three";

// Within each two-stack zone, the downstream stack is pulled forward so its
// front collector ring meets the annular injection plane without a floating
// axial gap. Larger inter-zone gaps remain for the booster fan and motor.
// The inherited site uses a compact logical X layout. Map it onto the new
// millimetre layout so ducts, ejectors, fans and particles move together.
export const stations = [620, 820, 1180, 1380, 1740, 1940];
export const boosterStations = [1020, 1580];
export const freshAirFanStation = 420;
// Three full-annulus ejectors sit in the clear gaps between stacks 1-2, 3-4
// and 5-6. They replace the former discrete wall-mounted suction fans.
export const annularEjectorStations = [740, 1300, 1860];
export const stackSizing = [
  { outerDiameter: 350, activeAxial: 136, mechanicalAxial: 140, activeRadial: 100, cells: 215 },
  { outerDiameter: 430, activeAxial: 136, mechanicalAxial: 140, activeRadial: 140, cells: 215 },
  { outerDiameter: 510, activeAxial: 116, mechanicalAxial: 120, activeRadial: 180, cells: 215 },
  { outerDiameter: 510, activeAxial: 96, mechanicalAxial: 100, activeRadial: 180, cells: 215 },
  { outerDiameter: 590, activeAxial: 76, mechanicalAxial: 80, activeRadial: 220, cells: 215 },
  { outerDiameter: 590, activeAxial: 56, mechanicalAxial: 60, activeRadial: 220, cells: 215 },
] as const;
export const stationRadii = stackSizing.map(stack => stack.outerDiameter / 2);
const stationInnerRadius = 75; // Mechanical bore diameter Ø150 mm.
const activeInnerRadius = stationInnerRadius;
const outerFrame = 0;

// Reference points include both mechanical faces of all six stacks. The
// Pair gaps stay at 50 mm for the 36 mm annular injection slots. Shorten the
// inlet-to-stack run again and shorten both booster bays to 160 mm. The
// motor housings are shortened independently; the three 50 mm injection gaps
// must remain untouched.
const logicalAxial = [-450, 300, 540, 620, 700, 740, 820, 900, 1020, 1100, 1180, 1260, 1300, 1380, 1460, 1580, 1660, 1740, 1820, 1860, 1940, 2020, 2340, 2890];
const physicalAxial = [-450, 0, 300, 370, 440, 465, 560, 630, 710, 790, 850, 910, 935, 1010, 1060, 1140, 1220, 1260, 1300, 1325, 1380, 1410, 1610, 2160];

function mapPiecewise(x: number, from: number[], to: number[]) {
  const last = from.length - 1;
  if (x <= from[0]) return to[0] + (x - from[0]) * (to[1] - to[0]) / (from[1] - from[0]);
  if (x >= from[last]) return to[last] + (x - from[last]) * (to[last] - to[last - 1]) / (from[last] - from[last - 1]);
  for (let i = 1; i <= last; i++) {
    if (x <= from[i]) return THREE.MathUtils.lerp(to[i - 1], to[i], (x - from[i - 1]) / (from[i] - from[i - 1]));
  }
  return to[last];
}

export const axialMm = (logicalX: number) => mapPiecewise(logicalX, logicalAxial, physicalAxial);
const logicalAtMm = (physicalX: number) => mapPiecewise(physicalX, physicalAxial, logicalAxial);

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

// The core boundary follows the strongly increasing stack diameter.
export function mainFlowOuterRadius(x: number) {
  if (x < stations[0]) {
    // The lower wall forms the visibly flared inlet ahead of the Ø250 motor.
    // Its radius is still >125 mm everywhere the motor housing exists.
    const t = THREE.MathUtils.smoothstep(x, 300, stations[0]);
    return THREE.MathUtils.lerp(132, stationRadii[0] + 27, t);
  }
  if (x <= stations.at(-1)!) return stackRadiusAt(x) + 27;
  if (x <= 2050) return THREE.MathUtils.lerp(stationRadii.at(-1)! + 27, stationRadii.at(-1)! + 35, THREE.MathUtils.smoothstep(x, stations.at(-1)!, 2050));
  // Figure 1: start aft contraction behind stack 6. The core wall and the
  // fresh-air outer wall use the same smooth envelope without crossing.
  return THREE.MathUtils.lerp(stationRadii.at(-1)! + 35, stationRadii.at(-1)! - 30, THREE.MathUtils.smoothstep(x, 2050, 2340));
}

// Base gallery height before the extra upper-wall tail contraction.
export function freshGalleryThickness(x: number) {
  const t = THREE.MathUtils.clamp((x - 330) / (2200 - 330), 0, 1);
  return THREE.MathUtils.lerp(76, 78, t);
}

export function freshOuterRadius(x: number) {
  // Follow the smoothly expanding inner wall, preserving the reduced annular
  // clearance rather than leaving the upper skin floating above the inlet.
  // After stack 6 the upper wall approaches it another 24 units.
  const extraTailContraction = 24 * THREE.MathUtils.smoothstep(x, 2050, 2340);
  return mainFlowOuterRadius(x) + freshGalleryThickness(x) - extraTailContraction;
}

function tailConeOuterRadius(x: number) {
  return interpolate(
    [1940, 2070, 2150, 2225, 2290, 2350, 2405, 2500],
    [105, 106, 121, 116, 88, 42, 2, 0],
    x,
  );
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
    part.add(shell([[start, radius], [end, radius]], 6, titanium.clone()));
    part.add(ring(start, radius - 4, 2, brightSilver));
    part.add(ring(end, radius - 4, 2, brightSilver));

    const interior = new THREE.Group();
    interior.name = "电机纵向剖面内部";
    part.add(interior);
    cutawayDetails.push(interior);

    const statorOuter = radius - 10;
    const rotorRadius = radius * 0.43;
    const shaftRadius = radius * 0.18;
    const coilRadius = radius - 19;
    interior.add(shell([[start + 8, statorOuter], [end - 8, statorOuter]], 15, darkMetal.clone()));
    interior.add(shell([[start + 3, rotorRadius], [end - 3, rotorRadius]], 8, brightSilver.clone()));
    interior.add(shell([[start - 10, shaftRadius], [end + 10, shaftRadius]], 5, titanium.clone()));
    for (let x = start + 16; x <= end - 16; x += 14) interior.add(ring(x, statorOuter - 3, 1.7, titanium.clone()));
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      interior.add(tube([polar(start + 13, coilRadius, angle), polar(end - 13, coilRadius, angle)], 4.2, copper.clone()));
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
      const width = axialMm(x + length / 2) - axialMm(x - length / 2);
      const face = new THREE.Mesh(new THREE.BoxGeometry(width, height, 5), material);
      face.position.set(axialMm(x), y, z);
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
    transmission.add(shell([[fanX - 8, 25], [motorStart + 18, 25]], 22, driveMetal.clone()));
    transmission.add(shell([[fanX - 20, 62], [fanX + 18, 35]], 30, driveMetal.clone()));
    transmission.add(ring(fanX + 18, 34, 5, driveMetal.clone()));
    transmission.add(shell([[motorStart - 18, 45], [motorStart + 2, 45]], 13, darkMetal.clone()));
    transmission.add(ring(motorStart - 9, 31, 4.5, brightSilver.clone()));
    transmission.add(shell([[fanX + 19, 49], [fanX + 34, 49]], 14, darkMetal.clone()));
    transmission.add(ring(fanX + 27, 34, 4, brightSilver.clone()));
  };

  const casing = makePart("直筒式前风扇机匣", [0, 550, -250]);
  casing.add(shell([
    [-450, 520], [-380, 520], [-250, 520], [-145, 520], [-40, 520], [80, 520], [205, 520], [300, 520], [340, 520],
  ], 8, silver));
  casing.add(ring(-445, 520, 8, brightSilver));
  casing.add(ring(340, outerRadius(340), 4, darkMetal));

  const freshGallery = makePart("入口内壁渐扩与尾部双壁平顺收缩的新鲜空气环道", [0, 470, -130]);
  // A single smooth outer skin, including the tail contraction. Fine axial
  // sampling prevents the previously visible fold/overlap at its aft end.
  freshGallery.add(sampledShell(300, 2340, 25, freshOuterRadius, 7, brightSilver));
  // Split the inner wall at each ejector station so the annular injection
  // openings are real gaps rather than markings on a continuous surface.
  // Centre each 36 mm opening in its 50 mm inter-stack gap. It stays clear
  // of both stack mechanical faces (7 mm margin on either side).
  const breaks = annularEjectorStations.map(x => [logicalAtMm(axialMm(x) - 18), logicalAtMm(axialMm(x) + 18)] as const);
  [[300, breaks[0][0]], [breaks[0][1], breaks[1][0]], [breaks[1][1], breaks[2][0]]].forEach(([start, end]) => {
    freshGallery.add(sampledShell(start, end, 25, mainFlowOuterRadius, 6, darkMetal));
  });
  freshGallery.add(sampledShell(breaks[2][1], 2340, 25, mainFlowOuterRadius, 5, darkMetal));
  [620, 1180, 1740].forEach(x => {
    freshGallery.add(ring(x, freshOuterRadius(x), 3, titanium));
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
  statorThermal.add(sampledShell(380, 480, 20, x => freshOuterRadius(x) - 5, 7, titanium));
  [395, 405, 420, 435, 445].forEach(x => statorThermal.add(ring(x, freshOuterRadius(x) - 10, 2.5, copper)));
  const guideVanes = rimBladeRow(
    mainFlowOuterRadius(470) + 10,
    freshOuterRadius(470) - 12,
    11,
    brightSilver,
    8,
  );
  guideVanes.position.x = axialMm(470);
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
  mainRotor.position.x = axialMm(-120);
  frontFan.add(mainRotor);
  rotors.push({ group: mainRotor, axis: "x", rate: 2.8 });
  frontFan.add(spinner(-430, -120, 124, brightSilver));

  const outletGuide = makePart("出口整流导叶", [-210, -230, 0]);
  const guideRotor = bladedRotor(492, 128, 12, titanium, 24);
  guideRotor.position.x = axialMm(38);
  outletGuide.add(guideRotor);
  outletGuide.add(shell([[0, 129], [78, 129]], 10, brightSilver));

  const driveMotor = makePart("前移加大的主驱动电机", [-80, -410, 0]);
  // Ø250 main motor is wholly upstream of stack 1's Ø150 bore.
  const mainMotorThermal = new THREE.Group();
  mainMotorThermal.name = "温度显示-主电机";
  driveMotor.add(mainMotorThermal);
  addAxialMotor(mainMotorThermal, 430, 520, 125);
  // Only the main fan retains a forward drive shaft. There is no common shaft
  // extending through all six stacks.
  addShortDrive(driveMotor, -120, 430);
  driveMotor.add(shell([[410, 62], [430, 125]], 7, brightSilver));

  stations.forEach((x, index) => {
    const part = makePart(`环形电堆 ${index + 1}`, [(index - 2.5) * 150, 0, 0]);
    const outer = stationRadii[index], inner = stationInnerRadius;
    const activeOuter = outer - outerFrame;
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
    const halfLength = stackSizing[index].mechanicalAxial / 2;
    [-1, 1].forEach(side => {
      const centerMm = axialMm(x) + side * halfLength;
      const left = logicalAtMm(centerMm - 2);
      const right = logicalAtMm(centerMm + 2);
      part.add(shell([[left, outer + 2], [right, outer + 2]], 2, copper));
      part.add(shell([[left, inner], [right, inner]], 2, copper));
    });
    for (let rod = 0; rod < 8; rod++) {
      const angle = rod * Math.PI / 4;
      const start = logicalAtMm(axialMm(x) - halfLength);
      const end = logicalAtMm(axialMm(x) + halfLength);
      part.add(tube([polar(start, outer + 5, angle), polar(end, outer + 5, angle)], 2, brightSilver));
    }
  });

  boosterStations.forEach((x, index) => {
    const part = makePart(`区间增压风扇 ${index + 1}`, [(index - 0.5) * 250, 150, 0]);
    const radius = mainFlowOuterRadius(x) - 13;
    const rotor = bladedRotor(radius, 74, 9, darkMetal, 24);
    rotor.position.x = axialMm(x);
    part.add(rotor);
    rotors.push({ group: rotor, axis: "x", rate: 5.6 });
    part.add(shell([[x - 34, 74], [x + 34, 74]], 9, titanium));
    part.add(ring(x, radius + 5, 5, brightSilver));
    const motorCenterMm = axialMm(stations[index === 0 ? 2 : 4]);
    const motorStart = logicalAtMm(motorCenterMm - 20);
    const motorEnd = logicalAtMm(motorCenterMm + 20);
    const boosterMotorThermal = new THREE.Group();
    boosterMotorThermal.name = `温度显示-区间电机${index + 1}`;
    part.add(boosterMotorThermal);
    addAxialMotor(boosterMotorThermal, motorStart, motorEnd, 74);
    addShortDrive(part, x, motorStart);
    part.add(shell([[x + 22, 74], [motorStart, 74]], 5, brightSilver));
  });

  // Full-annulus ejectors: each local capture shroud converges from the fresh
  // gallery into a narrow 360-degree slot in the core wall. The cyan ring is
  // the visible nozzle throat, not a fan.
  const ejectorThroat = new THREE.MeshStandardMaterial({
    color: 0x0ab8c7, emissive: 0x075864, emissiveIntensity: 0.72,
    roughness: 0.2, metalness: 0.78, side: THREE.DoubleSide,
  });
  annularEjectorStations.forEach((x, index) => {
    const part = makePart(`360度环形引射器 ${index + 1}`, [(index - 1) * 210, 250, 0]);
    // A single thin guide wall runs close to the core-side wall of the fresh-
    // air gallery, exactly above the stack envelope. The existing core wall is
    // the opposite boundary, forming one uniformly narrow feeder slot.
    const feedStart = x - 252;
    const turnStart = x - 54;
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
    for (let atX = feedStart; atX < turnStart; atX += 12) guideProfile.push([atX, guideRadius(atX)]);
    guideProfile.push(
      [turnStart, guideRadius(turnStart)],
      [x - 28, mainFlowOuterRadius(x - 28) + 11.5],
      // Span over the break in the lower wall, then blend the white shroud
      // into the downstream lower-wall segment.  The gas opening remains the
      // annular gap between the two lower-wall segments underneath this hood.
      [x - 18, mainFlowOuterRadius(x - 18) + 11.5],
      [x + 1, mainFlowOuterRadius(x + 1) + 8.5],
      [x + 18, mainFlowOuterRadius(x + 18) + guideWallThickness],
    );
    part.add(shell(guideProfile, guideWallThickness, brightSilver.clone()));
    // Mark only the upper lip of the bend.  Keep the lower-wall break fully
    // open so the fresh air can turn radially into the stack passage.
    part.add(ring(x - 16, mainFlowOuterRadius(x - 16) + 9.5, 1.25, ejectorThroat.clone()));
  });

  // The centre tail cone remains separate from the new, smoothly contracting
  // fresh-air passage; there is no extra annular throat or layered tail skin.
  const rearEjector = makePart("保留中央尾锥", [470, 90, 0]);
  rearEjector.add(shell([
    [2070, 106], [2150, 121], [2225, 116], [2290, 88], [2350, 42], [2405, 2],
  ], 1.8, brightSilver.clone()));

  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });

  const order = [frontFan, outletGuide, driveMotor, casing, freshGallery, freshFan,
    parts.find(part => part.group.name === "环形电堆 1")!.group,
    parts.find(part => part.group.name === "360度环形引射器 1")!.group,
    parts.find(part => part.group.name === "环形电堆 2")!.group,
    parts.find(part => part.group.name === "区间增压风扇 1")!.group,
    parts.find(part => part.group.name === "环形电堆 3")!.group,
    parts.find(part => part.group.name === "360度环形引射器 2")!.group,
    parts.find(part => part.group.name === "环形电堆 4")!.group,
    parts.find(part => part.group.name === "区间增压风扇 2")!.group,
    parts.find(part => part.group.name === "环形电堆 5")!.group,
    parts.find(part => part.group.name === "360度环形引射器 3")!.group,
    parts.find(part => part.group.name === "环形电堆 6")!.group,
    rearEjector];

  root.updateMatrixWorld(true);
  const axialParts = order.map(group => ({ group, bounds: new THREE.Box3().setFromObject(group) }));
  const axialLayout = (amount: number) => {
    const gap = 70 + 220 * THREE.MathUtils.clamp(amount, 0, 1);
    const width = axialParts.reduce((sum, part) => sum + part.bounds.max.x - part.bounds.min.x, 0) + gap * (axialParts.length - 1);
    let cursor = 950 - width / 2;
    const offsets = new Map<THREE.Group, number>();
    for (const part of axialParts) {
      offsets.set(part.group, cursor - part.bounds.min.x);
      cursor += part.bounds.max.x - part.bounds.min.x + gap;
    }
    return { offsets, minX: 950 - width / 2, maxX: 950 + width / 2 };
  };

  return { root, parts, rotors, cutawayDetails, cutawayHidden, inductionSpriteMaterials, axialLayout };
}

export function createAirPaths(): Record<AirVisualPath, THREE.CatmullRomCurve3[]> {
  const paths: Record<AirVisualPath, THREE.CatmullRomCurve3[]> = { bypass: [], supply: [], supplyInduction: [], reaction: [] };
  const curve = (points: THREE.Vector3[]) => new THREE.CatmullRomCurve3(points, false, "centripetal");

  // Unshrouded bypass: no inward squeeze after the 1 m fan. The streamlines
  // keep their inlet radii until the growing fresh duct displaces them
  // outward; after the duct shoulder they leave approximately axial.
  const bypassEnvelope: Array<[number, number]> = [];
  let largestDuctRadius = freshOuterRadius(300);
  for (let x = 300; x <= 2340; x += 40) {
    largestDuctRadius = Math.max(largestDuctRadius, freshOuterRadius(x));
    bypassEnvelope.push([x, largestDuctRadius]);
  }
  const inletDuctRadius = freshOuterRadius(300);
  // 30 circumferential positions × 6 radial layers = 180 paths, 19.6%
  // fewer than the former 224. This changes display density, not mass flow.
  for (let lane = 0; lane < 180; lane++) {
    const angle = (lane % 30) / 30 * Math.PI * 2;
    const layer = Math.floor(lane / 30);
    const fraction = (layer + 0.5) / 6;
    const radius = (envelope: number) => {
      const inner = envelope + 12;
      const outer = 488 + 0.70 * (envelope - inletDuctRadius);
      return THREE.MathUtils.lerp(inner, outer, fraction);
    };
    const inletRadius = radius(inletDuctRadius);
    const exitRadius = radius(largestDuctRadius);
    paths.bypass.push(curve([
      polar(-450, inletRadius, angle), polar(-120, inletRadius, angle),
      ...bypassEnvelope.map(([x, envelope]) => polar(x, radius(envelope), angle)),
      polar(2480, exitRadius, angle), polar(2660, exitRadius, angle), polar(2890, exitRadius, angle),
    ]));
  }

  // Dense gallery through-flow follows the inlet expansion, one annular fan
  // stage and the two-wall tail contraction without penetrating either wall.
  for (let lane = 0; lane < 72; lane++) {
    const angle = (lane % 24) / 24 * Math.PI * 2;
    const layer = Math.floor(lane / 24);
    const fraction = 0.20 + layer * 0.19;
    const radius = (x: number) => {
      const availableHeight = Math.min(freshGalleryThickness(x), freshOuterRadius(x) - mainFlowOuterRadius(x));
      return mainFlowOuterRadius(x) + availableHeight * fraction;
    };
    paths.supply.push(curve([
      polar(-430, 146 + layer * 17, angle), polar(100, 146 + layer * 17, angle),
      polar(300, radius(300), angle), polar(360, radius(360), angle),
      polar(420, radius(420), angle), polar(480, radius(480), angle),
      polar(560, radius(560), angle), polar(620, radius(620), angle),
      polar(1020, radius(1020), angle), polar(1420, radius(1420), angle),
      polar(1780, radius(1780), angle), polar(2050, radius(2050), angle),
      polar(2130, radius(2130), angle), polar(2200, radius(2200), angle),
      polar(2340, radius(2340), angle),
      polar(2470, radius(2340), angle),
      polar(2650, radius(2340), angle),
      polar(2870, radius(2340), angle),
    ]));
  }

  // The branch streaks accelerate inside each narrowing feeder, turn through
  // the cyan annular slot and stop after the immediately downstream stack.
  // They no longer continue through every later stack or clutter the tail.
  annularEjectorStations.forEach((ejectorX, ejectorIndex) => {
    for (let lane = 0; lane < 32; lane++) {
      const angle = (lane + 0.5) / 32 * Math.PI * 2;
      const feedStart = ejectorX - 252;
      const points = [
        // Enter through the open annular mouth axially.  Do not draw the old
        // diagonal segment that appeared to pierce the silver guide wall.
        polar(feedStart - 42, mainFlowOuterRadius(feedStart - 42) + 17, angle),
        polar(feedStart - 8, mainFlowOuterRadius(feedStart - 8) + 16, angle),
        polar(feedStart + 18, mainFlowOuterRadius(feedStart + 18) + 15, angle),
      ];
      points.push(
        polar(ejectorX - 165, mainFlowOuterRadius(ejectorX - 165) + 11, angle),
        polar(ejectorX - 72, mainFlowOuterRadius(ejectorX - 72) + 5, angle),
        polar(ejectorX - 28, mainFlowOuterRadius(ejectorX - 28) + 4, angle),
        polar(ejectorX - 10, mainFlowOuterRadius(ejectorX - 10) + 3.5, angle),
        polar(ejectorX - 1, mainFlowOuterRadius(ejectorX) - 10, angle),
        polar(ejectorX + 18, mainFlowOuterRadius(ejectorX) - 28, angle),
        polar(ejectorX + 70, mainFlowOuterRadius(ejectorX) - 38, angle),
      );
      const downstreamIndex = ejectorIndex * 2 + 1;
      const downstreamX = stations[downstreamIndex];
      const downstreamRadius = THREE.MathUtils.lerp(125, stationRadii[downstreamIndex] - 15, 0.7);
      points.push(
        polar(downstreamX - 72, downstreamRadius, angle),
        polar(downstreamX + 86, downstreamRadius, angle),
        polar(downstreamX + 128, downstreamRadius + 4, angle),
      );
      paths.supplyInduction.push(curve(points));
    }
  });

  // The smaller core particle count only changes visual density; no thermal
  // or mass-flow conclusion is inferred from the streak count.
  for (let lane = 0; lane < 72; lane++) {
    const angle = (lane % 18) / 18 * Math.PI * 2;
    const layer = Math.floor(lane / 18);
    const fraction = 0.16 + layer * 0.22;
    const radius = (stationIndex: number) => THREE.MathUtils.lerp(130, stationRadii[stationIndex] - 10, fraction);
    // Turn the core stream inward before the new flared wall begins, then
    // route it around the Ø250 motor without entering its housing.
    const inletCoreRadius = (x: number) => {
      const motorClearRadius = THREE.MathUtils.lerp(75, 130, THREE.MathUtils.smoothstep(x, 300, 430));
      return THREE.MathUtils.lerp(motorClearRadius, mainFlowOuterRadius(x) - 12, fraction);
    };
    const points = [
      polar(-450, radius(0), angle), polar(-90, radius(0), angle),
      polar(300, inletCoreRadius(300), angle),
      polar(390, inletCoreRadius(390), angle),
      polar(430, inletCoreRadius(430), angle),
      polar(520, inletCoreRadius(520), angle),
    ];
    stations.forEach((x, index) => {
      points.push(polar(x - 86, radius(index), angle), polar(x + 86, radius(index), angle));
    });
    const tailRadius = (x: number) => {
      const expansion = THREE.MathUtils.clamp((x - stations.at(-1)!) / (2405 - stations.at(-1)!), 0, 1);
      const inner = tailConeOuterRadius(x) + 14;
      // Expand the outer edge gradually from the last stack exit instead of
      // forcing all four layers suddenly toward the casing.
      const outer = THREE.MathUtils.lerp(stationRadii.at(-1)! - 15, mainFlowOuterRadius(x) - 14, expansion);
      return THREE.MathUtils.lerp(inner, outer, fraction);
    };
    const finalRadius = tailRadius(2405);
    points.push(
      polar(2070, tailRadius(2070), angle),
      polar(2150, tailRadius(2150), angle),
      polar(2225, tailRadius(2225), angle),
      polar(2290, tailRadius(2290), angle),
      polar(2350, tailRadius(2350), angle),
      polar(2405, finalRadius, angle),
      polar(2550, finalRadius, angle),
      polar(2720, finalRadius, angle),
      polar(2890, finalRadius, angle),
    );
    paths.reaction.push(curve(points));
  }

  return paths;
}
