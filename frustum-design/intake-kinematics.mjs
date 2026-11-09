/**
 * Shared, dependency-free variable-intake geometry solver (millimetres).
 * X is the engine axis. The downstream attachment stays fixed. Twenty-four
 * independent wall petals and twenty-four underlapping seal petals articulate
 * over a short forward section. A fixed thin-wall duct continues from their
 * hinge station to the downstream stack. Thus the inlet can reach the previous
 * stack midpoint without multiplying the deflection sweep by the whole length.
 * A fixed-diameter drive ring translates/tilts; six telescoping actuators follow.
 * These are mechanism/display dimensions, not a nozzle performance model.
 */
const TAU = Math.PI * 2;
const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(+v) ? +v : a));
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map(x => x * k);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a, 1 / Math.hypot(...a));
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const point = (x, r, a) => [x, r*Math.cos(a), r*Math.sin(a)];
// This independent copy follows the real tapered outer surface. The inlet lip
// begins at the previous stack midpoint, not at that stack's largest front rim.
const stackOuterAt=(s,x)=>{
  const t=clamp((x-s.front)/(s.rear-s.front),0,1);
  return s.outer+((s.rearOuter??s.outer)-s.outer)*t;
};

function basis(normal) {
  const n = unit(normal);
  const reference=Math.abs(n[1])<.9?[0,1,0]:[0,0,1];
  const u = unit(sub(reference, mul(n, dot(n,reference))));
  return { n, u, v: cross(n, u) };
}
function planePoint(c, frame, r, a, axial = 0) {
  return add(add(c, mul(frame.n, axial)), add(mul(frame.u, r*Math.cos(a)), mul(frame.v, r*Math.sin(a))));
}
function signedVolume(mesh) {
  let volume = 0;
  const p = mesh.positions;
  for (let j=0; j<mesh.indices.length; j+=3) {
    const a=mesh.indices[j]*3, b=mesh.indices[j+1]*3, c=mesh.indices[j+2]*3;
    volume += p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1]) +
      p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2]) + p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);
  }
  return volume / 6;
}
function orient(mesh) {
  if (signedVolume(mesh) < 0) {
    for (let i=0; i<mesh.indices.length; i+=3) [mesh.indices[i+1], mesh.indices[i+2]]=[mesh.indices[i+2], mesh.indices[i+1]];
  }
  return mesh;
}
function quad(indices, a,b,c,d) { indices.push(a,b,c, a,c,d); }

// Closed wall volume over a rectangular parameter patch. Neither its bore nor
// its axial opening is closed with a disk. Only the actual wall edges are capped.
function wallPatch(sample, nu=8, nv=5) {
  const positions=[], indices=[];
  const index=(w,i,j)=>w*(nu+1)*(nv+1)+i*(nv+1)+j;
  for(let w=0;w<2;w++) for(let i=0;i<=nu;i++) for(let j=0;j<=nv;j++) positions.push(...sample(i/nu,j/nv,w));
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++) {
    quad(indices,index(1,i,j),index(1,i+1,j),index(1,i+1,j+1),index(1,i,j+1));
    quad(indices,index(0,i,j+1),index(0,i+1,j+1),index(0,i+1,j),index(0,i,j));
  }
  for(let j=0;j<nv;j++) {
    quad(indices,index(0,0,j),index(1,0,j),index(1,0,j+1),index(0,0,j+1));
    quad(indices,index(0,nu,j),index(0,nu,j+1),index(1,nu,j+1),index(1,nu,j));
  }
  for(let i=0;i<nu;i++) {
    quad(indices,index(0,i,0),index(0,i+1,0),index(1,i+1,0),index(1,i,0));
    quad(indices,index(0,i,nv),index(1,i,nv),index(1,i+1,nv),index(0,i+1,nv));
  }
  return orient({positions,indices});
}

