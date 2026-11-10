import {mkdir,writeFile,rename,copyFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import {Color} from 'three';
import {createKernel} from './model-kernel.mjs';
import {buildDetailedMachinery} from './detailed-machinery.mjs';
import {buildStraightShells} from './straight-shells.mjs';
import {buildFrustumStacks} from './frustum-stacks.mjs';
import {buildCompactFluidNetworks} from './compact-fluid-networks.mjs';
import {getIntakeGeometry} from '../../frustum-design/intake-kinematics.mjs';
import {stackRadiusAt} from '../../frustum-design/parameters.mjs';

const root=resolve(import.meta.dirname,'../..'),ctx=await createKernel();
const {M,P,C,parts,add,union,cylinder,tubePath,polar}=ctx;
console.log('Building pressure circuits and cell port seats...');
const fluids=buildCompactFluidNetworks(ctx);
console.log('Building three illustrative annular frustum stacks...');
const stacks=buildFrustumStacks(ctx,fluids);
console.log('Building retained fan and extended compressor...');
const machinery=buildDetailedMachinery(ctx);
const shells=buildStraightShells(ctx,fluids.linerCutters);
const pose={opening:P.variableIntake.defaultOpening,pitchDeg:0,yawDeg:0};
for(const stage of [2,3])for(const g of getIntakeGeometry(P,stage,pose)){
  const solid=M.ofMesh({numProp:3,vertProperties:new Float32Array(g.positions),triVerts:new Uint32Array(g.indices)});
  add(g.id,g.name??g.id,'variableIntake',g.color??'#a4b3bf',solid,
    {clip:true,stage,variableStage:stage,motionRole:g.role,finish:g.role,
      metallic:g.metallic??.85,roughness:g.roughness??.3});
}
// A single restrained external harness: split from the pressure lines in angle.
const trunkRadius=390,wireAngle=315,wirePieces=[tubePath([polar(695,trunkRadius,wireAngle),polar(P.pump.rear,trunkRadius,wireAngle)],2.2)];
for(const s of P.stacks){
  const x=s.front+(s.rear-s.front)*.2;
  wirePieces.push(tubePath([polar(x,trunkRadius,wireAngle),polar(x,stackRadiusAt(s,x)+1.2,wireAngle)],1.4));
}
add('wiring-harness','沿机匣敷设线束与三级分支','wiring','#35454e',union(wirePieces),{clip:true,metallic:.06,roughness:.6});

const report={schema:1,revision:'20261110-aft-hydrogen',units:'mm',
  dimensionSource:'new independent visual variant: axial lengths 300/250/220, gaps100; approximate diameters',
  scope:'illustrative hollow frustum stacks; lamella count is not a physical cell count',
  length:P.outerShell.rear,schematicStacks:3,
  moduleCounts:[1,1,1],portCounts:Object.fromEntries(['air','hydrogen','return','cathode'].map(k=>[k,fluids.ports.filter(p=>p.fluid===k).length])),
  ports:fluids.ports,stacks,machinery,shells,plumbing:fluids.checks,
  variableIntakes:{stages:[2,3],petalsPerStage:24,pose,deflectionRangeDeg:[-5,5],
    articulation:'independent aperture and two-axis deflection; shared browser/validation solver'},
  parts:parts.length,broadPhasePairs:0,exactPairs:0,collisions:[],fluidChecks:{},errors:[]};
assert.equal(stacks.length,3);assert.equal(report.length,1910);
assert.deepEqual(stacks.map(s=>s.axialLength),[300,250,220]);
for(const n of Object.values(report.portCounts))assert.equal(n,3);
const box=parts.map(p=>p.solid.boundingBox());
const overlap=(a,b)=>[0,1,2].every(k=>a.max[k]>b.min[k]+1e-5&&b.max[k]>a.min[k]+1e-5);
console.log('Checking exact material intersections...',parts.length);
for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
  report.broadPhasePairs++;
  if(!overlap(box[i],box[j]))continue;
  report.exactPairs++;
  const common=parts[i].solid.intersect(parts[j].solid),volume=common.volume();common.delete();
  if(volume>.001)report.collisions.push({a:parts[i].id,b:parts[j].id,volume});
}
console.log('Collision pairs:',report.collisions.length);
for(const [name,bore] of Object.entries(fluids.bores)){
  if(!['cathodeCircuit','anodeCircuit'].includes(name))continue;
  const components=bore.decompose();report.fluidChecks[name]={connectedComponents:components.length,obstructions:[]};
  if(components.length!==1)report.errors.push(`${name}: disconnected (${components.length})`);
  components.forEach(s=>s.delete());const bb=bore.boundingBox();
  for(let i=0;i<parts.length;i++)if(overlap(box[i],bb)){
    const blocked=parts[i].solid.intersect(bore),volume=blocked.volume();blocked.delete();
    if(volume>.001)report.fluidChecks[name].obstructions.push({part:parts[i].id,volume});
  }
  if(report.fluidChecks[name].obstructions.length)report.errors.push(`${name}: obstruction`);
}
const mixed=fluids.bores.cathodeCircuit.intersect(fluids.bores.anodeCircuit);
report.fluidChecks.gasSeparationVolume=mixed.volume();mixed.delete();
if(report.fluidChecks.gasSeparationVolume>.001)report.errors.push('Pressure media overlap');
for(const join of fluids.junctionChecks??[]){const common=join.a.intersect(join.b),v=common.volume();common.delete();if(v<.00001)report.errors.push(`${join.name}: disconnected junction`);}
report.fluidChecks.aftSupplyReturnOverlap=[];
for(const join of fluids.junctionChecks.filter(j=>/hydrogen-port$/.test(j.name))){
  const common=join.a.intersect(fluids.bores.return),volume=common.volume();common.delete();
  report.fluidChecks.aftSupplyReturnOverlap.push({branch:join.name,volume});
  if(volume>.001)report.errors.push(`${join.name}: aft supply bypasses into return`);
}
await mkdir(resolve(root,'frustum-design/public'),{recursive:true});
await writeFile(resolve(root,'frustum-design/verification.json'),JSON.stringify(report,null,2));
if(report.collisions.length||report.errors.length){
  console.error(JSON.stringify({collisions:report.collisions,errors:report.errors,fluidChecks:report.fluidChecks},null,2));
  throw new Error('Assembly failed; new geometry was not exported.');
}
console.log('Exporting validated geometry...');
// Inspection copies reuse the first stage's actual pipe walls. They belong to
// a separate display mode, never to the physical assembly or its audits.
for(const part of fluids.inspectionParts??[]){
  const {id,name,group,color,solid,...extra}=part;
  add(id,name,group,color,solid,extra);
}
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Hydrogen engine frustum variant');
scene.setExtras({revision:report.revision,length:report.length,schematicStacks:3,countIsIllustrative:true});
const materials=new Map();
for(const part of parts){
  const norm=part.solid.calculateNormals(0,35),data=norm.getMesh();
  const positions=new Float32Array(data.numVert*3),normals=new Float32Array(data.numVert*3);
  for(let k=0;k<data.numVert;k++)for(let a=0;a<3;a++){positions[k*3+a]=data.vertProperties[k*data.numProp+a];normals[k*3+a]=data.vertProperties[k*data.numProp+a+3];}
  const indices=new Uint32Array(data.triVerts);norm.delete();
  const metal=part.metallic??.62,rough=part.roughness??.34,key=`${part.color}/${metal}/${rough}`;
  if(!materials.has(key)){const c=new Color(part.color);materials.set(key,doc.createMaterial(key).setBaseColorFactor([c.r,c.g,c.b,1]).setMetallicFactor(metal).setRoughnessFactor(rough).setDoubleSided(true));}
  const primitive=doc.createPrimitive()
    .setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer)).setMaterial(materials.get(key));
  const {solid,color,name,metallic,roughness,...extras}=part;
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)).setExtras(extras));
}
const temporaryModel=resolve(root,'../frustum-model.building.glb');
await new NodeIO().write(temporaryModel,doc);
const modelTarget=resolve(root,'frustum-design/public/model.glb');
try { await rename(temporaryModel,modelTarget); }
catch(error) {
  // Windows may keep the development server's old file handle open. The
  // complete validated temporary GLB can still replace its contents safely.
  if(!['EPERM','EACCES'].includes(error.code))throw error;
  await copyFile(temporaryModel,modelTarget);await unlink(temporaryModel);
}
console.log(JSON.stringify({parts:parts.length,schematicStacks:3,exactPairs:report.exactPairs,collisions:0},null,2));
