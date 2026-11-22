import { getCompressorCasingProfile } from './two-stage-compressor.mjs';

/** Open three-arm front load path; independent of the downstream stack rails. */
export function buildFrontInstallation(ctx) {
  const {P,C,M,CS,union,cylinder,polar,add}=ctx;
  const seam=P.compressor.front, shellRear=P.outerShell.rear;
  const shellBore=P.outerShell.radius-P.outerShell.wall;
  const flangeOuter=P.outerShell.radius+19, outerBoltRadius=P.outerShell.radius+12;
  const jointRadius=P.motorHousing.outer+23, jointBoltRadius=jointRadius-11;
  const armAngles=[30,150,270];
  const curve=getCompressorCasingProfile(P);
  const outerAt=x=>{
    const r=curve.innerAt(x),ratio=(r-P.air.inner)/(P.compressor.inner-P.air.inner);
    return r+(P.air.outer-P.air.inner)+(P.compressor.outer-P.compressor.inner-(P.air.outer-P.air.inner))*ratio;
  };
  const lathe=(outside,inside,n=128)=>new CS([[
    ...outside.map(([x,r])=>[r,x]),...inside.toReversed().map(([x,r])=>[r,x]),
  ]]).revolve(n).rotate([0,90,0]);
  const ring=(a,b,ro,ri,n=128)=>lathe([[a,ro],[b,ro]],[[a,ri],[b,ri]],n);
  const axis=(a,b,r,n=32)=>cylinder([a,0,0],[b,0,0],r,r,n);
  const emit=(id,name,color,solid,finish='machined-aluminium',extra={})=>
    add(id,name,'frontMount',color,solid,{clip:true,metallic:.86,roughness:.29,finish,...extra});

  // These seats replace only the casing material at the joint. The new flange
  // bores continue both existing lumens and the casing ends meet on exact planes.
  const intakeSeats=axis(seam-10,seam+.02,jointRadius+2,128);
  const compressorSeats=axis(seam-.02,seam+10,jointRadius+2,128);
  const blueRaw=lathe([
    [seam-10,P.motorHousing.outer],[seam-6,P.motorHousing.outer+6],
    [seam-6,jointRadius-1],[seam-5,jointRadius],[seam-.15,jointRadius],
  ],[[seam-10,P.motorHousing.inner],[seam-.15,P.motorHousing.inner]]);
  const goldInside=Array.from({length:17},(_,i)=>{
    const x=seam+.15+9.85*i/16;return [x,curve.innerAt(x)];
  });
  const goldRaw=lathe([
    [seam+.15,jointRadius],[seam+5,jointRadius],[seam+6,jointRadius-1],
    [seam+6,P.motorHousing.outer+6],[seam+10,outerAt(seam+10)],
  ],goldInside);
  const gasketRaw=ring(seam-.15,seam+.15,jointRadius-2,P.motorHousing.inner);
  const jointHoles=[],outerHoles=[],bolts=[],washers=[],nuts=[];
  function washerAt(x0,x1,radius,angle,outer,inner){
    const p=x=>polar(x,radius,angle);
    return cylinder(p(x0),p(x1),outer,outer,32)
      .subtract(cylinder(p(x0-.05),p(x1+.05),inner,inner,32));
  }
  for(let i=0;i<12;i++){
    const angle=15+30*i,p=x=>polar(x,jointBoltRadius,angle);
    jointHoles.push(cylinder(p(seam-10.1),p(seam+10.1),2.6,2.6,32));
    washers.push(washerAt(seam-7.2,seam-6,jointBoltRadius,angle,5.2,2.4));
    washers.push(washerAt(seam+6,seam+7.2,jointBoltRadius,angle,5.2,2.4));
    const head=cylinder(p(seam-10.2),p(seam-7.2),4.5,4.5,6)
      .subtract(cylinder(p(seam-10.3),p(seam-8.7),1.8,1.8,6));
    bolts.push(union([head,cylinder(p(seam-7.2),p(seam+11.5),2.2,2.2,32)]));
    nuts.push(cylinder(p(seam+7.2),p(seam+11.2),4.5,4.5,6)
      .subtract(cylinder(p(seam+7.1),p(seam+11.3),2.35,2.35,32)));
  }
  const jointHoleSolid=union(jointHoles);
  const blue=blueRaw.subtract(jointHoleSolid),gold=goldRaw.subtract(jointHoleSolid);
  const gasket=gasketRaw.subtract(jointHoleSolid);

  // Matching 24-hole ring uses the retained fan-casing flange's existing holes.
  // The bolts are inserted from the rear; no new cut in the old nacelle is needed.
  for(let i=0;i<24;i++){
    const angle=7.5+15*i,p=x=>polar(x,outerBoltRadius,angle);
    outerHoles.push(cylinder(p(shellRear-.05),p(shellRear+8.05),2.4,2.4,24));
    washers.push(washerAt(shellRear+8,shellRear+9.2,outerBoltRadius,angle,4.2,2.25));
    const head=cylinder(p(shellRear+9.2),p(shellRear+13.3),4,4,6)
      .subtract(cylinder(p(shellRear+11.7),p(shellRear+13.4),1.6,1.6,6));
    bolts.push(union([cylinder(p(shellRear-6),p(shellRear+9.2),2.05,2.05,24),head]));
  }
  const outerRing=ring(shellRear,shellRear+8,flangeOuter,shellBore,192);

  function arm(angle){
    const vertices=[],triangles=[],steps=16,perimeter=8;
    for(let i=0;i<=steps;i++){
      const t=i/steps,r=(shellBore+3)+(jointRadius-2-shellBore-3)*t;
      const bow=t+.045*Math.sin(Math.PI*t);
      const x=shellRear+4+(seam-3-shellRear-4)*bow;
      const hx=3.8-1.2*t,hz=14-5*t,chamfer=.9;
      const section=[[-hx+chamfer,-hz],[hx-chamfer,-hz],[hx,-hz+chamfer],
        [hx,hz-chamfer],[hx-chamfer,hz],[-hx+chamfer,hz],[-hx,hz-chamfer],[-hx,-hz+chamfer]];
      for(const [dx,z]of section)vertices.push(x+dx,r,z);
    }
    for(let k=0;k<steps;k++)for(let j=0;j<perimeter;j++){
      const a=k*perimeter+j,b=k*perimeter+(j+1)%perimeter,c=b+perimeter,d=a+perimeter;
      triangles.push(a,b,c,a,c,d);
    }
    for(const end of [0,steps]){
      const start=end*perimeter;
      for(let j=1;j<perimeter-1;j++)triangles.push(...(end===0?[start,start+j+1,start+j]:[start,start+j,start+j+1]));
    }
    let signed=0;
    for(let i=0;i<triangles.length;i+=3){
      const a=triangles[i]*3,b=triangles[i+1]*3,c=triangles[i+2]*3;
      signed+=vertices[a]*(vertices[b+1]*vertices[c+2]-vertices[b+2]*vertices[c+1])
        +vertices[a+1]*(vertices[b+2]*vertices[c]-vertices[b]*vertices[c+2])
        +vertices[a+2]*(vertices[b]*vertices[c+1]-vertices[b+1]*vertices[c]);
    }
    if(signed<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
    return M.ofMesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(triangles)})
      .rotate([angle,0,0]);
  }
  // Integral outer ring and arms terminate against the blue flange's true
  // curved seat. Subtract its whole unperforated envelope, avoiding tiny slivers.
  const frame=union([outerRing,...armAngles.map(arm)])
    .subtract(union([blueRaw,goldRaw,gasketRaw,...outerHoles]));
  emit('front-installation-frame','前涵道独立安装环与三根渐缩斜承力臂','#b6c3cc',frame,
    'machined-aluminium',{armAnglesDeg:armAngles,armCount:3,front:shellRear,rear:seam,independentOfStackRails:true});
  emit('front-installation-intake-flange','蓝色引气机匣后安装法兰',C.intakeOuter??'#477f9d',blue,'satin-blue-metal');
  emit('front-installation-compressor-flange','金色压气机前安装法兰',C.compressorCase??'#c9a34b',gold,'satin-champagne-metal');
  emit('front-installation-gasket','双机匣对接密封垫','#465158',gasket,'dark-gasket');
  emit('front-installation-bolts','安装架轴向贯穿螺栓与内六角头','#aab8c2',union(bolts),'machined-fastener');
  emit('front-installation-washers','安装架与双法兰垫圈','#d6dfe4',union(washers),'machined-aluminium');
  emit('front-installation-nuts','双机匣法兰六角螺母','#aebdc7',union(nuts),'machined-fastener');
  return {intakeSeats,compressorSeats,verification:{
    independentOfStackRails:true,armCount:3,armAnglesDeg:armAngles,
    fanAttachmentPlane:shellRear,fanRingInnerRadius:shellBore,fanRingOuterRadius:flangeOuter,
    blueFlange:[seam-10,seam-.15],goldFlange:[seam+.15,seam+10],jointOuterRadius:jointRadius,
    jointBoltCount:12,fanBoltCount:24,realThroughBores:true,blueBore:P.motorHousing.inner,
    compressorBoreFollowsCasing:true,freeCoolantSectorDeg:[90,135],
  }};
}