// An annular tube with a real through-bore. Wrapped indexing avoids seam cracks.
function annularTube(a,b,outer,inner,n=48) {
  const f=basis(sub(b,a)), positions=[],indices=[];
  const ix=(w,k,j)=>w*2*n+k*n+(j%n);
  for(let w=0;w<2;w++) for(let k=0;k<2;k++) for(let j=0;j<n;j++) positions.push(...planePoint(k?b:a,f,w?outer:inner,j*TAU/n));
  for(let j=0;j<n;j++) {
    const j1=(j+1)%n;
    quad(indices,ix(1,0,j),ix(1,1,j),ix(1,1,j1),ix(1,0,j1));
    quad(indices,ix(0,0,j1),ix(0,1,j1),ix(0,1,j),ix(0,0,j));
    quad(indices,ix(0,0,j),ix(1,0,j),ix(1,0,j1),ix(0,0,j1));
    quad(indices,ix(0,1,j),ix(0,1,j1),ix(1,1,j1),ix(1,1,j));
  }
  return orient({positions,indices});
}
function solidCylinder(a,b,r,n=20) {
  const f=basis(sub(b,a)), positions=[],indices=[];
  for(let k=0;k<2;k++) for(let j=0;j<n;j++) positions.push(...planePoint(k?b:a,f,r,j*TAU/n));
  const ca=positions.length/3;positions.push(...a,...b);
  for(let j=0;j<n;j++) {
    const j1=(j+1)%n;
    quad(indices,j,n+j,n+j1,j1);
    indices.push(ca,j,j1,ca+1,n+j1,n+j);
  }
  return orient({positions,indices});
}
// A rod with end caps cut in the actual mating planes. This matters when a
// tilted actuator meets an untilted support: perpendicular circular end caps
// would otherwise enter the adjacent ring on one side of the connection.
function planeEndedRod(a,b,r,normalA,normalB,n=24) {
  const f=basis(sub(b,a)),positions=[],indices=[];
  for(let k=0;k<2;k++)for(let j=0;j<n;j++) {
    const radial=add(mul(f.u,r*Math.cos(j*TAU/n)),mul(f.v,r*Math.sin(j*TAU/n)));
    const normal=k?normalB:normalA;
    positions.push(...add(k?b:a,add(radial,mul(f.n,-dot(normal,radial)/dot(normal,f.n)))));
  }
  const ca=positions.length/3;positions.push(...a,...b);
  for(let j=0;j<n;j++) {
    const j1=(j+1)%n;quad(indices,j,n+j,n+j1,j1);
    indices.push(ca,j,j1,ca+1,n+j1,n+j);
  }
  return orient({positions,indices});
}
const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0];
function convexHull2(points) {
  const q=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const turn=(a,b,c)=>cross2([b[0]-a[0],b[1]-a[1]],[c[0]-b[0],c[1]-b[1]]);
  const lo=[],hi=[];
  for(const p of q){while(lo.length>1&&turn(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
  for(const p of q.toReversed()){while(hi.length>1&&turn(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}
  return [...lo.slice(0,-1),...hi.slice(0,-1)];
}
function rootedEye(center,theta,footA,footB) {
  const rv=[0,Math.cos(theta),Math.sin(theta)],tv=[0,-Math.sin(theta),Math.cos(theta)];
  const local=p=>[p[0]-center[0],dot(sub(p,center),rv)];
  const outer=convexHull2([...Array.from({length:48},(_,j)=>[2.6*Math.cos(j*TAU/48),2.6*Math.sin(j*TAU/48)]),local(footA),local(footB)]);
  const rayRadius=d=>{
    let hit=Infinity;
    for(let j=0;j<outer.length;j++){
      const a=outer[j],b=outer[(j+1)%outer.length],e=[b[0]-a[0],b[1]-a[1]],den=cross2(d,e);
      if(Math.abs(den)<1e-10)continue;
      const t=cross2(a,e)/den,u=cross2(a,d)/den;
      if(t>0&&u>=-1e-9&&u<=1+1e-9)hit=Math.min(hit,t);
    }
    return hit;
  };
  const n=64,positions=[],indices=[],ix=(w,k,j)=>w*2*n+k*n+(j%n);
  for(let w=0;w<2;w++)for(let k=0;k<2;k++)for(let j=0;j<n;j++){
    const phi=j*TAU/n,d=[Math.cos(phi),Math.sin(phi)],r=w?rayRadius(d):1.5;
    positions.push(...add(add(center,[d[0]*r,0,0]),add(mul(rv,d[1]*r),mul(tv,k?2.2:-2.2))));
  }
  for(let j=0;j<n;j++){
    const j1=(j+1)%n;
    quad(indices,ix(1,0,j),ix(1,1,j),ix(1,1,j1),ix(1,0,j1));
    quad(indices,ix(0,0,j1),ix(0,1,j1),ix(0,1,j),ix(0,0,j));
    quad(indices,ix(0,0,j),ix(1,0,j),ix(1,0,j1),ix(0,0,j1));
    quad(indices,ix(0,1,j),ix(0,1,j1),ix(1,1,j1),ix(1,1,j));
  }
  return orient({positions,indices});
}
function annularSector(x0,x1,r0,r1,a0,a1) {
  return wallPatch((u,v,w)=>point(x0+(x1-x0)*u,w?r1:r0,a0+(a1-a0)*v),1,4);
}
function bounds(mesh) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<mesh.positions.length;i+=3) for(let a=0;a<3;a++) {
    min[a]=Math.min(min[a],mesh.positions[i+a]);max[a]=Math.max(max[a],mesh.positions[i+a]);
  }
  return {min,max};
}

const STYLES={
  duct:{name:'中点引气套筒与加劲环',color:'#8398a5',metallic:.84,roughness:.29},
  flange:{name:'固定法兰与作动器支承环',color:'#647985',metallic:.82,roughness:.3},
  petals:{name:'可变截面主瓣片',color:'#a6b5bf',metallic:.88,roughness:.27},
  seals:{name:'瓣间搭接密封片',color:'#526977',metallic:.8,roughness:.38},
  hinges:{name:'空心铰链耳座',color:'#8497a2',metallic:.86,roughness:.28},
  pins:{name:'铰链销轴',color:'#d0d9dd',metallic:.93,roughness:.2},
  driveRing:{name:'平移偏转作动环',color:'#c2a35f',metallic:.8,roughness:.3},
  sleeves:{name:'六联作动套筒',color:'#6c8794',metallic:.82,roughness:.28},
  rods:{name:'六联伸缩拉杆',color:'#d0d9dd',metallic:.92,roughness:.19},
  links:{name:'瓣片同步连杆',color:'#879ba6',metallic:.87,roughness:.25},
  fasteners:{name:'法兰紧固件',color:'#c5cdd2',metallic:.9,roughness:.23},
};

/** Geometry-independent UI / validation information for one solved pose. */
export function getIntakeKinematics(P, stageNumber, state={}) {
  if(stageNumber!==2 && stageNumber!==3) throw new Error('Variable intake stage must be 2 or 3');
  const s=P.stacks[stageNumber-1],previous=P.stacks[stageNumber-2];
  const cfg=P.variableIntake??{};
  const opening=clamp(state.opening??.55,0,1);
  const pitchDeg=clamp(state.pitchDeg??0,-5,5),yawDeg=clamp(state.yawDeg??0,-5,5);
  // The complete hood reaches the preceding stage midpoint. Only its front
  // 90 mm articulates; the rest is a stationary duct. An explicit legacy anchor
  // remains available for old snapshots without baking coordinates into UI.
  const length=clamp(cfg.activeLength??cfg.length??90,60,110);
  const attachmentFront=s.front-9,attachmentRear=s.front-1;
  const midpoint=(previous.front+previous.rear)/2;
  const midpointAnchor=cfg.frontAnchor!=='stage-front';
  const leadingCenterX=midpointAnchor?midpoint:attachmentFront-length;
  const rootX=leadingCenterX+length,rootRadius=s.outer+5;
  const rootRear=Math.min(rootX+8,attachmentRear);
  if(rootX>attachmentFront+.001)throw new Error('Variable intake active section exceeds its downstream attachment');
  const minimumOffset=cfg.minimumRadialOffset??20,maximumOffset=cfg.maximumRadialOffset??60;
  const previousAtLip=stackOuterAt(previous,leadingCenterX);
  const previousAtHinge=stackOuterAt(previous,rootX);
  const leadingRadius=previousAtLip+minimumOffset+(maximumOffset-minimumOffset)*opening;
  // Ring dimensions follow the local tapered envelope and the current front
  // attachment. They remain fixed-diameter mechanical parts at every pose.
  const driveRingRadius=Math.max(previousAtLip+maximumOffset+13,rootRadius+23);
  const anchorRingRadius=driveRingRadius+10;
  const lipFrame=basis([1,Math.tan(rad(pitchDeg)),Math.tan(rad(yawDeg))]);
  const lipCenter=[leadingCenterX,length*Math.tan(rad(pitchDeg)),length*Math.tan(rad(yawDeg))];
  const ringX=rootX-43-15*opening;
  const t=(rootX-ringX)/length;
  const ringCenter=[ringX,lipCenter[1]*t,lipCenter[2]*t];
  const ringFrame=basis([1,Math.tan(rad(pitchDeg))*.7,Math.tan(rad(yawDeg))*.7]);
  return {stage:stageNumber,opening,pitchDeg,yawDeg,rootX,rootRadius,length,leadingRadius,lipCenter,lipFrame,
    ringCenter,ringFrame,driveRingRadius,anchorRingRadius,
    petals:24,seals:24,actuators:6,wallThickness:1.2,sealThickness:1.05,
    rootFront:rootX,rootRear,attachmentFront,attachmentRear,
    ductStart:rootRear,ductEnd:attachmentFront,totalLength:attachmentRear-leadingCenterX,
    previousMidpoint:midpoint,previousOuter:previousAtLip,previousFrontOuter:previous.outer,
    previousOuterAtLip:previousAtLip,previousOuterAtHinge:previousAtHinge,
    conservativeEnvelopeRadius:anchorRingRadius+30};
}

/**
 * Stable IDs and role meshes at every pose. Geometry is in world coordinates.
 * The array's grouped meshes are closed shells, including the tube/hinge bores.
 * Materials remain constant as the GUI replaces only position/index buffers.
 */
export function getIntakeGeometry(P, stageNumber, state={}) {
  const k=getIntakeKinematics(P,stageNumber,state);
  const {rootX:rx,rootRadius:rr,leadingRadius:lr,lipCenter:lc,lipFrame:lf}=k;
  const prefix=`variable-intake-${stageNumber}`;
  const bins=new Map();
  const append=(role,mesh,label)=>{
    if(!bins.has(role)) bins.set(role,{id:`${prefix}-${role}`,...STYLES[role],name:`${stageNumber}级${STYLES[role].name}`,role,
      positions:[],indices:[],members:[],variableStage:stageNumber});
    const b=bins.get(role),offset=b.positions.length/3;
    b.positions.push(...mesh.positions);
    for(const ix of mesh.indices)b.indices.push(offset+ix);
    b.members.push({name:label,bounds:bounds(mesh),volume:signedVolume(mesh),vertexStart:offset,
      vertexCount:mesh.positions.length/3,indexStart:b.indices.length-mesh.indices.length,indexCount:mesh.indices.length});
  };
  const shellPoint=(u,a,offset)=>mix(planePoint(lc,lf,lr-offset,a),point(rx,rr-offset,a),u);

  // 24 discrete main petals. Two-degree circumferential gaps are closed by
  // thinner offset seals; their 0.85 mm running clearance stays explicit.
  for(let j=0;j<24;j++) {
    const a=j*TAU/24,half=rad(6.5);
    append('petals',wallPatch((u,v,w)=>shellPoint(u,a-half+2*half*v,w?0:1.2),8,6),`主瓣片${j+1}`);
    // Short formed lip strips follow each petal independently. They retain
    // visible seams during aperture changes instead of a fictitious elastic
    // one-piece ring, and do not move the nominal leading station upstream.
    append('petals',wallPatch((u,v,w)=>shellPoint(u*3.2/k.length,a-half+2*half*v,
      -(w?1.08+.28*Math.sin(Math.PI*u):.08)),4,6),`前缘卷边${j+1}`);
    const sealAngle=a+Math.PI/24,sealHalf=rad(2.1);
    append('seals',wallPatch((u,v,w)=>shellPoint(u,sealAngle-sealHalf+2*sealHalf*v,w?2.05:3.1),8,3),`密封片${j+1}`);
  }

  // A stationary sleeve bridges the extended axial reach. Its wall and bore
  // are continuous; the three slim external bands are separate closed solids.
  // All are behind the articulated section, so changing aperture leaves the
  // final stack connection and the isolated interstage exhaust route intact.
  if(k.ductEnd>k.ductStart+.5) {
    append('duct',annularTube([k.ductStart,0,0],[k.ductEnd,0,0],rr,rr-1.2,192),'固定薄壁引气套筒');
    append('duct',annularTube([k.attachmentFront,0,0],[k.attachmentRear,0,0],rr+3.5,rr-1.2,192),'末端连接法兰');
    const span=k.ductEnd-k.ductStart;
    for(const [bandIndex,t] of [.2,.55,.86].entries()) {
      const x=k.ductStart+span*t;
      append('duct',annularTube([x-1.4,0,0],[x+1.4,0,0],rr+1.6,rr+.08,192),`环向加劲带${bandIndex+1}`);
      for(let j=0;j<12;j++) {
        const a=(j+.5)*TAU/12,n=[0,Math.cos(a),Math.sin(a)];
        const p=point(x,rr+1.72,a);
        append('fasteners',solidCylinder(p,add(p,mul(n,.8)),1.15,6),`加劲带${bandIndex+1}紧固件${j+1}`);
      }
    }
    for(let j=0;j<24;j++) {
      const p=point(k.attachmentRear,rr+1.3,j*TAU/24);
      append('fasteners',solidCylinder(p,add(p,[.65,0,0]),1.25,6),`末端法兰螺栓${j+1}`);
    }
  }

  // Fixed downstream flange and outer actuator-support ring. Radial spokes
  // terminate on the two annular faces rather than penetrating either ring.
  append('flange',annularTube([rx,0,0],[k.rootRear,0,0],rr+11,rr-3.5,192),'后端固定法兰');
  append('flange',annularTube([rx+1,0,0],[k.rootRear-1,0,0],k.anchorRingRadius+4.5,k.anchorRingRadius-4.5,192),'固定作动支承环');
  for(let j=0;j<6;j++) {
    const a=(j+.5)*TAU/6;
    // A 0.1 mm seating relief also covers the polygonal bore chord sag, so
    // differently tessellated mating arcs cannot overlap after Float32 export.
    append('flange',annularSector(rx+1,k.rootRear-1,rr+11,k.anchorRingRadius-4.6,a-rad(1),a+rad(1)),`支承辐条${j+1}`);
  }

  // Actual hollow tangential hinge barrels and separate close-fitting pins.
  // The rear-most tangent contacts the flange's front face; bore material is
  // never faked by placing a solid cylinder over another solid cylinder.
  for(let j=0;j<24;j++) {
    const a=j*TAU/24,tangent=[0,-Math.sin(a),Math.cos(a)];
    const c=point(rx-2.6,rr+8,a);
    const footA=shellPoint(1-1.8/k.length,a,-.15),footB=shellPoint(1-.35/k.length,a,-.15);
    append('hinges',rootedEye(c,a,footA,footB),`带连接臂铰耳${j+1}`);
    append('pins',solidCylinder(add(c,mul(tangent,-3.6)),add(c,mul(tangent,3.6)),1.2,20),`铰销${j+1}`);
    const boltPoint=point(k.rootRear,rr+7.2,a+rad(3));
    append('fasteners',solidCylinder(boltPoint,add(boltPoint,[.65,0,0]),1.35,6),`法兰螺栓${j+1}`);
  }

  // Fixed diameter actuation ring: changing aperture does not radially scale
  // this part. It translates axially and tilts around two independent axes.
  const rc=k.ringCenter,rf=k.ringFrame,ringR=k.driveRingRadius;
  append('driveRing',annularTube(add(rc,mul(rf.n,-2.3)),add(rc,mul(rf.n,2.3)),ringR+4.5,ringR-4.5,192),'活动同步环');

  // Six annular actuator sleeves and six smaller rods. At their overlap the rod
  // occupies the sleeve bore with a 0.85 mm radial running clearance.
  // Each end terminates at the mating ring face, not inside its solid wall.
  for(let j=0;j<6;j++) {
    const a=(j+.5)*TAU/6;
    const front=planePoint(rc,rf,ringR,a,2.3);
    const back=point(rx+1,k.anchorRingRadius,a);
    const dir=unit(sub(back,front)),len=Math.hypot(...sub(back,front));
    const p=add(front,mul(dir,3.8)),q=add(back,mul(dir,-3.8));
    append('sleeves',annularTube(mix(p,q,.35),q,3.2,2.25,28),`作动套筒${j+1}`);
    append('rods',solidCylinder(p,mix(p,q,.77),1.4,24),`伸缩杆${j+1}`);
    // Compact end saddles, separate from the telescoping portions. Their
    // contact faces have a small clearance for articulated mounting.
    append('links',planeEndedRod(front,p,2.2,rf.n,dir,24),`前端接头${j+1}`);
    append('links',planeEndedRod(q,back,2.2,dir,[1,0,0],24),`后端接头${j+1}`);
  }

  // Every petal receives an individual radial lever from the shared moving
  // ring. Its endpoints use the solved local surface position, so lever angles
  // change visibly with independent aperture and vector settings.
  for(let j=0;j<24;j++) {
    const a=j*TAU/24;
    const u=(k.ringCenter[0]-lc[0])/(rx-lc[0]);
    const onPetal=shellPoint(u,a,-2.2);
    const onRing=planePoint(rc,rf,ringR-4.5,a);
    const d=unit(sub(onRing,onPetal));
    append('links',solidCylinder(add(onPetal,mul(d,.8)),add(onRing,mul(d,-1.8)),1.35,16),`瓣片联动杆${j+1}`);
  }
  return [...bins.values()].map(b=>({...b,bounds:bounds(b),state:{opening:k.opening,pitchDeg:k.pitchDeg,yawDeg:k.yawDeg}}));
}

