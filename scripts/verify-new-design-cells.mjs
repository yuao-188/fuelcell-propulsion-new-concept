/** Verify the exported radial cell geometry, rather than trusting node counts. */
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import ManifoldModule from 'manifold-3d';
import { Matrix4, Vector3 } from 'three';
import { parameters as P } from '../new-design/parameters.mjs';
import { getStackLayout } from './stack-layout.mjs';

const root = resolve(import.meta.dirname, '..');
const modelPath = resolve(root, 'new-design/public/model.glb');
const reportPath = resolve(root, 'new-design/verification.json');
assert.equal(process.argv.length, 2, 'This verifier accepts no arguments');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const api = await ManifoldModule(); api.setup();
const { Manifold: M, Mesh } = api;
const document = await new NodeIO().read(modelPath);
const solids = [];
const overlap = (a,b) => [0,1,2].every(k => a.min[k] <= b.max[k] && b.min[k] <= a.max[k]);
const pointsOf = solid => {
  const mesh = solid.getMesh(), points = [];
  for (let i=0; i<mesh.numVert; i++) points.push(Array.from(mesh.vertProperties.slice(i*mesh.numProp, i*mesh.numProp+3)));
  return points;
};
for (const node of document.getRoot().listNodes()) {
  const extras = node.getExtras(), primitives = node.getMesh()?.listPrimitives() ?? [];
  if (!extras.id || !primitives.length) continue;
  assert.equal(primitives.length,1,`${extras.id}: expected one primitive`);
  const primitive = primitives[0], mesh = new Mesh({numProp:3,
    vertProperties:new Float32Array(primitive.getAttribute('POSITION').getArray()),
    triVerts:new Uint32Array(primitive.getIndices().getArray())});
  mesh.merge();
  const solid = new M(mesh).transform(Array.from(node.getWorldMatrix()));
  assert.equal(solid.status(),'NoError',`${extras.id}: exported mesh not watertight`);
  solids.push({id:extras.id,extras,solid,bounds:solid.boundingBox()});
}
const cylinder = (a,b,r) => {
  const z = new Vector3(...b).sub(new Vector3(...a)), length = z.length(); z.normalize();
  const aux = Math.abs(z.z)<.8 ? new Vector3(0,0,1) : new Vector3(0,1,0);
  const x = aux.cross(z).normalize(), y = z.clone().cross(x);
  return M.cylinder(length,r,r,12).transform(new Matrix4().makeBasis(x,y,z).setPosition(new Vector3(...a)).elements);
};
const polar = (x,r,t) => [x,r*Math.cos(t),r*Math.sin(t)];
const degrees = t => t*Math.PI/180;
const result = {modelBytes:(await stat(modelPath)).size, modules:[], physicalCells:0,
  minimumMeasuredThickness:Infinity,maximumMeasuredThickness:0,
  minimumMeasuredInnerCoolingGap:Infinity,maximumMeasuredInnerCoolingGap:0,
  axialCoolingProbes:0, maximumSolidObstruction:0, obstructionChecks:0, portCounts:{}};

