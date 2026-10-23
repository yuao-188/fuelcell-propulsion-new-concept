import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import ManifoldModule from 'manifold-3d';
import { Document, NodeIO } from '@gltf-transform/core';
import { Matrix4, Vector3, Color } from 'three';
import { parameters as P, colors as C } from '../new-design/parameters.mjs';
import { buildDetailedMachinery } from './detailed-machinery.mjs';
import { buildDetailedStack } from './detailed-stacks.mjs';
import { buildDetailedShells } from './detailed-shells.mjs';
import { buildWaterManagement } from './detailed-water-wiring.mjs';
import { buildFluidNetworks } from './build-new-design-fluids.mjs';
import { buildWiring } from './detailed-wiring.mjs';

const api = await ManifoldModule();
api.setup();
const { Manifold: M, CrossSection: CS } = api;
const root = resolve(import.meta.dirname, '..');
const parts = [], ports = [];
const union = a => M.union(a);
const vec = a => new Vector3(...a);
const polar = (x, r, degrees) => [x, r * Math.cos(degrees * Math.PI / 180), r * Math.sin(degrees * Math.PI / 180)];
const cylinder = (a, b, r, r2 = r, n = 32) => {
  const z = vec(b).sub(vec(a)), length = z.length();
  assert.ok(length > 0);
  z.normalize();
  const auxiliary = Math.abs(z.z) < .8 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const x = auxiliary.cross(z).normalize(), y = z.clone().cross(x);
  const matrix = new Matrix4().makeBasis(x, y, z).setPosition(vec(a));
  return M.cylinder(length, r, r2, n).transform(matrix.elements);
};
const tubePath = (points, r, endExtension = 0) => {
  const pp = points.map(v => [...v]);
  if (endExtension) {
    pp[0] = vec(pp[0]).add(vec(pp[0]).sub(vec(pp[1])).normalize().multiplyScalar(endExtension)).toArray();
    const last = pp.length - 1;
    pp[last] = vec(pp[last]).add(vec(pp[last]).sub(vec(pp[last - 1])).normalize().multiplyScalar(endExtension)).toArray();
  }
  return union([
    ...pp.slice(1).map((p, i) => cylinder(pp[i], p, r)),
    ...pp.slice(1, -1).map(p => M.sphere(r, 24).translate(p)),
  ]);
};
const roundPath = (points, bend = 14) => {
  if (points.length < 3) return points;
  const output = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = vec(points[i]), prev = vec(points[i - 1]), next = vec(points[i + 1]);
    const length = Math.min(bend, p.distanceTo(prev) * .3, p.distanceTo(next) * .3);
    const a = p.clone().add(prev.sub(p).normalize().multiplyScalar(length));
    const b = p.clone().add(next.sub(p).normalize().multiplyScalar(length));
    output.push(a.toArray());
    for (let j = 1; j <= 8; j++) {
      const t = j / 8;
      output.push(a.clone().multiplyScalar((1-t)**2).add(p.clone().multiplyScalar(2*t*(1-t))).add(b.clone().multiplyScalar(t*t)).toArray());
    }
  }
  output.push(points.at(-1));
  return output;
};
const torus = (x, radius, tubeRadius) => {
  const circle = Array.from({ length: 20 }, (_, i) => [radius + tubeRadius * Math.cos(i * 2 * Math.PI / 20), x + tubeRadius * Math.sin(i * 2 * Math.PI / 20)]);
  return new CS([circle]).revolve(128).rotate([0, 90, 0]);
};
const revolved = (profile, wall) => new CS([[
  ...profile.map(([x,r]) => [r,x]),
  ...profile.toReversed().map(([x,r]) => [r-(typeof wall==='function'?wall(x):wall),x]),
]]).revolve(144).rotate([0, 90, 0]);
function sector(front, rear, inner, outer, start, end) {
  const points = [];
  const count = Math.ceil((end-start) / 2);
  for(let i=0; i<=count; i++) { const t=(start+(end-start)*i/count)*Math.PI/180; points.push([-outer*Math.sin(t),outer*Math.cos(t)]); }
  for(let i=count; i>=0; i--) { const t=(start+(end-start)*i/count)*Math.PI/180; points.push([-inner*Math.sin(t),inner*Math.cos(t)]); }
  return new CS([points]).extrude(rear-front).rotate([0,90,0]).translate([front,0,0]);
}
const add = (id, name, group, color, solid, extra={}) => {
  assert.equal(solid.status(), 'NoError', name);
  assert.ok(solid.volume() > .001, name + ' must have solid walls');
  parts.push({id,name,group,color,solid,...extra});
};

