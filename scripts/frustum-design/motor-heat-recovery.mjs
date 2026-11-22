/** Packaging geometry for a water-side motor loop and a separate gas preheater. */
export function buildMotorHeatRecovery(ctx) {
  const {M,P,C,union,cylinder,polar,tubePath,roundPath,add}=ctx;
  const group='motorHeatRecovery';
  const shellFinish={clip:true,metallic:.75,roughness:.32,finish:'machined-aluminium'};
  const pipeFinish={clip:true,metallic:.44,roughness:.34};
  const {railAngles,railRadius}=P.supportFrame;
  const sideAngle=railAngles[1],c=Math.cos(sideAngle*Math.PI/180),s=Math.sin(sideAngle*Math.PI/180);
  const lastRear=P.stacks.at(-1).rear;
  const hxFront=lastRear+16,hxRear=lastRear+58;
  const local=(x,r,t=0)=>[x,r*c-t*s,r*s+t*c];
  const box=(x,r,t,l,d,w)=>M.cube([l,d,w],true).translate([x,r,t]).rotate([sideAngle,0,0]);
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
      local(470,213,offset),local(645,railRadius,offset),local(lastRear-18,railRadius,offset),
      local(hxFront-8,hxRadius,hxOffset),local(hxFront+4,hxRadius,hxOffset),
    ];
  }
  const inletLeg=lead(inletX,inletAngle,-25,337,-11);
  const outletLeg=lead(outletX,outletAngle,25,327,11);
  const coolantTube=roundPath([...outletLeg,local(hxRear-9,327,11),local(hxRear-8,337,-11),
    ...inletLeg.toReversed()],4);
  const coolantOuter=tubePath(coolantTube,3.2);
  const coolantBore=union([
    tubePath(coolantTube,1.85),tubePath(helix,coilPassageRadius),
    ...[helix[0],helix.at(-1)].map(point=>M.sphere(1.85,24).translate(point)),
  ]);

  // The coolant and hydrogen passages occupy different parts of this block.
  const hxBlank=box((hxFront+hxRear)/2,329,0,hxRear-hxFront,43,38);
  const pumpFront=lastRear-50,pumpRear=lastRear-27;
  const pumpBlank=union([
    cylinder(local(pumpFront,railRadius,-25),local(pumpRear,railRadius,-25),8.2,8.2,48),
    ...[pumpFront+3,pumpRear-3].map(x=>
      cylinder(local(x-1.5,railRadius,-25),local(x+1.5,railRadius,-25),9.6,9.6,48)),
  ]);

  // The green extension is in series with the existing header. Cross behind
  // the separate exhaust/drain outlets before turning in to the existing port.
  const H=P.hydrogen,turnX=lastRear+176;
  const gasPoints=roundPath([
    local(hxFront-9,312,0),local(turnX,312,0),
    polar(turnX,H.headerRadius,H.headerAngle),polar(H.inletX,H.headerRadius,H.headerAngle),
  ],7);
  const gasOuter=tubePath(gasPoints,H.outer);
  const extendedGas=gasPoints.map(p=>[...p]);
  extendedGas[0][0]-=.2;
  extendedGas.at(-1)[0]-=.2;
  const gasBore=tubePath(extendedGas,H.inner);

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
  add('motor-preheated-hydrogen-line','气化后氢气 · 预热器入口与总管连接',group,C.hydrogen,
    gasOuter.subtract(union([hxBlank,gasBore])),pipeFinish);

  const clips=[];
  for(const x of [703,959,1275,1565,1880,1984].map(x=>x-P.stackForwardShift)){
    for(const t of [-25,25]){
      const band=cylinder(local(x-2.4,railRadius,t),local(x+2.4,railRadius,t),5,5,32)
        .subtract(cylinder(local(x-2.5,railRadius,t),local(x+2.5,railRadius,t),3.3,3.3,32));
      const foot=box(x,railRadius,Math.sign(t)*17,4.8,7,10);
      clips.push(union([band,foot]));
    }
  }
  const mount=box(hxFront+23,352.75,0,26,4.5,15);
  clips.push(mount);
  add('motor-heat-line-mounts','左纵梁冷却管夹和预热器底座',group,'#85989e',
    union(clips).subtract(coolantOuter),shellFinish);
  return {
    coolantBore,gasBore,intakeSeats,casingCut,
    coolantEnvelope:union([coolantOuter,jacketBlank,hxBlank,pumpBlank,intakeSeats]),
    check:{jacket:[jacketFront,jacketRear],jacketRadii:[jacketInner,jacketOuter],
      turnCount:2,feedThroughs:[inletX,outletX],railAngle:sideAngle,
      pump:[pumpFront,pumpRear],preheater:[hxFront,hxRear],hydrogenBend:turnX,
      hydrogenInletPhase:'gas downstream of external vaporizer',
      flow:'motor jacket → coolant line → separated heat exchanger → circulation pump → jacket'},
  };
}