for (let stage=1; stage<=P.stacks.length; stage++) {
  const s = P.stacks[stage-1], layout = getStackLayout(s);
  for (const module of layout.modules) {
    const id = `stack-${stage}-${module.index+1}`;
    const part = solids.find(p=>p.id===id); assert.ok(part,`${id}: missing physical cells`);
    assert.equal(part.extras.cellArrangement,'radial-circumferential',`${id}: wrong cell direction metadata`);
    assert.equal(part.extras.physicalCells,s.cells,`${id}: wrong physical cell metadata`);
    const components = part.solid.decompose();
    assert.equal(components.length,s.cells,`${id}: physical disconnected plate count differs from report`);
    const measured = components.map(component => {
      const points = pointsOf(component), centre = points.reduce((sum,p)=>sum.add(new Vector3(...p)),new Vector3()).divideScalar(points.length);
      let angle = Math.atan2(centre.z,centre.y);
      while(angle<degrees(module.centre)-Math.PI)angle+=2*Math.PI;
      while(angle>degrees(module.centre)+Math.PI)angle-=2*Math.PI;
      const c = Math.cos(angle), q = Math.sin(angle);
      const radial=points.map(p=>p[1]*c+p[2]*q), tangent=points.map(p=>-p[1]*q+p[2]*c);
      const axial=points.map(p=>p[0]);
      const thickness=Math.max(...tangent)-Math.min(...tangent);
      assert.ok(Math.abs(thickness-.55)<.00012,`${id}: exported plate thickness ${thickness}`);
      assert.ok(Math.abs(Math.min(...radial)-s.cellInner)<.00012,`${id}: inner cell radius changed`);
      assert.ok(Math.abs(Math.max(...radial)-s.cellOuter)<.00012,`${id}: outer cell radius changed`);
      assert.ok(Math.abs(Math.min(...axial)-s.front)<.00012 && Math.abs(Math.max(...axial)-s.rear)<.00012,`${id}: axial plate length changed`);
      const expectedVolume=P.cells.plateThickness*(s.rear-s.front)*(s.cellOuter-s.cellInner);
      assert.ok(Math.abs(component.volume()-expectedVolume)/expectedVolume<.0001,`${id}: a cell was cut by a port or manifold`);
      result.minimumMeasuredThickness=Math.min(result.minimumMeasuredThickness,thickness);
      result.maximumMeasuredThickness=Math.max(result.maximumMeasuredThickness,thickness);
      const frontInner = points.filter((p,i)=>Math.abs(p[0]-s.front)<.001 && radial[i]<s.cellInner+.001);
      assert.equal(frontInner.length,2,`${id}: expected two front inner corners per plate`);
      return {angle,frontInner};
    }).sort((a,b)=>a.angle-b.angle);
    for(let k=1;k<measured.length;k++) {
      const gap = Math.min(...measured[k-1].frontInner.flatMap(a=>measured[k].frontInner.map(b=>Math.hypot(...a.map((v,j)=>v-b[j])))));
      assert.ok(gap>=layout.coolingGap-1e-6 && gap<layout.coolingGap+.0004,`${id}: exported inner cooling gap ${gap}`);
      result.minimumMeasuredInnerCoolingGap=Math.min(result.minimumMeasuredInnerCoolingGap,gap);
      result.maximumMeasuredInnerCoolingGap=Math.max(result.maximumMeasuredInnerCoolingGap,gap);
    }
    // A test cylinder smaller than the stage's nominal gap traverses each channel. The
    // first/last probes also check the gaps beside circumferential end plates.
    const firstCorner=measured[0].angle-Math.atan(.275/s.cellInner);
    const lastCorner=measured.at(-1).angle+Math.atan(.275/s.cellInner);
    const angles=[(degrees(module.activeStart)+firstCorner)/2,
      ...measured.slice(1).map((plate,k)=>(plate.angle+measured[k].angle)/2),
      (lastCorner+degrees(module.activeEnd))/2];
    // Continue beyond the rear face to check the new external H2 supply spokes.
    const probeRadius=Math.min(.2,layout.coolingGap*.4);
    const probes=angles.map(theta=>cylinder(polar(s.front-.15,s.cellInner+.3,theta),polar(s.rear+9,s.cellInner+.3,theta),probeRadius));
    const probeSolid=M.union(probes), bounds=probeSolid.boundingBox();
    for(const obstacle of solids) {
      if(!overlap(bounds,obstacle.bounds))continue;
      const intersection=probeSolid.intersect(obstacle.solid), volume=Math.max(0,intersection.volume());
      intersection.delete(); result.obstructionChecks++;
      result.maximumSolidObstruction=Math.max(result.maximumSolidObstruction,volume);
      assert.ok(volume<.001,`${id}: axial cooling probes obstructed by ${obstacle.id}, ${volume} mm³`);
    }
    components.forEach(component=>component.delete()); probes.forEach(probe=>probe.delete());probeSolid.delete();
    result.physicalCells+=measured.length;result.axialCoolingProbes+=angles.length;
    result.modules.push({id,stage,module:module.index+1,physicalCells:measured.length,nominalInnerCoolingGap:layout.coolingGap,probeDiameter:2*probeRadius,axialCoolingProbes:angles.length});
    console.log(`${id}: ${measured.length} radial cells, ${angles.length} open axial cooling channels`);
  }
}
assert.equal(result.physicalCells,3813);
assert.equal(result.modules.length,11);
assert.equal(result.axialCoolingProbes,3824);
result.assemblyEnvelopes=P.stacks.map((s,i)=>{
  const frames=solids.filter(p=>p.id.startsWith(`stack-frames-${i+1}-`));
  const radius=Math.max(...frames.map(p=>Math.max(...pointsOf(p.solid).map(v=>Math.hypot(v[1],v[2])))));
  assert.ok(Math.abs(radius-s.outer)<.00012,`Stage ${i+1}: exported outer radius differs from parameter`);
  return {stage:i+1,measuredOuterDiameter:2*radius,specifiedOuterDiameter:2*s.outer};
});
assert.equal(P.stacks[2].outer*2,700,'The third stage must use the confirmed 700 mm assembly diameter');
const innerCasing=solids.find(p=>p.id==='inner-shell');
assert.ok(innerCasing,'Missing main inner casing');
assert.ok(Math.abs(innerCasing.bounds.max[0]-P.stacks[2].front)<.00012,'Inner casing must end on the third-stage front face');
assert.ok(solids.filter(p=>p.extras.group==='innerShell').every(p=>p.bounds.max[0]<=P.stacks[2].front+.00012),'Unexpected inner casing or tail cone behind third-stage front');
result.innerCasingRear=innerCasing.bounds.max[0];
assert.equal(report.ports.length,44,'Expected four independent module interfaces per module');
for(const fluid of ['air','hydrogen','return','cathode']) {
  const ports=report.ports.filter(p=>p.fluid===fluid);
  assert.equal(ports.length,11,`${fluid}: expected one interface per independent module`);
  assert.equal(report.portCounts[fluid],11,`${fluid}: report count differs from interfaces`);
  for(let stage=1;stage<=3;stage++)for(let module=1;module<=P.stacks[stage-1].modules;module++) {
    const found=ports.filter(p=>p.stage===stage&&p.module===module);
    assert.equal(found.length,1,`${fluid}: missing or duplicate interface for ${stage}-${module}`);
    assert.ok(found[0].position?.length===3&&found[0].position.every(Number.isFinite),'Interface position missing');
    if(fluid==='hydrogen') {
      const port=found[0],s=P.stacks[stage-1],r=Math.hypot(port.position[1],port.position[2]);
      assert.ok(Math.abs(r-s.outer)<.00001,`${port.id}: feed port is not on the outer cylindrical surface`);
      assert.ok(port.position[0]>s.front&&port.position[0]<s.rear,`${port.id}: feed port must enter the sidewall`);
      assert.ok(Math.abs(port.direction[0])<1e-8&&Math.abs(port.direction[1]*port.position[1]/r+port.direction[2]*port.position[2]/r+1)<1e-8,`${port.id}: hydrogen feed direction must be radially inward`);
    }
    if(fluid==='return') assert.equal(found[0].position[0],P.stacks[stage-1].front,'Hydrogen return must remain on the front face');
  }
  result.portCounts[fluid]=ports.length;
}
result.passed=true;
report.exportedCellGeometry=result;
await writeFile(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(result,null,2));
