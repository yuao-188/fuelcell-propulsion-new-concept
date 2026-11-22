/** Packaging geometry for a water-side motor loop and a separate gas preheater. */
export function buildMotorHeatRecovery(ctx) {
  const {M,P,union,cylinder,polar,tubePath,roundPath,add}=ctx;
  const group='motorHeatRecovery';
  const shellFinish={clip:true,metallic:.75,roughness:.32,finish:'machined-aluminium'};
  const pipeFinish={clip:true,metallic:.44,roughness:.34};
  const {railAngles,railRadius}=P.supportFrame;
  const sideAngle=railAngles[1],c=Math.cos(sideAngle*Math.PI/180),s=Math.sin(sideAngle*Math.PI/180);
  const H=P.hydrogen,side=H.sideSupply,sideX=P.stacks[side.mountStage-1].rear;
  const junctionX=sideX+side.junctionOffset;
  const hxFront=sideX+22,hxRear=sideX+54;
  const local=(x,r,t=0)=>[x,r*c-t*s,r*s+t*c];
  const box=(x,r,t,l,d,w)=>M.cube([l,d,w],true).translate([x,r,t]).rotate([sideAngle,0,0]);
  const hxLocal=(x,r,t=0)=>[x,-t,r];
  const hxBox=(x,r,t,l,d,w)=>M.cube([l,w,d],true).translate(hxLocal(x,r,t));
  const axial=(lo,hi,r,n=96)=>cylinder([lo,0,0],[hi,0,0],r,r,n);
  const jacketFront=294,jacketRear=411;
  const jacketOuter=P.motor.radius,jacketInner=P.motor.radius*.96;
  const jacketBlank=axial(jacketFront,jacketRear,jacketOuter)
    .subtract(axial(jacketFront-.1,jacketRear+.1,jacketInner));
  const coilRadius=(jacketInner+jacketOuter)/2,coilPassageRadius=1.55;
  const inletX=300,outletX=405,inletAngle=sideAngle-11,outletAngle=sideAngle+11;
  const helix=Array.from({length:97},(_,i)=>{
    const t=i/96;
    return polar(inletX+(outletX-inletX)*t,coilRadius,inletAngle+(720+outletAngle-inletAngle)*t);
  });

  // Route both legs past the side of the front rail before following its
  // straight section. The opposite rail retains the existing electrical loom.
  function lead(x,angle,offset,hxRadius,hxOffset) {
    return [
      polar(x,coilRadius,angle),polar(x,185,angle),polar(423,185,angle),
      local(470,216,offset),local(710,railRadius,offset),local(sideX-76,railRadius,offset),
      local(sideX-46,425,offset),hxLocal(sideX-26,hxRadius,hxOffset),hxLocal(hxFront+4,hxRadius,hxOffset),
    ];
  }
  const inletLeg=lead(inletX,inletAngle,-25,423,-11);
  const outletLeg=lead(outletX,outletAngle,25,419,11);
  const coolantTube=roundPath([...outletLeg,hxLocal(hxRear-8,419,11),hxLocal(hxRear-8,423,-11),
    ...inletLeg.toReversed()],4);
  const coolantOuter=tubePath(coolantTube,3.2);
  const coolantBore=union([
    tubePath(coolantTube,1.85),tubePath(helix,coilPassageRadius),
    ...[helix[0],helix.at(-1)].map(point=>M.sphere(1.85,24).translate(point)),
  ]);

  // The coolant and hydrogen passages occupy different parts of this block.
  const hxBlank=hxBox((hxFront+hxRear)/2,408,0,hxRear-hxFront,38,38);
  const pumpFront=sideX-150,pumpRear=sideX-127;
  const pumpBlank=union([
    cylinder(local(pumpFront,railRadius,-25),local(pumpRear,railRadius,-25),8.2,8.2,48),
    ...[pumpFront+3,pumpRear-3].map(x=>
      cylinder(local(x-1.5,railRadius,-25),local(x+1.5,railRadius,-25),9.6,9.6,48)),
  ]);

  // Side socket feeds the isolated gas passage. After preheating, the line
  // turns around the outside of the stack frame and enters the central tee.
  const gasRadius=399;
  const inlet=polar(sideX,side.inletRadius,side.angle);
  const tee=polar(junctionX,H.headerRadius,H.headerAngle);
  const arc=Array.from({length:13},(_,i)=>polar(junctionX,gasRadius,side.angle+(H.headerAngle-side.angle)*i/12));
  const gasPoints=[
    ...roundPath([inlet,polar(sideX,gasRadius,side.angle),arc[0],arc[1]],5).slice(0,-1),
    ...arc.slice(1,-2),...roundPath([arc.at(-2),arc.at(-1),tee],5),
  ];
  const inletFitting=cylinder(inlet,polar(sideX,side.inletRadius-12,side.angle),8,8,6);
  const fittingLip=cylinder(inlet,polar(sideX,side.inletRadius-2.6,side.angle),8.8,8.8,32);
  const gasBore=tubePath(gasPoints,H.inner,.17);
  const gasOuter=union([tubePath(gasPoints,H.outer),inletFitting,fittingLip]).subtract(hxBlank);
  const ductSeat=cylinder(polar(junctionX,231,H.headerAngle),polar(junctionX,241,H.headerAngle),6.2,6.2,40);

  const penetrationPieces=[[inletX,inletAngle],[outletX,outletAngle]].map(([x,angle])=>
    cylinder(polar(x,150.7,angle),polar(x,174.8,angle),4.55,4.55,40));
  const intakeSeats=union(penetrationPieces);
  const casingCut=axial(jacketFront,jacketRear,jacketOuter+.05)
    .subtract(axial(jacketFront-.1,jacketRear+.1,jacketInner));
  const hotPipe=union([coolantOuter,intakeSeats])
    .subtract(union([jacketBlank,hxBlank,pumpBlank,coolantBore]));
  add('main-motor-cooling-jacket','主电机双圈环向冷却夹套',group,'#438b90',
    jacketBlank.subtract(coolantBore),{...pipeFinish,roughness:.31});
  add('motor-coolant-lines','冷却液进回管与引气筒密封穿管座',group,'#3e9ba4',hotPipe,pipeFinish);
  add('motor-coolant-pump','主电机液冷循环泵',group,'#537879',pumpBlank.subtract(coolantBore),shellFinish);
  add('motor-hydrogen-preheater','隔壁式气态氢预热器',group,'#97b6b7',
    hxBlank.subtract(union([coolantBore,gasBore])),shellFinish);
  const clips=[];
  for(const x of [733,858,1017,1165,1260]){
    for(const t of [-25,25]){
      const band=cylinder(local(x-2.4,railRadius,t),local(x+2.4,railRadius,t),5,5,32)
        .subtract(cylinder(local(x-2.5,railRadius,t),local(x+2.5,railRadius,t),3.3,3.3,32));
      const foot=box(x,railRadius,Math.sign(t)*17,4.8,7,10);
      clips.push(union([band,foot]));
    }
  }
  // The preheater cantilevers from the outside of the second mount ring.
  // The bracket contacts the ring outside its pressure and moving parts.
  const loadRingOuter=railRadius+P.supportFrame.railDepth/2;
  const bracket=union([hxBox(sideX,386.7,0,18,4,23),hxBox(sideX+21,387.5,0,28,2.5,23),
    hxBox(hxFront+12,388.4,0,23,1.2,30)])
    .subtract(axial(sideX-10,sideX+10,loadRingOuter,192));
  const fasteners=union([-10,10].map(t=>cylinder(hxLocal(sideX,388.5,t),hxLocal(sideX,391.4,t),2.7,2.7,6)));
  add('motor-heat-line-mounts','纵梁冷却管夹',group,'#85989e',
    union(clips).subtract(coolantOuter),shellFinish);
  add('motor-preheater-saddle','预热器侧挂座与紧固件',group,'#879aa2',union([bracket,fasteners]),shellFinish);
  return {
    coolantBore,gasBore,gasOuter,gasPoints,ductSeat,intakeSeats,casingCut,
    coolantEnvelope:union([coolantOuter,jacketBlank,hxBlank,pumpBlank,intakeSeats]),
    check:{jacket:[jacketFront,jacketRear],jacketRadii:[jacketInner,jacketOuter],
      turnCount:2,feedThroughs:[inletX,outletX],railAngle:sideAngle,
      pump:[pumpFront,pumpRear],preheater:[hxFront,hxRear],hydrogenInlet:inlet,supplyTee:tee,
      hydrogenInletPhase:'gas downstream of external vaporizer',
      flow:'motor jacket → coolant line → separated heat exchanger → circulation pump → jacket'},
  };
}