// Each fluid circuit is constructed as joined walls minus a continuous bore.
const water=buildWaterManagement({M,CS,P,C,union,cylinder,roundPath,tubePath,add});
const fluids=buildFluidNetworks({M,P,C,union,cylinder,tubePath,roundPath,polar,add,water});
ports.push(...fluids.ports);
const stackChecks=P.stacks.map((s,i)=>buildDetailedStack({M,P,C,union,cylinder,sector,polar,add,s,i,cut:fluids.stackCutters[i]}));

// Front machinery: main motor shaft terminates at its own motor. The compressor
// has a separate enclosed drive with no continuation of that front shaft.
buildDetailedMachinery({M,CS,P,C,union,cylinder,revolved,sector,add});
const pumpOuter=union([
  cylinder([P.pump.front,0,P.pump.centerZ],[P.pump.front+6,0,P.pump.centerZ],P.pump.radius,P.pump.radius,64),
  cylinder([P.pump.front+6,0,P.pump.centerZ],[P.pump.rear-6,0,P.pump.centerZ],P.pump.radius-2,P.pump.radius-2,64),
  cylinder([P.pump.rear-6,0,P.pump.centerZ],[P.pump.rear,0,P.pump.centerZ],P.pump.radius,P.pump.radius,64),
]);
const pumpVoid=cylinder([P.pump.front-.2,0,P.pump.centerZ],[P.pump.rear+.2,0,P.pump.centerZ],P.pump.bore);
const pumpBolts=[];
for(let j=0;j<6;j++) for(const x of [P.pump.front,P.pump.rear-1]) {
  const a=polar(x,18,j*60);a[2]+=P.pump.centerZ;
  pumpBolts.push(cylinder(a,[a[0]+1,a[1],a[2]],2.6,2.6,6));
}
const pumpHardware=union(pumpBolts);
add('pump','阳极循环泵','pump',C.pump,pumpOuter.subtract(union([pumpVoid,pumpHardware])),{metallic:.38,roughness:.3});
add('pump-hardware','循环泵端面紧固件','pump','#bcc8cc',pumpHardware,{metallic:.85,roughness:.25});

const os=P.outerShell, ins=P.innerShell;
const shells=buildDetailedShells({M,CS,P,union,cylinder,revolved,polar,add});
const wiring=buildWiring({M,P,C,union,cylinder,tubePath,roundPath,polar,add});

console.log(`Built ${parts.length} solid components. Checking exact intersections...`);
const report={schema:3,units:P.units,dimensionSource:'user-confirmed circumferential cells and revised assembly, 2026-10-23',
  performanceScope:'geometry only; prior thermal/power results are not recalculated',
  pumpPlacement:'stage 3 central cavity',envelopes:{length:os.rear-os.front,ductBore:2*(os.radius-os.wall),nozzleBore:2*(os.outletRadius-os.wall),motorDiameter:2*P.motor.radius,motorLength:P.motor.rear-P.motor.front,stackLength:P.stacks.at(-1).rear-P.stacks[0].front},
  modules:P.stacks.map(s=>s.modules),portCounts:Object.fromEntries(['air','hydrogen','return','cathode'].map(fluid=>[fluid,ports.filter(p=>p.fluid===fluid).length])),
  parts:parts.length,solidChecks:0,broadPhasePairs:0,collisions:[],fluidChecks:{},ports,stackChecks,
  physicalCells:stackChecks.reduce((sum,s)=>sum+s.totalPhysicalCells,0),
  layoutOverrides:{intakeInnerEnds:'both open',mainInnerShellFront:ins.front,innerContractionStart:ins.shoulder,outerWaistRadius:os.waistRadius,mainInnerShellMaximumRadius:ins.radius},
  shellGeometry:shells.verification,waterManagement:water.verification,wiring:wiring?.verification,plumbing:fluids.checks};
