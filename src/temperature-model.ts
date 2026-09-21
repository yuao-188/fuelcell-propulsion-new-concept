import type { AirVisualPath } from "./new-model";

// Conditional cruise-point results selected by the user. These values came
// from the earlier heat balance; they are not a verified prediction for the
// revised 215-cell packaging or a local-hotspot calculation.
export const stackThermal = [
  { powerKw: 13.3, flowKgS: 0.41, inletC: -15.3, outletC: 25.8, meanC: 55.1 },
  { powerKw: 18.7, flowKgS: 1.07, inletC: -4.1, outletC: 18.0, meanC: 54.9 },
  { powerKw: 12.1, flowKgS: 1.07, inletC: 19.3, outletC: 33.7, meanC: 55.0 },
  { powerKw: 13.6, flowKgS: 1.72, inletC: 12.4, outletC: 22.4, meanC: 54.9 },
  { powerKw: 9.9, flowKgS: 1.72, inletC: 23.2, outletC: 30.6, meanC: 55.1 },
  { powerKw: 7.4, flowKgS: 1.93, inletC: 24.8, outletC: 29.6, meanC: 54.9 },
] as const;

const ambientC = -24;
const galleryC = -22.7;
const stackFaces: Array<[number, number]> = [
  [300, 440], [490, 630], [790, 910],
  [960, 1060], [1220, 1300], [1350, 1410],
];
const ejectorXs = [465, 935, 1325];

const motorInputs: Array<{
  label: string; targetName: string; diameterM: number; lengthM: number;
  lossW: number; h: number; airC: number; exposedAreaM2?: number;
}> = [
  { label: "主电机", targetName: "温度显示-主电机", diameterM: 0.25, lengthM: 0.1125, lossW: 3600, h: 150, airC: (ambientC - 15.3) / 2 },
  { label: "环道增压定子", targetName: "温度显示-环道定子", diameterM: 0, lengthM: 0, exposedAreaM2: 0.165, lossW: 200, h: 80, airC: galleryC },
  { label: "区间电机 1", targetName: "温度显示-区间电机1", diameterM: 0.148, lengthM: 0.04, lossW: 120, h: 60, airC: (19.3 + 33.7) / 2 },
  { label: "区间电机 2", targetName: "温度显示-区间电机2", diameterM: 0.148, lengthM: 0.04, lossW: 120, h: 60, airC: (23.2 + 30.6) / 2 },
];
export const motorThermal = motorInputs.map(motor => {
  const areaM2 = motor.exposedAreaM2 ?? (Math.PI * motor.diameterM * motor.lengthM + Math.PI * motor.diameterM ** 2 / 2);
  return { ...motor, areaM2, shellC: motor.airC + motor.lossW / (motor.h * areaM2) };
});

export const temperatureStops = [
  { c: -24, color: "#0874e8" },
  { c: 0, color: "#11bcd1" },
  { c: 25, color: "#efca4d" },
  { c: 55, color: "#ed742e" },
  { c: 110, color: "#d12538" },
] as const;

function interpolate(nodes: Array<[number, number]>, x: number) {
  if (x <= nodes[0][0]) return nodes[0][1];
  for (let i = 1; i < nodes.length; i++) {
    const [endX, endC] = nodes[i];
    if (x <= endX) {
      const [startX, startC] = nodes[i - 1];
      return startC + (endC - startC) * (x - startX) / (endX - startX);
    }
  }
  return nodes[nodes.length - 1][1];
}

const coreNodes: Array<[number, number]> = [
  [-450, ambientC], [160, ambientC], [275, -15.3],
  [300, -15.3], [440, 25.8], [465, 25.8], [490, -4.1],
  [630, 18.0], [710, 18.0], [790, 19.3], [910, 33.7],
  [935, 33.7], [960, 12.4], [1060, 22.4], [1140, 22.4],
  [1220, 23.2], [1300, 30.6], [1325, 30.6],
  [1350, 24.8], [1410, 29.6], [2160, 29.6],
];

export function airflowTemperatureC(path: AirVisualPath, physicalX: number, curveIndex: number) {
  if (path === "bypass") {
    // Illustrative bypass rise from 56.4 kW of main-fan shaft work distributed
    // through approximately 13.6 kg/s. It is not a fan-map result.
    return interpolate([[-450, ambientC], [0, -20], [2160, -20]], physicalX);
  }
  if (path === "supply") return interpolate([[-450, ambientC], [0, ambientC], [180, galleryC], [2160, galleryC]], physicalX);
  if (path === "reaction") return interpolate(coreNodes, physicalX);

  const branch = Math.min(2, Math.floor(curveIndex / 32));
  const downstream = branch * 2 + 1;
  const [front, rear] = stackFaces[downstream];
  const nozzle = ejectorXs[branch];
  return interpolate([
    [nozzle - 210, galleryC], [nozzle, galleryC],
    [front, stackThermal[downstream].inletC],
    [rear, stackThermal[downstream].outletC],
    [rear + 45, stackThermal[downstream].outletC],
  ], physicalX);
}

export function thermalColorCss(temperatureC: number) {
  let low: (typeof temperatureStops)[number] = temperatureStops[0];
  let high: (typeof temperatureStops)[number] = temperatureStops[temperatureStops.length - 1];
  for (let index = 1; index < temperatureStops.length; index++) {
    if (temperatureC <= temperatureStops[index].c) {
      high = temperatureStops[index];
      low = temperatureStops[index - 1];
      break;
    }
    low = temperatureStops[index];
  }
  const fraction = Math.max(0, Math.min(1, (temperatureC - low.c) / Math.max(1, high.c - low.c)));
  const parse = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const a = parse(low.color), b = parse(high.color);
  return `rgb(${a.map((channel, index) => Math.round(channel + (b[index] - channel) * fraction)).join(",")})`;
}
