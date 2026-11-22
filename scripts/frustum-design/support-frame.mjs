import {stackRadiusAt} from '../../frustum-design/parameters.mjs';

/** Independent four-stack frame: three rails, external cradles and aircraft mounts. */
export function buildSupportFrame(ctx) {
  const {M,P,union,cylinder,sector,polar,tubePath,roundPath,add}=ctx;
  const S=P.supportFrame??{};
  const angles=S.railAngles??[0,120,240],railRadius=S.railRadius??370;
  const railDepth=S.railDepth??30,railWidth=S.railWidth??24;
  const railFront=S.railFront??P.stacks[0].front;
  const railRear=S.railRear??P.stacks.at(-1).rear;
  const loadFrameX=S.loadFrameX??P.stacks[1].rear,loadFrameWidth=S.loadFrameWidth??28;
  const mountAngles=S.mountAngles??angles,mountRadius=S.mountRadius??465;
  const mountTubeOuter=S.mountTubeOuter??16,mountTubeInner=S.mountTubeInner??10;
  const mountFlangeRadius=S.mountFlangeRadius??30,mountFlangeThickness=S.mountFlangeThickness??8;
  const box=(size,point)=>M.cube(size,true).translate(point);
  const localBox=(x,r,t,length,depth,width,angle)=>
    box([length,depth,width],[x,r,t]).rotate([angle,0,0]);
  const railPieces=angles.map(a=>localBox((railFront+railRear)/2,railRadius,0,
    railRear-railFront,railDepth,railWidth,a));
  // The load ring belongs to the stack installation alone. Its open bore
  // clears the intake sweep; none of these rails reach the front fan casing.
  const loadRingInner=railRadius-railDepth/2,loadRingOuter=railRadius+railDepth/2;
  const loadRing=cylinder([loadFrameX-loadFrameWidth/2,0,0],[loadFrameX+loadFrameWidth/2,0,0],loadRingOuter,loadRingOuter,192)
    .subtract(cylinder([loadFrameX-loadFrameWidth/2-.1,0,0],[loadFrameX+loadFrameWidth/2+.1,0,0],loadRingInner,loadRingInner,192));
  const mountPieces=[],mountBores=[],mountBoltHoles=[];
  for(const angle of mountAngles){
    const point=r=>polar(loadFrameX,r,angle);
    // The tube root has a positive overlap with the annular load ring.
    mountPieces.push(cylinder(point(loadRingOuter-7),point(mountRadius),mountTubeOuter,mountTubeOuter,48));
    mountPieces.push(cylinder(point(mountRadius-mountFlangeThickness),point(mountRadius),mountFlangeRadius,mountFlangeRadius,64));
    mountBores.push(cylinder(point(loadRingInner-.2),point(mountRadius+.2),mountTubeInner,mountTubeInner,48));
    const a=angle*Math.PI/180,tangent=[0,-Math.sin(a),Math.cos(a)];
    for(let k=0;k<4;k++){
      const phi=(45+90*k)*Math.PI/180,boltRadius=mountFlangeRadius*.75;
      const offset=[boltRadius*Math.cos(phi),...tangent.slice(1).map(v=>v*boltRadius*Math.sin(phi))];
      const q=r=>point(r).map((v,j)=>v+offset[j]);
      mountBoltHoles.push(cylinder(q(mountRadius-mountFlangeThickness-.1),q(mountRadius+.1),2.8,2.8,24));
    }
  }
  const frame=union([...railPieces,loadRing,...mountPieces]).subtract(union([...mountBores,...mountBoltHoles]));
  const finish={clip:true,metallic:.78,roughness:.33,finish:'machined-aluminium'};
  add('stack-frame-main','独立电堆三纵梁、二级后承力环及机体安装管','supportFrame','#667986',frame,
    {...finish,railCount:angles.length,railAngles:angles,installationSegment:'stacks',
      aircraftMountCount:mountAngles.length,loadFrameX,mountAngles});

  const cradles=[];
  for(const [index,s] of P.stacks.entries()){
    const stage=index+1,scale=s.geometryScale??1;
    const fore=s.front+12*scale,aft=s.rear-12*scale;
    const bandHalf=4*scale,bandDepth=8*scale;
    const radius=x=>stackRadiusAt(s,x);
    const collar=(x)=>{
      const lo=x-bandHalf,hi=x+bandHalf;
      const taper=(s.rearOuter-s.outer)/(s.rear-s.front);
      return cylinder([lo,0,0],[hi,0,0],radius(lo)+bandDepth,radius(hi)+bandDepth,192)
        .subtract(cylinder([lo-.08,0,0],[hi+.08,0,0],radius(lo)-.08*taper,radius(hi)+.08*taper,192));
    };
    const frontBand=collar(fore),rearBand=collar(aft);
    // All supports stay outside the complete electrical-layer envelope.
    // The thin straps follow the same cone facets as the stack and overlap
    // only the external collars at their ends; there are no inward webs.
    const strapInnerOffset=.05,strapOuterOffset=1.1*scale;
    const strapLo=fore-bandHalf,strapHi=aft+bandHalf;
    const taper=(s.rearOuter-s.outer)/(s.rear-s.front);
    const strapOuter=cylinder([strapLo,0,0],[strapHi,0,0],
      radius(strapLo)+strapOuterOffset,radius(strapHi)+strapOuterOffset,192);
    const strapInner=cylinder([strapLo-.08,0,0],[strapHi+.08,0,0],
      radius(strapLo)+strapInnerOffset-.08*taper,
      radius(strapHi)+strapInnerOffset+.08*taper,192);
    const strapCone=strapOuter.subtract(strapInner);
    strapOuter.delete();strapInner.delete();
    const braces=[],ties=[],slots=[];
    for(const angle of angles){
      const near=radius(fore)+bandDepth-2;
      braces.push(localBox(fore,(near+railRadius)/2,0,2*bandHalf,railRadius-near,20,angle));
      // A broad angular cutter keeps the 192-facet conical inner face intact,
      // instead of introducing a chord that could enter the stack material.
      const wedge=sector(strapLo-.1,strapHi+.1,
        radius(strapHi)-2,radius(strapLo)+strapOuterOffset+2,angle-2.2,angle+2.2);
      const tie=strapCone.intersect(wedge);wedge.delete();
      const rr=radius(aft);
      const slot=union([
        localBox(aft,rr+3,0,8*scale,16,5.2,angle),
        ...[-4,4].map(dx=>cylinder(polar(aft+dx*scale,rr-5,angle),
          polar(aft+dx*scale,rr+11,angle),2.6,2.6,24)),
      ]);
      ties.push(tie);
      slots.push(slot);
    }
    const slotCuts=union(slots);
    const cradle=union([frontBand,rearBand,...braces,...ties]).subtract(union([frame,slotCuts]));
    add(`stack-cradle-${stage}`,`第${stage}级可拆托架 · 前座后槽`,'supportFrame',
      '#a6b5be',cradle,{...finish,stage});
    cradles.push({
      stage,frontSeat:fore,rearSeat:aft,slotLength:8*scale+5.2,
      mountAngles:angles,inwardWebs:false,
      strapSectorDegrees:4.4,strapInnerOffset,strapOuterOffset,
      supportArrangement:'external-conical-straps-and-collars',
    });
    strapCone.delete();
  }

  const wireAngle=angles.at(-1),wireRadius=railRadius+22,wireStart=railFront+8;
  // The loom walks around the radial mounting tube instead of crossing either
  // of its walls. The outer radius also keeps it clear of the load-ring rim.
  const wireMountBypass=7.5;
  const wirePath=[polar(wireStart,wireRadius,wireAngle),
    polar(loadFrameX-42,wireRadius,wireAngle),
    polar(loadFrameX-28,wireRadius,wireAngle+wireMountBypass),
    polar(loadFrameX+28,wireRadius,wireAngle+wireMountBypass),
    polar(loadFrameX+42,wireRadius,wireAngle),
    polar(railRear-8,wireRadius,wireAngle)];
  const mainWire=tubePath(roundPath(wirePath,6),2.2);
  const leads=[],clips=[];
  for(const s of P.stacks){
    const x=s.front+27;
    const points=Array.from({length:6},(_,i)=>polar(x,wireRadius,wireAngle+i*1.2));
    points.push(polar(x,stackRadiusAt(s,x)+1.4,wireAngle+6));
    leads.push(tubePath(roundPath(points,5),1.4));
    const r=wireRadius;
    const loop=cylinder(polar(x-2.5,r,wireAngle),polar(x+2.5,r,wireAngle),4.2,4.2,32)
      .subtract(cylinder(polar(x-2.6,r,wireAngle),polar(x+2.6,r,wireAngle),2.35,2.35,32));
    const foot=localBox(x,(r-3+railRadius+railDepth/2)/2,0,5,r-3-railRadius-railDepth/2,5,wireAngle);
    clips.push(union([loop,foot]));
  }
  const wiring=union([mainWire,...leads]);
  add('wiring-harness','沿右纵梁夹持的电气线束','wiring','#35454e',wiring,
    {clip:true,metallic:.06,roughness:.6});
  add('wiring-frame-clips','纵梁线束卡箍','wiring','#84949e',union(clips).subtract(wiring),finish);

  return {report:{railRadius,railInnerRadius:railRadius-railDepth/2,
    railFront,railRear,railCount:angles.length,railAngles:angles,installationSegment:'stacks',
    frontCasingConnection:false,rearLoadRing:false,
    loadRing:{centreX:loadFrameX,front:loadFrameX-loadFrameWidth/2,rear:loadFrameX+loadFrameWidth/2,
      inner:loadRingInner,outer:loadRingOuter},
    aircraftMounts:{angles:mountAngles,radialEnd:mountRadius,tubeOuter:mountTubeOuter,
      tubeInner:mountTubeInner,flangeRadius:mountFlangeRadius,flangeThickness:mountFlangeThickness},
    wireAngle,wireMountBypass,cradles}};
}
