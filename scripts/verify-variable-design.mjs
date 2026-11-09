/** Rebuild Float32 GLB solids; verify real cells, cooling voids and moving parts. */
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {createKernel} from './model-kernel.mjs';
import {getIntakeGeometry,getIntakeKinematics} from '../new-design/intake-kinematics.mjs';
import {meshComponents} from './mesh-components.mjs';

const root=resolve(import.meta.dirname,'..'),ctx=await createKernel(),{api,M,P,cylinder,union,polar}=ctx;
const path=resolve(root,'new-design/public/model.glb'),reportPath=resolve(root,'new-design/verification.json');
const doc=await new NodeIO().read(path),report=JSON.parse(await readFile(reportPath,'utf8'));
assert.equal(report.revision,'20261109-variable-intakes');
const parts=[];
for(const node of doc.getRoot().listNodes()){
  const data=node.getExtras(),primitive=node.getMesh()?.listPrimitives()[0];if(!primitive)continue;
  const mesh=new api.Mesh({numProp:3,vertProperties:new Float32Array(primitive.getAttribute('POSITION').getArray()),triVerts:new Uint32Array(primitive.getIndices().getArray())});
  mesh.merge();const solid=new M(mesh);assert.equal(solid.status(),'NoError',`${data.id}: non-watertight export`);
  assert(solid.volume()>.00001);parts.push({id:data.id,data,solid,box:solid.boundingBox()});
}
assert(!parts.some(p=>p.id==='inner-shell'),'Retired overall inner shell remains');
const result={modelBytes:(await stat(path)).size,watertightParts:parts.length,physicalCells:0,
  exactFloat32Pairs:0,collisions:[],coolingProbes:0,coolingObstructions:[],dynamicStates:[],errors:[]};
const overlap=(a,b)=>[0,1,2].every(k=>a.max[k]>b.min[k]+.0001&&b.max[k]>a.min[k]+.0001);
for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++)if(overlap(parts[i].box,parts[j].box)){
  result.exactFloat32Pairs++;const c=parts[i].solid.intersect(parts[j].solid),v=c.volume();c.delete();
  if(v>.003)result.collisions.push({a:parts[i].id,b:parts[j].id,volume:v});
}
for(let i=0;i<P.stacks.length;i++){
  const s=P.stacks[i],part=parts.find(p=>p.id===`stack-${i+1}-1`);assert(part);
  const cells=meshComponents(part.solid.getMesh());assert.equal(cells.length,s.cells,`stage ${i+1}: real plate count`);
  result.physicalCells+=cells.length;
  assert(Math.abs(part.box.min[0]-s.front)<.0003&&Math.abs(part.box.max[0]-s.rear)<.0003,'wrong axial length');
  let minRad=Infinity,maxRad=0;
  const md=part.solid.getMesh();
  for(let j=0;j<md.numVert;j++){const y=md.vertProperties[j*md.numProp+1],z=md.vertProperties[j*md.numProp+2],r=Math.hypot(y,z);minRad=Math.min(minRad,r);maxRad=Math.max(maxRad,r);}
  assert(Math.abs(minRad-s.inner)<.003,`stage ${i+1}: inner diameter drift`);
  const sidewall=parts.find(p=>p.id===`stack-sidewall-${i+1}`);assert(sidewall,`stage ${i+1}: missing cooling sidewall`);
  const coverMesh=sidewall.solid.getMesh();let assemblyOuter=maxRad;
  for(let j=0;j<coverMesh.numVert;j++)assemblyOuter=Math.max(assemblyOuter,Math.hypot(coverMesh.vertProperties[j*coverMesh.numProp+1],coverMesh.vertProperties[j*coverMesh.numProp+2]));
  assert(Math.abs(assemblyOuter-s.outer)<.003,`stage ${i+1}: assembled outer diameter drift`);
  // Probe every cooling gap through the broad active radial span, plus both end faces.
  const radius=(s.inner+s.outer)/2;
  const probes=Array.from({length:s.cells},(_,j)=>cylinder(polar(s.front-.1,radius,j*360/s.cells),polar(s.rear+.1,radius,j*360/s.cells),.22,.22,12));
  const all=union(probes),bb=all.boundingBox();
  for(const p of parts)if(overlap(bb,p.box)){
    const c=all.intersect(p.solid),v=c.volume();c.delete();
    if(v>.003)result.coolingObstructions.push({stage:i+1,part:p.id,volume:v});
  }
  all.delete();probes.forEach(p=>p.delete());result.coolingProbes+=s.cells;
  console.log(`Stage ${i+1}: ${s.cells} real cells and ${s.cells} through-cooling probes`);
}
assert.equal(result.physicalCells,1357);
for(const [id,count] of [['fan',16],['fan-stators',18],['compressor-rotor-1',18],['compressor-rotor-2',18]]){
  const p=parts.find(p=>p.id===id);assert(p);assert.equal(p.data.bladeCount,count);
}
for(const id of ['compressor-motor-1','compressor-motor-2'])assert(parts.find(p=>p.id===id));

const staticParts=parts.filter(p=>!p.data.variableStage);
// The two mechanisms cannot meet each other: >400 mm axial separation, <140 mm span.
// Sample extremes, combined two-axis extremes and intermediate apertures.
const angles=[[-5,-5],[-5,5],[5,-5],[5,5],[0,0]];
for(const stage of [2,3])for(const opening of [0,.25,.55,.75,1])for(const [pitchDeg,yawDeg] of angles){
  const pose={opening,pitchDeg,yawDeg},geometries=getIntakeGeometry(P,stage,pose),moving=[];
  for(const g of geometries){
    const solid=M.ofMesh({numProp:3,vertProperties:new Float32Array(g.positions),triVerts:new Uint32Array(g.indices)});
    assert.equal(solid.status(),'NoError',g.id);moving.push({id:g.id,solid,box:solid.boundingBox()});
  }
  let pairs=0;const collisions=[];
  for(let i=0;i<moving.length;i++){
    const a=moving[i];
    for(const b of [...staticParts,...moving.slice(i+1)])if(overlap(a.box,b.box)){
      pairs++;const c=a.solid.intersect(b.solid),v=c.volume();c.delete();
      if(v>.003)collisions.push({a:a.id,b:b.id,volume:v});
    }
  }
  const k=getIntakeKinematics(P,stage,pose);
  result.dynamicStates.push({stage,...pose,openingDiameter:k.leadingRadius*2,pairs,collisions});
  moving.forEach(p=>p.solid.delete());
  if(collisions.length)console.error('Motion collision',stage,pose,JSON.stringify(collisions));
  else console.log('Clear motion',stage,opening,pitchDeg,yawDeg);
}
if(result.collisions.length)result.errors.push('Float32 material intersection');
if(result.coolingObstructions.length)result.errors.push('Cooling passage obstructed');
if(result.dynamicStates.some(s=>s.collisions.length))result.errors.push('Motion envelope intersection');
report.exportedVerification=result;
await writeFile(reportPath,JSON.stringify(report,null,2));
if(result.errors.length){console.error(JSON.stringify({errors:result.errors,collisions:result.collisions,cooling:result.coolingObstructions},null,2));throw new Error('Exported/moving model verification failed');}
console.log('Exported geometry, physical cells, cooling gaps and 50 mechanism poses passed.');
