import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  stackSizing, stackFaces, injectorLayouts, modelBounds, galleryEndX,
  mainFlowOuterRadius, freshOuterSkinRadius,
  createNewConceptPropulsion, createAirPaths,
} from '../src/new-model.ts';

const assembly = createNewConceptPropulsion();
const stackGroups = assembly.parts.filter(p => /^环形电堆 \d+$/.test(p.group.name));
assert.equal(stackGroups.length, 3, 'Exactly three stack assemblies');
assert.equal(assembly.parts.some(p => /区间.*(?:风扇|电机)/.test(p.group.name)), false);
assert.equal(assembly.rotors.length, 2, 'Only main fan and supply rim fan remain');
assert.deepEqual(stackSizing.map(s => [s.activeRadial, s.activeAxial]), [[136,120],[158,103],[180,90]]);

const mainFan = assembly.root.getObjectByName('直径1米主风扇');
assert.ok(mainFan);
const mainRotor = assembly.rotors.find(r => r.group.parent === mainFan).group;
assert.equal(mainRotor.position.x, -252, 'Main fan physical station unchanged');
assert.equal(mainRotor.children.length, 9, 'Eight blades and one hub');
let fanRadius=0;
for (const blade of mainRotor.children.slice(0,8)) {
  const positions=blade.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++) fanRadius=Math.max(fanRadius,Math.hypot(positions.getY(i),positions.getZ(i)));
}
assert.ok(Math.abs(2*fanRadius-1000)<0.1, 'Main fan swept diameter Ø1000');

for (let i=0; i<3; i++) {
  const {front,rear} = stackFaces[i];
  const stack = stackSizing[i];
  const injector = injectorLayouts[i];
  assert.equal(rear-front, stack.mechanicalAxial);
  assert.ok(injector.slotEnd <= front-7, 'Injection slot clears downstream stack');
  assert.ok(injector.slotStart >= (i ? stackFaces[i-1].rear+7 : 275+7), 'Injection slot clears previous component');
  assert.equal(injector.slotEnd-injector.slotStart, 36);
  // Cell thickness must fit the smallest circumferential pitch at the bore.
  assert.ok(1 < 2*Math.PI*75/stack.cells);
  for (let x=front; x<=rear; x+=0.5) {
    const innerSkin = mainFlowOuterRadius(x)-6;
    assert.ok(innerSkin > stack.outerDiameter/2+10, `Stack ${i+1} and tie rods clear core shell at ${x}`);
    assert.ok(freshOuterSkinRadius(x)-7 > mainFlowOuterRadius(x)+40, 'Gallery remains open');
  }
}

const paths = createAirPaths();
assert.equal(paths.supplyInduction.length, 3*32);
let sampleCount=0;
for (const [name,curves] of Object.entries(paths)) for (const curve of curves) {
  let previous=-Infinity;
  for(let i=0;i<=256;i++) {
    const p=curve.getPoint(i/256);
    assert.ok([p.x,p.y,p.z].every(Number.isFinite), `${name} finite path`);
    assert.ok(p.x >= previous-0.01, `${name} flow does not reverse axially`);
    const arcPoint=curve.getPointAt(i/256);
    assert.ok([arcPoint.x,arcPoint.y,arcPoint.z].every(Number.isFinite), `${name} finite animation point`);
    if (name === 'supply' && p.x >= 0 && p.x <= galleryEndX) {
      assert.ok(freshOuterSkinRadius(p.x)-7-Math.hypot(p.y,p.z) > 3, 'Supply flow clears outer duct skin');
    }
    previous=p.x; sampleCount++;
  }
}

for (const amount of [0.15,0.65,1]) {
  const layout=assembly.axialLayout(amount);
  const ranges=assembly.parts.map(p=>{
    const b=new THREE.Box3().setFromObject(p.group);
    const offset=layout.offsets.get(p.group);
    assert.ok(Number.isFinite(offset));
    return [b.min.x+offset,b.max.x+offset];
  }).sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<ranges.length;i++) assert.ok(ranges[i][0]>ranges[i-1][1], 'Exploded components do not intersect');
}
const bounds = new THREE.Box3().setFromObject(assembly.root);
assert.ok(bounds.min.x >= modelBounds.minX-1 && bounds.max.x <= modelBounds.maxX+1);
console.log(JSON.stringify({stacks:3,rotors:2,injectors:3,mainFanDiameter:1000,stackFaces,modelBounds,flowSamples:sampleCount},null,2));
