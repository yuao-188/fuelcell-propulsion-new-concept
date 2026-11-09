import {meshComponents,selectMeshComponents} from './mesh-components.mjs';

/** Complete circumferential cell rings, with locally seated services only.
 * Report diameters refer to the plate envelope. The pitch is distributed around
 * the exact bore rather than enlarging that bore to make a nominal pitch exact.
 */
export function getAnnularStackLayout(s, P) {
  const count = s.cells, thickness = P.cells.plateThickness;
  if (!Number.isInteger(count) || count < 3) throw new Error('Invalid stage cell count');
  const step = 2 * Math.PI / count;
  return { count, thickness, step, inner: s.inner, outer: s.outer,
    // Rectangular outer corners are relieved by 0.0001 mm to respect the exact OD.
    outerFlat: Math.sqrt(s.outer * s.outer - thickness * thickness / 4) - .0001,
    innerGap: 2 * s.inner * Math.sin(step / 2) - thickness * Math.cos(step / 2),
    outerGap: 2 * s.outer * Math.sin(step / 2) - thickness * Math.cos(step / 2),
    plateAngles: Array.from({ length: count }, (_, n) => (n + .5) * step) };
}

export function buildAnnularStacks(ctx, { stackCutters = [], linerCutters } = {}) {
  const { M, P, C, union, cylinder, add } = ctx;
  const checks = [];
  for (const [i, s] of P.stacks.entries()) {
    const L = getAnnularStackLayout(s, P), stage = i + 1;
    console.log('Annular stage',stage,'prepare seats');
    const vertices = new Float32Array(L.count * 24), faces = new Uint32Array(L.count * 36);
    const corners = [
      [s.front, L.inner, -L.thickness / 2], [s.rear, L.inner, -L.thickness / 2],
      [s.rear, L.outerFlat, -L.thickness / 2], [s.front, L.outerFlat, -L.thickness / 2],
      [s.front, L.inner, L.thickness / 2], [s.rear, L.inner, L.thickness / 2],
      [s.rear, L.outerFlat, L.thickness / 2], [s.front, L.outerFlat, L.thickness / 2],
    ];
    const triangles = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
    L.plateAngles.forEach((theta, n) => {
      const c = Math.cos(theta), q = Math.sin(theta);
      corners.forEach(([x,y,z], k) => vertices.set([x,y*c-z*q,y*q+z*c], (n*8+k)*3));
      triangles.forEach((index,k) => { faces[n*36+k] = index+n*8; });
    });
    const raw = M.ofMesh({ numProp:3, vertProperties:vertices, triVerts:faces });
    if (raw.status() !== 'NoError') throw new Error(`Stage ${stage}: cell mesh failed`);
    const rawVolume=raw.volume();
    // Four narrow circumferential ties seat only at the inner/outer corners.
    // They do not cover either axial face or the broad cooling-channel windows.
    const ties = [], tiePockets=[];
    for (const x of [s.front+10, s.rear-10]) for (const [inside,outside] of [
      [s.inner,s.inner+.65],[s.outer-.65,s.outer],
    ]) {
      ties.push(cylinder([x-1,0,0],[x+1,0,0],outside,outside,512)
        .subtract(cylinder([x-1.1,0,0],[x+1.1,0,0],inside,inside,512)));
      // Positive machining relief avoids tangent zero-volume edge burrs when
      // the seated corner geometry is rounded to Float32 for the browser.
      tiePockets.push(cylinder([x-1.025,0,0],[x+1.025,0,0],outside+.025,outside+.025,512)
        .subtract(cylinder([x-1.1,0,0],[x+1.1,0,0],inside-.025,inside-.025,512)));
    }
    const tieSolid = union(ties), services = stackCutters[i];
    const sidewall=cylinder([s.front,0,0],[s.rear,0,0],s.outer,s.outer,512)
      .subtract(cylinder([s.front-.1,0,0],[s.rear+.1,0,0],s.outer-.3,s.outer-.3,512));
    const sidewallSeat=cylinder([s.front-.025,0,0],[s.rear+.025,0,0],s.outer+.025,s.outer+.025,512)
      .subtract(cylinder([s.front-.1,0,0],[s.rear+.1,0,0],s.outer-.325,s.outer-.325,512));
    const cuts = services ? union([...tiePockets,sidewallSeat,services]) : union([...tiePockets,sidewallSeat]);
    const seated = raw.subtract(cuts);
    // A root-rail pocket can separate a very thin shaving from the inner edge
    // of its neighbouring plate. Such offcuts are not installed components.
    // Assign every real connected piece to its original angular plate, retain
    // that plate's full-length main body and explicitly discard only offcuts.
    // Work on actual shared triangle connectivity in JS, avoiding hundreds of
    // simultaneously allocated WASM solids during per-plate component cleanup.
    const seatedMesh=seated.getMesh(),components=meshComponents(seatedMesh),buckets=Array.from({length:L.count},()=>[]);
    console.log('Annular stage',stage,'raw components',components.length);
    for(const piece of components){
      const box=piece.box;
      let theta=Math.atan2(box.min[2]+box.max[2],box.min[1]+box.max[1]);
      if(theta<0)theta+=Math.PI*2;
      const index=Math.min(L.count-1,Math.floor(theta/L.step));
      buckets[index].push({piece,volume:piece.volume,box});
    }
    const nominalPlateVolume=L.thickness*(L.outerFlat-L.inner)*(s.rear-s.front),kept=[],offcuts=[];
    for(const [index,items]of buckets.entries()){
      items.sort((a,b)=>b.volume-a.volume);const main=items[0];
      if(!main||main.volume<nominalPlateVolume*.97||Math.abs(main.box.min[0]-s.front)>.0001||Math.abs(main.box.max[0]-s.rear)>.0001)
        throw new Error(`Stage ${stage}, plate ${index}: missing or damaged full-length main plate`);
      kept.push(main.piece);
      for(const item of items.slice(1)){
        if(item.volume>nominalPlateVolume*.004)throw new Error(`Stage ${stage}: substantial plate fragment cannot be discarded`);
        offcuts.push({plate:index,volume:item.volume,bounds:item.box});
      }
    }
    const plates=M.ofMesh(selectMeshComponents(seatedMesh,kept));
    console.log('Annular stage',stage,'cleaned',plates.status(),plates.numTri());
    if(meshComponents(plates.getMesh()).length!==L.count)throw new Error(`Stage ${stage}: actual connected plate count differs`);
    for(const temporary of [seated,cuts,raw])temporary.delete();
    const frame = tieSolid.subtract(services?union([sidewallSeat,services]):sidewallSeat);
    add(`stack-${stage}-1`, `第${stage}级完整环形电堆 · ${L.count}片环向单电池`, 'stacks', C.stack, plates,
      { stage, module:1, clip:true, physicalCells:L.count, layerCount:L.count,
        cellArrangement:'radial-circumferential', plateThickness:L.thickness,
        innerCoolingGap:L.innerGap, metallic:.18, roughness:.49,
        finish:'graphite-plates', localPortSeats:true });
    add(`stack-frames-${stage}-1`, `第${stage}级内外缘窄带装配箍`, 'stacks', C.plate, frame,
      { stage, clip:true, metallic:.83, roughness:.29, finish:'machined-aluminium' });
    add(`stack-sidewall-${stage}`,`第${stage}级独立外周薄密封 · 冷却气隔离`,'stacks',C.internal,
      sidewall.subtract(linerCutters??services),
      {stage,clip:true,metallic:.64,roughness:.36,finish:'thin-cooling-seal',wallThickness:.3});
    checks.push({ stage, modules:1, totalPhysicalCells:L.count,
      physicalCellsPerModule:[L.count], plateThickness:L.thickness,
      innerDiameter:2*s.inner, outerDiameter:2*s.outer, axialLength:s.rear-s.front,
      nominalInnerPitch:P.cells.nominalPitch, constructedInnerPitch:2*Math.PI*s.inner/L.count,
      constructedInnerCoolingGap:L.innerGap, outerCoolingGap:L.outerGap,
      coolingDirection:'front-to-rear', fullAxialEndFacesOpen:true,
      localSeating:'four 2-mm-wide corner ties and local pressure-channel pockets',
      nominalUncutPlateVolume:nominalPlateVolume,
      verifiedConnectedPlateCount:kept.length,cornerSeatRelief:.025,
      removedMachiningOffcuts:offcuts,removedOffcutVolume:offcuts.reduce((sum,p)=>sum+Math.max(0,p.volume),0),
      outerCoolingSeal:{wallThickness:.3,outerDiameter:s.outer*2,plateSeatingZone:.325,axialEndFaces:'open'},
      plateMaterialRetainedFraction:plates.volume()/rawVolume });
    for(const temporary of [...ties,...tiePockets,tieSolid,sidewall,sidewallSeat])temporary.delete();
  }
  return checks;
}
