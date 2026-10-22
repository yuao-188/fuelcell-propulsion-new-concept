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

// One continuous air void is subtracted from the union of all its outer walls.
// This creates genuine tee openings; cylinders are never merely overlaid.
const airOuter = [cylinder([P.compressor.outlet,0,0],[P.air.end,0,0],P.air.outer)];
const airVoid = [cylinder([P.compressor.outlet-.1,0,0],[P.air.end+.1,0,0],P.air.inner)];
const airEnvelopes = [];
P.stacks.forEach((s, i) => {
  const x=(s.front+s.rear)/2, r=s.inner+P.air.ringInset;
  const outerRing=torus(x,r,P.air.branchOuter), innerRing=torus(x,r,P.air.branchInner);
  airOuter.push(outerRing); airVoid.push(innerRing);
  airEnvelopes.push(torus(x,r,P.air.branchOuter+P.clearance));
  for(const sign of [-1,1]) {
    airOuter.push(cylinder([x,0,0],[x,sign*r,0],P.air.branchOuter));
    airVoid.push(cylinder([x,0,0],[x,sign*r,0],P.air.branchInner));
    airEnvelopes.push(cylinder([x,0,0],[x,sign*(r+1),0],P.air.branchOuter+P.clearance));
    ports.push({id:`air-${i+1}-${sign}`,fluid:'air',stage:i+1,face:'inner',position:[x,sign*s.inner,0]});
  }
});
const airBore=union(airVoid), airSolid=union(airOuter).subtract(airBore), airClearance=union(airEnvelopes);
add('air-network','中央空气主管 · 六根支管 · 模块连接管','air',C.air,airSolid,{clip:true});

const H=P.hydrogen;
const feedTrunk=[[P.stacks[0].rear+H.faceOffset,0,-H.offset],[H.inletX,0,-H.offset]];
const returnTrunk=roundPath([[P.stacks[0].front-H.faceOffset,0,H.offset],[P.pump.front-25,0,H.offset],[P.pump.front-13,0,P.pump.centerZ],[P.pump.front,0,P.pump.centerZ]],8);
const loopX=P.pump.rear+25, loopRadius=P.pump.centerZ;
const pumpReturn=[[P.pump.rear,0,P.pump.centerZ],[loopX,0,P.pump.centerZ]];
for(let i=1;i<=20;i++) { const a=i*Math.PI/20; pumpReturn.push([loopX,loopRadius*Math.sin(a),loopRadius*Math.cos(a)]); }
pumpReturn.push([loopX,0,-H.offset]);
const feedPaths=[feedTrunk,pumpReturn], returnPaths=[returnTrunk];
const feedInternalOuter=[], feedInternalVoid=[], returnInternalOuter=[], returnInternalVoid=[], stackCutters=[], anodeOuter=[], anodeVoid=[];
P.stacks.forEach((s,i)=>{
  const r=s.inner+H.ringInset, xf=s.rear-18, xr=s.front+18;
  const fo=[torus(xf,r,H.ringOuter)], fi=[torus(xf,r,H.ringInner)];
  const ro=[torus(xr,r,H.ringOuter)], ri=[torus(xr,r,H.ringInner)];
  const cutters=[torus(xf,r,H.ringOuter+P.clearance),torus(xr,r,H.ringOuter+P.clearance)];
  for(const [j,theta] of [-15,195].entries()) {
    const port=polar(s.rear,r,theta), ringPoint=polar(xf,r,theta);
    feedPaths.push(roundPath([[s.rear+H.faceOffset,0,-H.offset],[s.rear+H.faceOffset,port[1],port[2]],port],4));
    fo.push(cylinder(ringPoint,port,H.outer));
    fi.push(cylinder(ringPoint,[port[0]+.1,port[1],port[2]],H.inner));
    cutters.push(cylinder([xf-1,port[1],port[2]],[s.rear+1,port[1],port[2]],H.outer+P.clearance));
    ports.push({id:`feed-${i+1}-${j}`,fluid:'hydrogen',stage:i+1,face:'rear',position:port});
  }
  for(const [j,theta] of [15,165].entries()) {
    const port=polar(s.front,r,theta), ringPoint=polar(xr,r,theta);
    returnPaths.push(roundPath([port,[s.front-H.faceOffset,port[1],port[2]],[s.front-H.faceOffset,0,H.offset]],4));
    ro.push(cylinder(port,ringPoint,H.outer));
    ri.push(cylinder([port[0]-.1,port[1],port[2]],ringPoint,H.inner));
    cutters.push(cylinder([s.front-1,port[1],port[2]],[xr+1,port[1],port[2]],H.outer+P.clearance));
    ports.push({id:`return-${i+1}-${j}`,fluid:'return',stage:i+1,face:'front',position:port});
  }
  const moduleChannelsOuter=[],moduleChannelsVoid=[];
  for(let j=0;j<s.modules;j++) {
    const theta=s.firstSeam+(j+.5)*360/s.modules;
    const a=polar(xr,r,theta),b=polar(xf,r,theta);
    moduleChannelsOuter.push(cylinder(a,b,H.ringOuter));
    moduleChannelsVoid.push(cylinder(a,b,H.ringInner));
    cutters.push(cylinder(a,b,H.ringOuter+P.clearance));
  }
  anodeOuter.push(union(moduleChannelsOuter));anodeVoid.push(union(moduleChannelsVoid));
  feedInternalOuter.push(union(fo)); feedInternalVoid.push(union(fi));
  returnInternalOuter.push(union(ro)); returnInternalVoid.push(union(ri));
  stackCutters.push(union(cutters));
});
const feedOuter=union(feedPaths.map(p=>tubePath(p,H.outer))), returnOuter=union(returnPaths.map(p=>tubePath(p,H.outer)));
const feedBore=union([...feedPaths.map(p=>tubePath(p,H.inner,.15)),...feedInternalVoid]);
const returnBore=union([...returnPaths.map(p=>tubePath(p,H.inner,.15)),...returnInternalVoid]);
const moduleHydrogenBore=union([...anodeVoid,feedBore,returnBore]);
add('hydrogen-network','氢气供给 · 泵后回接','hydrogen',C.hydrogen,feedOuter.subtract(feedBore));
add('return-network','阳极回气 · 汇集到循环泵','return',C.return,returnOuter.subtract(returnBore));