const errors=[];
const bounds=parts.map(p=>p.solid.boundingBox());
const overlap=(a,b)=>[0,1,2].every(k=>a.max[k]>b.min[k]+1e-5 && b.max[k]>a.min[k]+1e-5);
for(let i=0;i<parts.length;i++) for(let j=i+1;j<parts.length;j++) {
  report.broadPhasePairs++;
  if(!overlap(bounds[i],bounds[j])) continue;
  report.solidChecks++;
  const common=parts[i].solid.intersect(parts[j].solid), volume=common.volume(); common.delete();
  if(volume>0.001) report.collisions.push({a:parts[i].id,b:parts[j].id,volume});
}
console.log('Exact pair checks complete:',report.solidChecks,'collisions:',report.collisions.length);
const cathodeCircuit=union([fluids.airBore,fluids.cathodeBore,water.cathode.gasBore,water.cathode.drainBore]);
const anodeCircuit=union([fluids.anodeBore,fluids.feedBore,fluids.returnBore,pumpVoid,water.anode.gasBore,water.anode.drainBore]);
const gasSeparation=cathodeCircuit.intersect(anodeCircuit), separationVolume=gasSeparation.volume();gasSeparation.delete();
report.fluidChecks.gasSeparation={intersectionVolume:separationVolume};
if(separationVolume>.001) errors.push('Cathode/anode circuits intersect: '+separationVolume);
for(const [name,bore] of [['completeCathode',cathodeCircuit],['completeAnode',anodeCircuit]]) {
  const components=bore.decompose();
  report.fluidChecks[name]={connectedComponents:components.length};
  if(components.length!==1) errors.push(name+' disconnected: '+components.length);
  components.forEach(s=>s.delete());
  // Per-part lumen checks retain the offending part name and avoid a costly
  // union of all 3813 individual plates into the surrounding installation.
  const boreBounds=bore.boundingBox(), obstructions=[];
  for(let i=0;i<parts.length;i++) {
    if(!overlap(bounds[i],boreBounds)) continue;
    const blockage=parts[i].solid.intersect(bore),volume=blockage.volume();blockage.delete();
    if(volume>.001) obstructions.push({part:parts[i].id,volume});
  }
  report.fluidChecks[name].obstructions=obstructions;
  if(obstructions.length) errors.push(name+' lumen obstructed');
}
for(const {name,a,b} of fluids.junctionChecks??[]) {
  const join=a.intersect(b), volume=join.volume();join.delete();
  report.fluidChecks[name]={connectedVolume:volume};
  if(volume<.001) errors.push(name+' missing connection');
}
assert.equal(parts.filter(p=>p.module).length,11);
assert.equal(report.physicalCells,3813);
for(const count of Object.values(report.portCounts)) assert.equal(count,11);
report.errors=errors;
await mkdir(resolve(root,'new-design/public'),{recursive:true});
await writeFile(resolve(root,'new-design/verification.json'),JSON.stringify(report,null,2));
if(report.collisions.length || errors.length) { console.error(JSON.stringify({collisions:report.collisions,errors,fluidChecks:report.fluidChecks},null,2)); throw new Error('Assembly verification failed; model was not exported.'); }

const document=new Document(), buffer=document.createBuffer(), scene=document.createScene('New design');
const materials=new Map();
for(const part of parts) {
  const meshData=part.solid.calculateNormals(0,35).getMesh();
  const positions=new Float32Array(meshData.numVert*3), normals=new Float32Array(meshData.numVert*3);
  for(let i=0;i<meshData.numVert;i++) {
    positions.set(meshData.vertProperties.slice(i*meshData.numProp,i*meshData.numProp+3),i*3);
    normals.set(meshData.vertProperties.slice(i*meshData.numProp+3,i*meshData.numProp+6),i*3);
  }
  const metal=part.metallic??(['air','hydrogen','return'].includes(part.group)?.32:part.group==='stacks'?.22:.68);
  const rough=part.roughness??.34;
  const materialKey=`${part.color}/${metal}/${rough}`;
  if(!materials.has(materialKey)) {
    const c=new Color(part.color);
    materials.set(materialKey,document.createMaterial(materialKey).setBaseColorFactor([c.r,c.g,c.b,1]).setMetallicFactor(metal).setRoughnessFactor(rough).setDoubleSided(true));
  }
  const primitive=document.createPrimitive().setAttribute('POSITION',document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL',document.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(meshData.triVerts).setBuffer(buffer)).setMaterial(materials.get(materialKey));
  const mesh=document.createMesh(part.name).addPrimitive(primitive);
  scene.addChild(document.createNode(part.name).setMesh(mesh).setExtras({id:part.id,group:part.group,clip:part.clip||false,laminated:part.laminated||false,stage:part.stage||0,module:part.module||0,finish:part.finish||'',layerPitch:part.layerPitch||0,layerOrigin:part.layerOrigin||0,layerCount:part.layerCount||0,physicalCells:part.physicalCells||0,cellArrangement:part.cellArrangement||'',plateThickness:part.plateThickness||0,innerCoolingGap:part.innerCoolingGap||0,rotor:part.rotor||'',stationary:part.stationary||false,bladeCount:part.bladeCount||0,motorSizing:part.motorSizing||''}));
}
await new NodeIO().write(resolve(root,'new-design/public/model.glb'),document);
console.log(JSON.stringify({parts:parts.length,modules:11,checkedPairs:report.solidChecks,collisions:report.collisions.length,fluidChecks:report.fluidChecks},null,2));
