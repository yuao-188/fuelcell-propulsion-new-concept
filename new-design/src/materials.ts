import * as THREE from 'three';

type SurfaceData = { id?: string; group?: string; finish?: string; laminated?: boolean; layerOrigin?: number; layerPitch?: number; edgeLodStride?: number };
type Finish = {
  color: THREE.ColorRepresentation; metalness: number; roughness: number;
  grain: 'brushed' | 'blasted'; scale: number; variation: number; relief: number; reflection: number;
};

// Both maps are generated locally, with fixed seeds and periodic interpolation.
// R stores only fine micro-height; G stores uniform fine roughness. There is no
// low-frequency cloud, tint noise or embossed large-scale surface deformation.
function grainTexture(kind: Finish['grain'], renderer: THREE.WebGLRenderer) {
  const size = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  let seed = kind === 'brushed' ? 0x74ac51 : 0x63bd29;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rows = Float32Array.from({ length: size }, random);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4, fine = random();
    const streak = (rows[y] * 2 + rows[(y + 1) % size] + rows[(y + size - 1) % size]) / 4;
    const height = kind === 'brushed' ? .72 * streak + .28 * fine : fine;
    const roughness = .5 + (height - .5) * .38;
    image.data[index] = Math.round(height * 255);
    image.data[index + 1] = Math.round(roughness * 255);
    image.data[index + 2] = 128;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `procedural-${kind}-metal`;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function surfaceFinish(source: THREE.MeshStandardMaterial, data: SurfaceData): Finish {
  const id = data.id ?? '', group = data.group ?? '';
  const base: Finish = { color: source.color.clone(), metalness: .78, roughness: .34,
    grain: 'brushed', scale: 180, variation: .17, relief: .035, reflection: 1.05 };
  if (data.laminated) return { ...base, color: '#414b50', metalness: .12, roughness: .68,
    grain: 'blasted', scale: 95, variation: .1, relief: .016, reflection: .65 };
  if (id.startsWith('stack-edges-')) return { ...base, color: '#4e5b62', metalness: .38, roughness: .48,
    scale: 120, variation: .1, relief: .012, reflection: .85 };
  if (id.includes('fastener') || id.includes('washer')) return { ...base, color: '#77858e',
    metalness: .94, roughness: .27, scale: 100, variation: .1, relief: .012 };
  if (id.includes('flange') || id.includes('cap') || id.startsWith('stack-frames-') || id === 'compressor-shroud') {
    return { ...base, color: '#a9b5bd', metalness: .93, roughness: .28, variation: .14, relief: .024, reflection: 1.15 };
  }
  if (id === 'fan' || id === 'fan-spinner' || id === 'compressor-drive') return { ...base,
    color: '#aebbc5', metalness: .96, roughness: .235, variation: .12, relief: .014, reflection: 1.2 };
  if (id === 'main-motor') return { ...base, color: '#ad8a46', metalness: .84, roughness: .33,
    grain: 'blasted', scale: 145, variation: .15, relief: .025, reflection: 1.05 };
  if (group === 'compressorCase') return { ...base, color: '#b49a62', metalness: .82, roughness: .31,
    grain: 'blasted', scale: 145, variation: .16, relief: .025, reflection: 1.1 };
  if (group === 'outerShell') return { ...base, color: id.includes('seam') ? '#b9c3ca' : '#96a4ae',
    metalness: .91, roughness: id.includes('seam') ? .26 : .37, scale: 240, variation: .2, relief: .038, reflection: 1.12 };
  if (group === 'innerShell') return { ...base, color: '#82939f', metalness: .85, roughness: .43,
    grain: 'blasted', scale: 175, variation: .19, relief: .03, reflection: 1.0 };
  if (group === 'intakeOuter') return { ...base, color: '#46738d', metalness: .75, roughness: .34,
    scale: 145, variation: .15, relief: .024, reflection: 1.1 };
  if (group === 'intakeInner') return { ...base, color: '#35596d', metalness: .7, roughness: .42,
    grain: 'blasted', scale: 130, variation: .14, relief: .02 };
  if (['air', 'hydrogen', 'return'].includes(group)) return { ...base, metalness: .43, roughness: .35,
    grain: 'blasted', scale: 90, variation: .075, relief: .009, reflection: .85 };
  if (group === 'anodeInternal') return { ...base, color: '#657780', metalness: .72, roughness: .4,
    scale: 90, variation: .11, relief: .018 };
  return base;
}

export function createEngineeringMaterials(renderer: THREE.WebGLRenderer) {
  const textures = { brushed: grainTexture('brushed', renderer), blasted: grainTexture('blasted', renderer) };

  function applyFinish(material: THREE.MeshPhysicalMaterial, finish: Finish, data: SurfaceData, section = false) {
    material.dithering = true;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, {
        finishGrain: { value: textures[finish.grain] }, finishScale: { value: finish.scale },
        finishVariation: { value: finish.variation }, finishRelief: { value: section ? 0 : finish.relief * .3 },
        layerOrigin: { value: data.layerOrigin ?? 0 }, layerPitch: { value: data.layerPitch || 1.01 },
        layerGroupStride: { value: data.edgeLodStride || 8 },
      });
      shader.vertexShader = `varying vec3 vFinishPosition;
varying vec3 vFinishNormal;
${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
  vFinishPosition=(modelMatrix*vec4(position,1.0)).xyz;
  vFinishNormal=normalize(mat3(modelMatrix)*normal);`);
      shader.fragmentShader = `varying vec3 vFinishPosition;
varying vec3 vFinishNormal;
uniform sampler2D finishGrain;
uniform float finishScale,finishVariation,finishRelief,layerOrigin,layerPitch,layerGroupStride;
${shader.fragmentShader}`;
      // World-space triplanar projection needs no UVs and does not change the
      // imported geometry. Automatic mip filtering keeps fine grain stable.
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  vec3 grainWeights=pow(abs(normalize(vFinishNormal)),vec3(4.0));
  grainWeights/=max(dot(grainWeights,vec3(1.0)),0.0001);
  vec3 grainPoint=vFinishPosition/finishScale;
  vec3 grainSample=texture2D(finishGrain,grainPoint.yz).rgb*grainWeights.x
    +texture2D(finishGrain,grainPoint.xz).rgb*grainWeights.y
    +texture2D(finishGrain,grainPoint.xy).rgb*grainWeights.z;
  roughnessFactor=clamp(roughnessFactor+(grainSample.g-0.5)*2.0*finishVariation,0.16,0.88);
  float finishHeight=(grainSample.r-0.5)*finishRelief;`);
      // Surface-gradient bump perturbation: physically small relief in the
      // millimetre model coordinates, without screen-space outlines or passes.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  vec3 grainDx=dFdx(-vViewPosition),grainDy=dFdy(-vViewPosition);
  vec3 grainR1=cross(grainDy,normal),grainR2=cross(normal,grainDx);
  float grainDet=dot(grainDx,grainR1)*faceDirection;
  if(abs(grainDet)>0.00000001) {
    vec3 grainGradient=sign(grainDet)*(dFdx(finishHeight)*grainR1+dFdy(finishHeight)*grainR2);
    vec3 grainNormal=normalize(abs(grainDet)*normal-grainGradient);
    normal=normalize(normal+clamp(grainNormal-normal,vec3(-0.018),vec3(0.018)));
  }`);
      if (data.laminated) {
        // Fine 1.01 mm layers are filtered at distance. Low-contrast overview
        // lines align with the existing every-eighth-layer physical edge LOD.
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float layerPhase=(vFinishPosition.x-layerOrigin)/layerPitch-0.5;
  float layerFootprint=max(fwidth(layerPhase),0.0001);
  float layerVisibility=1.0-smoothstep(0.35,0.9,layerFootprint);
  float layerDistance=abs(fract(layerPhase+0.5)-0.5);
  float layerGroove=1.0-smoothstep(0.055,0.055+layerFootprint*0.7,layerDistance);
  float groupPhase=layerPhase/layerGroupStride;
  float groupFootprint=max(fwidth(groupPhase),0.0001);
  float groupDistance=abs(fract(groupPhase+0.5)-0.5);
  float groupLine=1.0-smoothstep(0.025,0.025+groupFootprint*0.8,groupDistance);
  float groupVisibility=(1.0-layerVisibility)*(1.0-smoothstep(0.65,1.3,groupFootprint));
  diffuseColor.rgb*=1.0-0.24*layerGroove*layerVisibility-0.15*groupLine*groupVisibility;`);
      }
    };
    material.customProgramCacheKey = () => `engineering-metal-v3-${data.laminated ? 'laminated' : 'solid'}`;
  }

  const create = (source: THREE.MeshStandardMaterial, data: SurfaceData) => {
    const finish = surfaceFinish(source, data);
    const material = new THREE.MeshPhysicalMaterial({ color: finish.color, metalness: finish.metalness,
      roughness: finish.roughness, envMapIntensity: finish.reflection, side: THREE.DoubleSide,
      clearcoat: 0, clearcoatRoughness: .5 });
    material.clipShadows = true;
    applyFinish(material, finish, data);
    return material;
  };
  const section = (source: THREE.MeshStandardMaterial, data: SurfaceData) => {
    const finish = surfaceFinish(source, data);
    const material = new THREE.MeshPhysicalMaterial({
      color: source.color, metalness: data.laminated ? .1 : Math.min(source.metalness, .65),
      roughness: data.laminated ? .64 : .46, envMapIntensity: .9, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    });
    applyFinish(material, { ...finish, variation: finish.variation * .55 }, data, true);
    return material;
  };
  return { create, section, dispose: () => Object.values(textures).forEach(texture => texture.dispose()) };
}