P.stacks.forEach((s,i)=>{
  const cut=union([airClearance,stackCutters[i]]);
  buildDetailedStack({M,P,C,union,cylinder,sector,polar,add,s,i,cut});
  // Grey sealed manifold inserts carry the internal passages across module seams.
  // Their outer diameters have matching cutouts in every neighbouring module.
  add(`anode-internal-${i+1}`,`第${i+1}级阳极供回歧管与模块内部通道`,'anodeInternal',C.internal,
    union([feedInternalOuter[i],returnInternalOuter[i],anodeOuter[i]]).subtract(moduleHydrogenBore),{clip:true});
});

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

console.log(`Built ${parts.length} solid components. Checking exact intersections...`);
const report={schema:2,units:P.units,dimensionSource:'report_构型计算_完整版.md with user-specified casing and bay revisions',pumpPlacement:'inside stage 3 central cavity, as confirmed by user',envelopes:{length:os.rear-os.front,ductBore:2*(os.radius-os.wall),nozzleBore:2*(os.outletRadius-os.wall),motorDiameter:2*P.motor.radius,motorLength:P.motor.rear-P.motor.front,stackLength:P.stacks.at(-1).rear-P.stacks[0].front},modules:P.stacks.map(s=>s.modules),portCounts:{air:6,hydrogen:6,return:6},parts:parts.length,solidChecks:0,broadPhasePairs:0,collisions:[],fluidChecks:{},ports};
report.layoutOverrides={source:'latest red outer / yellow inner outline and open-inner-sleeve confirmation',intakeLength:P.motorHousing.rear-P.motorHousing.front,compressorLength:P.compressor.outlet-P.compressor.front,intakeInnerEnds:'both open',mainInnerShellFront:ins.front,outerWaistRadius:os.waistRadius,mainInnerShellMaximumRadius:ins.radius};
report.shellGeometry=shells.verification;
const bounds=parts.map(p=>p.solid.boundingBox());
for(const id of ['fan','main-motor','compressor-drive','inner-shell']) {
  const pieces=parts.find(p=>p.id===id).solid.decompose();
  assert.equal(pieces.length,1,id+' must remain one connected component');
  pieces.forEach(s=>s.delete());
}
const overlap=(a,b)=>[0,1,2].every(k=>a.max[k]>b.min[k]+1e-5 && b.max[k]>a.min[k]+1e-5);
for(let i=0;i<parts.length;i++) for(let j=i+1;j<parts.length;j++) {
  report.broadPhasePairs++;
  if(!overlap(bounds[i],bounds[j])) continue;
  report.solidChecks++;
  const common=parts[i].solid.intersect(parts[j].solid), volume=common.volume(); common.delete();
  if(volume>0.02) report.collisions.push({a:parts[i].id,b:parts[j].id,volume});
}
for(const [name,a,b] of [['air/hydrogen',airBore,feedBore],['air/return',airBore,returnBore],['hydrogen/return',feedBore,returnBore]]) {
  const intersection=a.intersect(b), volume=intersection.volume(); intersection.delete();
  report.fluidChecks[name]={intersectionVolume:volume};
  assert.ok(volume<.001,`Fluids cross: ${name}`);
}
const fullHydrogenBore=union([moduleHydrogenBore,pumpVoid]);
for(const [label,a,b] of [['pump-inlet',pumpVoid,returnBore],['pump-outlet',pumpVoid,feedBore],
  ...anodeVoid.flatMap((v,i)=>[[`anode-${i+1}-feed`,v,feedBore],[`anode-${i+1}-return`,v,returnBore]])]) {
  const junction=a.intersect(b),volume=junction.volume();
  assert.ok(volume>.001,label+' must have an open connection');
  junction.delete();
}
const gasSeparation=airBore.intersect(fullHydrogenBore);
assert.ok(gasSeparation.volume()<.001,'Air and full anode circuit must remain separate');
gasSeparation.delete();
const completeLoop=fullHydrogenBore.decompose();
report.fluidChecks.completeAnodeLoop={connectedComponents:completeLoop.length,internalModuleChannels:11,pumpConnected:true};
assert.equal(completeLoop.length,1,'Anode circuit, module channels and pump must be connected');
completeLoop.forEach(s=>s.delete());
const allSolids=union(parts.map(p=>p.solid));
for(const [name,bore] of [['air',airBore],['completeAnode',fullHydrogenBore]]) {
  const blockage=allSolids.intersect(bore),volume=blockage.volume();
  report.fluidChecks[name+'Obstruction']={solidVolumeInsideLumen:volume};
  assert.ok(volume<.02,`${name} bore obstructed by solid material: ${volume}`);
  blockage.delete();
}
for(const [name,bore] of [['air',airBore],['hydrogen',feedBore],['return',returnBore]]) {
  const components=bore.decompose();
  report.fluidChecks[name]={connectedComponents:components.length};
  assert.equal(components.length,1,`${name} lumen disconnected`);
  components.forEach(s=>s.delete());
}
assert.equal(parts.filter(p=>p.module).length,11);
await mkdir(resolve(root,'new-design/public'),{recursive:true});
await writeFile(resolve(root,'new-design/verification.json'),JSON.stringify(report,null,2));
if(report.collisions.length) { console.error(JSON.stringify(report.collisions,null,2)); throw new Error('Physical intersections must be resolved before exporting.'); }

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
  scene.addChild(document.createNode(part.name).setMesh(mesh).setExtras({id:part.id,group:part.group,clip:part.clip||false,laminated:part.laminated||false,stage:part.stage||0,module:part.module||0,finish:part.finish||'',layerPitch:part.layerPitch||0,layerOrigin:part.layerOrigin||0,layerCount:part.layerCount||0}));
}
await new NodeIO().write(resolve(root,'new-design/public/model.glb'),document);
console.log(JSON.stringify({parts:parts.length,modules:11,checkedPairs:report.solidChecks,collisions:report.collisions.length,fluidChecks:report.fluidChecks},null,2));
