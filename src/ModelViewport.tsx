import { useEffect, useRef, useState } from "react";
import { Maximize2, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createAirPaths, createNewConceptPropulsion, type AirPath, type AirVisualPath } from "./new-model";
import { airflowTemperatureC, motorThermal, stackThermal, temperatureStops, thermalColorCss } from "./temperature-model";

export type ViewMode = "complete" | "cutaway" | "exploded";
export type FlowMode = "all" | AirPath | "off";
type Props = {
  viewMode: ViewMode;
  flowMode: FlowMode;
  flowSpeed: number;
  fanRunning: boolean;
  cutPosition: number;
  explodeAmount: number;
  temperatureMode: boolean;
};

const flowLabels: Record<AirPath, string> = {
  bypass: "外涵推进气流",
  supply: "新鲜空气直通 / 青色引流入堆",
  reaction: "渐扩中间主流",
};
const flowColors: Record<AirVisualPath, number> = {
  bypass: 0x087fea,
  supply: 0x0caf78,
  supplyInduction: 0x17cfe3,
  reaction: 0xe78218,
};

type StreakStyle = "normal" | "dense" | "induction" | "propulsion";

function createStreaks(curves: THREE.CatmullRomCurve3[], key: AirVisualPath, color: number, style: StreakStyle) {
  const samples = 256;
  const data = new Float32Array(samples * curves.length * 4);
  const phases: number[] = [], rows: number[] = [], rates: number[] = [], lengths: number[] = [];
  const spacing = style === "induction" ? 18 : style === "propulsion" ? 32 : style === "dense" ? 42 : 58;
  const segmentLength = style === "induction" ? 42 : style === "propulsion" ? 29 : style === "dense" ? 27 : 19;
  const minimumCount = style === "induction" ? 24 : style === "propulsion" ? 18 : 12;
  curves.forEach((curve, curveIndex) => {
    const distance = curve.getLength();
    for (let sample = 0; sample < samples; sample++) {
      const point = curve.getPointAt(sample / (samples - 1));
      data.set([point.x, point.y, point.z, airflowTemperatureC(key, point.x, curveIndex)], (curveIndex * samples + sample) * 4);
    }
    const count = Math.max(minimumCount, Math.ceil(distance / spacing));
    for (let i = 0; i < count; i++) {
      phases.push((i / count + curveIndex * 0.371) % 1);
      rows.push((curveIndex + 0.5) / curves.length);
      rates.push(265 / distance);
      lengths.push(segmentLength / distance);
    }
  });

  const texture = new THREE.DataTexture(data, samples, curves.length, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.instanceCount = phases.length;
  geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
  geometry.setAttribute("aRow", new THREE.InstancedBufferAttribute(new Float32Array(rows), 1));
  geometry.setAttribute("aRate", new THREE.InstancedBufferAttribute(new Float32Array(rates), 1));
  geometry.setAttribute("aLength", new THREE.InstancedBufferAttribute(new Float32Array(lengths), 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPaths: { value: texture },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uTemperatureMode: { value: 0 },
      uThermalColors: { value: temperatureStops.map(stop => new THREE.Color(stop.color)) },
      uResolution: { value: new THREE.Vector2(1000, 700) },
      uWidth: { value: style === "induction" ? 3.0 : style === "propulsion" ? 2.2 : style === "dense" ? 2.3 : 1.8 },
    },
    vertexShader: `
      attribute float aPhase; attribute float aRow; attribute float aRate; attribute float aLength;
      uniform sampler2D uPaths; uniform float uTime; uniform vec2 uResolution; uniform float uWidth;
      varying float vAcross; varying float vTemperature;
      #include <clipping_planes_pars_vertex>
      vec4 path(float t) {
        float s = clamp(t, 0., 1.) * 255.; float i = floor(s);
        vec4 a = texture2D(uPaths, vec2((i + .5) / 256., aRow));
        vec4 b = texture2D(uPaths, vec2((min(i + 1., 255.) + .5) / 256., aRow));
        return mix(a, b, fract(s));
      }
      void main() {
        float t = fract(aPhase + uTime * aRate);
        vec4 headSample = path(t); vec3 head = headSample.xyz;
        vec3 tail = path(max(0., t - aLength)).xyz;
        vec4 h = projectionMatrix * modelViewMatrix * vec4(head, 1.);
        vec4 b = projectionMatrix * modelViewMatrix * vec4(tail, 1.);
        vec2 d = (h.xy / h.w - b.xy / b.w) * uResolution;
        vec2 n = vec2(-d.y, d.x) / max(length(d), .001);
        vec4 mvPosition = modelViewMatrix * vec4(mix(tail, head, position.y), 1.);
        gl_Position = projectionMatrix * mvPosition;
        gl_Position.xy += n * position.x * uWidth / uResolution * gl_Position.w;
        vAcross = position.x;
        vTemperature = headSample.w;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTemperatureMode;
      uniform vec3 uThermalColors[5];
      varying float vAcross; varying float vTemperature;
      #include <clipping_planes_pars_fragment>
      vec3 temperatureColor(float t) {
        if (t <= 0.) return mix(uThermalColors[0], uThermalColors[1], clamp((t + 24.) / 24., 0., 1.));
        if (t <= 25.) return mix(uThermalColors[1], uThermalColors[2], clamp(t / 25., 0., 1.));
        if (t <= 55.) return mix(uThermalColors[2], uThermalColors[3], clamp((t - 25.) / 30., 0., 1.));
        return mix(uThermalColors[3], uThermalColors[4], clamp((t - 55.) / 55., 0., 1.));
      }
      void main() {
        #include <clipping_planes_fragment>
        float alpha = .96 * (1. - smoothstep(.62, 1., abs(vAcross)));
        gl_FragColor = vec4(mix(uColor, temperatureColor(vTemperature), uTemperatureMode), alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    clipping: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return { mesh, material, texture };
}

export function ModelViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const reset = useRef<() => void>(() => {});
  const inspectNozzles = useRef<() => void>(() => {});
  const [error, setError] = useState("");
  useEffect(() => { latest.current = props; }, [props]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch {
      const timer = window.setTimeout(() => setError("无法启动三维显示，请启用浏览器硬件加速后重试。"), 0);
      return () => window.clearTimeout(timer);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe7edf0);
    const camera = new THREE.PerspectiveCamera(34, 1, 5, 120000);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.localClippingEnabled = true;
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
    element.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.045);
    scene.environment = environment.texture;
    room.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x607485, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-1100, 1900, 2400); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe4efff, 2.2); fill.position.set(1900, 100, -1700); scene.add(fill);

    const assembly = createNewConceptPropulsion();
    scene.add(assembly.root);
    const thermalMaterials: Array<{
      material: THREE.MeshStandardMaterial;
      baseColor: THREE.Color;
      baseEmissive: THREE.Color;
      baseEmissiveIntensity: number;
      temperatureC: number;
    }> = [];
    const replacedMaterials = new Set<THREE.Material>();
    const addThermalTarget = (name: string, temperatureC: number) => {
      assembly.root.getObjectByName(name)?.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.material) return;
        const original = mesh.material;
        const cloneMaterial = (material: THREE.Material) => {
          if (!(material instanceof THREE.MeshStandardMaterial)) return material;
          replacedMaterials.add(material);
          const clone = material.clone();
          thermalMaterials.push({
            material: clone,
            baseColor: clone.color.clone(),
            baseEmissive: clone.emissive.clone(),
            baseEmissiveIntensity: clone.emissiveIntensity,
            temperatureC,
          });
          return clone;
        };
        mesh.material = Array.isArray(original) ? original.map(cloneMaterial) : cloneMaterial(original);
      });
    };
    stackThermal.forEach((stack, index) => addThermalTarget(`环形电堆 ${index + 1}`, stack.meanC));
    motorThermal.forEach(motor => addThermalTarget(motor.targetName, motor.shellC));
    const paths = createAirPaths();
    const streamSpecs: Array<{ key: AirVisualPath; mode: AirPath; style: StreakStyle }> = [
      { key: "bypass", mode: "bypass", style: "propulsion" },
      { key: "supply", mode: "supply", style: "dense" },
      { key: "supplyInduction", mode: "supply", style: "induction" },
      { key: "reaction", mode: "reaction", style: "normal" },
    ];
    const streams = streamSpecs.map(spec => ({
      name: spec.key,
      mode: spec.mode,
      ...createStreaks(paths[spec.key], spec.key, flowColors[spec.key], spec.style),
    }));
    streams.forEach(stream => scene.add(stream.mesh));

    const grid = new THREE.GridHelper(6000, 60, 0xb6c4cb, 0xd1dbe0);
    grid.position.set(950, -650, 0);
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 650;
    controls.maxDistance = 90000;
    controls.target.set(950, 0, 0);
    let explodedLayout = assembly.axialLayout(latest.current.explodeAmount);

    function fit() {
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      const exploded = latest.current.viewMode === "exploded";
      const direction = exploded ? new THREE.Vector3(-0.08, 0.15, 1) : latest.current.viewMode === "complete" ? new THREE.Vector3(0.62, 0.27, 1) : new THREE.Vector3(-0.2, 0.18, 1);
      direction.normalize();
      controls.target.set(950, 0, 0);
      const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right);
      let distance = 0;
      const xBounds = exploded ? [explodedLayout.minX - 100, explodedLayout.maxX + 100] : [-500, 2450];
      for (const x of xBounds) for (const y of [-620, 620]) for (const z of [-620, 620]) {
        const corner = new THREE.Vector3(x, y, z).sub(controls.target);
        const towardCamera = corner.dot(direction);
        distance = Math.max(distance, towardCamera + Math.abs(corner.dot(right)) / Math.tan(horizontal / 2), towardCamera + Math.abs(corner.dot(up)) / Math.tan(vertical / 2));
      }
      camera.position.copy(controls.target).add(direction.multiplyScalar(distance * 1.09));
      controls.update();
    }
    reset.current = fit;
    inspectNozzles.current = () => {
      controls.target.set(1830, 0, 0);
      camera.position.set(3200, 540, 1500);
      controls.update();
    };

    let firstResize = true, lastWidth = 0, lastHeight = 0, resizeFrame = 0;
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width; lastHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      streams.forEach(stream => stream.material.uniforms.uResolution.value.set(width, height));
      if (firstResize) { fit(); firstResize = false; }
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(resize); });
    observer.observe(element);
    resize();

    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const materials = new Set<THREE.Material>();
    assembly.root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
        if (!material.userData.noCutawayClip) materials.add(material);
      });
    });

    const clock = new THREE.Clock();
    let frame = 0, simulationTime = 0, previousView = "", previousAmount = latest.current.explodeAmount, previousTemperatureMode = false, shaderFailed = false;
    renderer.debug.onShaderError = () => {
      if (!shaderFailed) { shaderFailed = true; setError("气流显示加载失败，请刷新页面重试。"); }
    };

    function animate() {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const state = latest.current;
      clip.constant = state.cutPosition;

      if (previousAmount !== state.explodeAmount) {
        explodedLayout = assembly.axialLayout(state.explodeAmount);
        previousAmount = state.explodeAmount;
        if (state.viewMode === "exploded") fit();
      }
      if (previousView !== state.viewMode) {
        fit();
        previousView = state.viewMode;
        const planes = state.viewMode === "complete" ? [] : [clip];
        materials.forEach(material => { material.clippingPlanes = planes; material.needsUpdate = true; });
        streams.forEach(stream => { stream.material.clippingPlanes = planes; stream.material.needsUpdate = true; });
      }
      if (previousTemperatureMode !== state.temperatureMode) {
        for (const target of thermalMaterials) {
          const tint = new THREE.Color(thermalColorCss(target.temperatureC));
          target.material.color.copy(state.temperatureMode ? target.baseColor.clone().lerp(tint, 0.82) : target.baseColor);
          target.material.emissive.copy(state.temperatureMode ? tint : target.baseEmissive);
          target.material.emissiveIntensity = state.temperatureMode ? 0.14 : target.baseEmissiveIntensity;
        }
        previousTemperatureMode = state.temperatureMode;
      }
      for (const part of assembly.parts) {
        const targetX = state.viewMode === "exploded" ? explodedLayout.offsets.get(part.group)! : 0;
        part.group.position.x = THREE.MathUtils.damp(part.group.position.x, targetX, 8, dt);
        part.group.position.y = 0;
        part.group.position.z = 0;
      }
      for (const detail of assembly.cutawayDetails) detail.visible = state.viewMode !== "complete";
      for (const hidden of assembly.cutawayHidden) hidden.visible = state.viewMode !== "cutaway";
      if (state.fanRunning) for (const rotor of assembly.rotors) rotor.group.rotation[rotor.axis] += rotor.rate * dt;
      if (state.fanRunning) for (const material of assembly.inductionSpriteMaterials) material.rotation -= 4.6 * dt;
      simulationTime += dt * state.flowSpeed;
      for (const stream of streams) {
        stream.mesh.visible = state.viewMode !== "exploded" && (state.flowMode === "all" || state.flowMode === stream.mode);
        stream.material.uniforms.uTime.value = simulationTime;
        stream.material.uniforms.uTemperatureMode.value = state.temperatureMode ? 1 : 0;
      }
      grid.visible = state.viewMode !== "exploded" && camera.position.y > -870;
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame); observer.disconnect(); controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
      });
      geometries.forEach(geometry => geometry.dispose());
      const textures = new Set<THREE.Texture>();
      materials.forEach(material => {
        const mapped = material as THREE.Material & { map?: THREE.Texture | null };
        if (mapped.map) textures.add(mapped.map);
        material.dispose();
      });
      replacedMaterials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      streams.forEach(stream => stream.texture.dispose());
      environment.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  const active = props.temperatureMode && props.viewMode !== "exploded"
    ? "条件温度场 · 六级电堆 / 电机壳体 / 沿程气流"
    : props.viewMode === "exploded"
    ? "同轴顺序分解 · 气流已隐藏"
    : props.flowMode === "all"
      ? "三路气流 · 入口渐扩 / 环道外缘增压 / 三级全环引射 / 尾部双壁收缩"
      : props.flowMode === "off" ? "气流已隐藏" : flowLabels[props.flowMode];

  return <div ref={host} className="model-host">
    {error && <div className="error" role="alert">{error}</div>}
    <div className="view-head">
      <div><p className="mode">{active}</p></div>
      <div className="view-buttons">
        {props.viewMode !== "exploded" && <button onClick={() => inspectNozzles.current()}>尾喷口视角</button>}
        <button className="icon" onClick={() => reset.current()} aria-label="复位视角"><RotateCcw size={17} /></button>
        <button className="icon" onClick={() => host.current?.requestFullscreen?.()} aria-label="全屏显示"><Maximize2 size={17} /></button>
      </div>
    </div>
    <div className="legend">
      {props.viewMode === "exploded" ? <span>前端 → 主电机与环道外缘增压级 → 六级电堆、两级区间风扇与三级环形引射器 → 双壁收缩尾部与尾锥</span> : <>
        {props.temperatureMode ? <span className="temperature-key"><b>气流 / 部件温度</b><i className="temperature-gradient" />−24°　0°　25°　55°　110°C</span> : <>
          <span><i style={{ background: "#087fea" }} />外涵推进气流</span>
          <span><i style={{ background: "#0caf78" }} />新鲜空气直通</span>
          <span><i style={{ background: "#17cfe3" }} />引流入堆气流</span>
          <span><i style={{ background: "#e78218" }} />渐扩中间主流</span>
        </>}
      </>}
      {props.viewMode === "cutaway" && !props.temperatureMode && <span><i style={{ background: "#d6a43f" }} />主电机短轴传动；环道风扇仅外缘转子旋转</span>}
      <span className="help">拖动旋转 · 滚轮缩放 · 右键平移</span>
    </div>
  </div>;
}
