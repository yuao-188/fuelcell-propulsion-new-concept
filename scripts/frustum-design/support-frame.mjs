import {stackRadiusAt} from '../../frustum-design/parameters.mjs';

/** Open structural frame with two shared rails and removable stack cradles. */
export function buildSupportFrame(ctx) {
  const {M,P,union,cylinder,sector,polar,tubePath,roundPath,add}=ctx;
  const angles=[105,255],railRadius=370,railDepth=30,railWidth=24;
  const railFront=P.outerShell.rear,straightStart=635,straightEnd=P.stacks.at(-1).rear+80;
  const rearMount=straightEnd-12;
  const box=(size,point)=>M.cube(size,true).translate(point);
  const localBox=(x,r,t,length,depth,width,angle)=>
    box([length,depth,width],[x,r,t]).rotate([angle,0,0]);
  const sweptRail=(stations,angle)=>{
    const slices=stations.map(([x,r,depth,width])=>localBox(x,r,0,.1,depth,width,angle));
    const spans=slices.slice(1).map((slice,i)=>M.hull([slices[i],slice]));
    return union(spans);
  };
  const clipEnds=(solid,front,rear)=>solid.intersect(
    box([rear-front,1200,1200],[(front+rear)/2,0,0]));

  const railPieces=angles.map(a=>sweptRail([
    [railFront,513,16,railWidth],[410,513,16,railWidth],
    [455,495,24,railWidth],[590,391,railDepth,railWidth],
    [straightStart,railRadius,railDepth,railWidth],[straightEnd,railRadius,railDepth,railWidth],
  ],a));
  // The aft crossmember passes below the collectors and the drainage lines.
  const railCenters=angles.map(a=>polar(rearMount,railRadius,a));
  const rearFootY=-236;
  const crossmember=[
    ...railCenters.map(([,y,z])=>box([16,y-rearFootY+15,17],[rearMount,(y+rearFootY-15)/2,z])),
    box([16,16,railCenters[0][2]-railCenters[1][2]+17],[rearMount,rearFootY,0]),
  ];
  const rearEars=[-100,100].map(z=>{
    const p=x=>[x,rearFootY-20,z];
    const eye=cylinder(p(rearMount-7),p(rearMount+7),21,21,48);
    const hole=cylinder(p(rearMount-8),p(rearMount+8),8,8,32);
    return eye.subtract(hole);
  });
  const frame=clipEnds(union([...railPieces,...crossmember,...rearEars]),railFront,straightEnd);
  const finish={clip:true,metallic:.78,roughness:.33,finish:'machined-aluminium'};
  add('stack-frame-main','双纵梁与后安装节','supportFrame','#667986',frame,finish);

  const stackSeats=[],cradles=[];
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
    const webs=[];
    for(const x of [fore,aft])for(const angle of angles){
      const outer=radius(x)+bandDepth-1;
      const inner=stackRadiusAt(s,x,'inner')+.95;
      // The web crosses the lamellae in two narrow sectors. Its actual mesh
      // is also the cutter for its seats in the two stack materials.
      const taper=(s.rearOuter-s.outer)/(s.rear-s.front);
      webs.push(sector(x-3*scale,x+3*scale,inner,outer,angle-2.2,angle+2.2)
        .warp(v=>{
          const r=Math.hypot(v[1],v[2]),factor=(r+(v[0]-x)*taper)/r;
          v[1]*=factor;
          v[2]*=factor;
        }));
    }
    const braces=[],ties=[],slots=[];
    for(const angle of angles){
      const near=radius(fore)+bandDepth-2;
      braces.push(localBox(fore,(near+railRadius)/2,0,2*bandHalf,railRadius-near,20,angle));
      // Recess the long members into matching seats at the stack surface.
      // A projecting strap here would enter the next inlet's swept envelope.
      const tie=sweptRail([[fore,radius(fore)+1,6,14],
        [aft+4*scale,radius(aft+4*scale)+1,6,14]],angle);
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
    const seat=union([...webs,...ties]).subtract(slotCuts);
    stackSeats.push(seat);
    const cradle=union([frontBand,rearBand,...braces,seat]).subtract(union([frame,slotCuts]));
    add(`stack-cradle-${stage}`,`第${stage}级可拆托架 · 前座后槽`,'supportFrame',
      '#a6b5be',cradle,{...finish,stage});
    cradles.push({
      stage,frontSeat:fore,rearSeat:aft,slotLength:8*scale+5.2,
      mountAngles:angles,webSectorDegrees:4.4,
    });
  }

  const wireAngle=angles[1],wireRadius=railRadius+22,wireStart=straightStart+15;
  const mainWire=tubePath([polar(wireStart,wireRadius,wireAngle),
    polar(rearMount-12,wireRadius,wireAngle)],2.2);
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

  return {stackSeats,report:{railRadius,railInnerRadius:railRadius-railDepth/2,
    railFront,straightStart,straightEnd,rearMount,railAngles:angles,cradles}};
}
