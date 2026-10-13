import { stackSizing } from "./new-model";

// User-specified display setpoint for the revised three-stack geometry.
// Previous six-stage power/flow/air/motor temperatures are not reused.
export const stackThermal = stackSizing.map(() => ({ meanC: 55 }));

export function thermalColorCss(temperatureC: number) {
  const stops = [
    { c: -24, color: [8, 116, 232] },
    { c: 0, color: [17, 188, 209] },
    { c: 25, color: [239, 202, 77] },
    { c: 55, color: [237, 116, 46] },
    { c: 110, color: [209, 37, 56] },
  ];
  const index = stops.findIndex(stop => temperatureC <= stop.c);
  const high = stops[index < 0 ? stops.length - 1 : index];
  const low = stops[Math.max(0, (index < 0 ? stops.length - 1 : index) - 1)];
  const fraction = Math.max(0, Math.min(1, (temperatureC - low.c) / Math.max(1, high.c - low.c)));
  return `rgb(${low.color.map((channel, i) => Math.round(channel + (high.color[i] - channel) * fraction)).join(",")})`;
}
