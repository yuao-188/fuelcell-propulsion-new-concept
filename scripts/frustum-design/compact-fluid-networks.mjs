import {stackRadiusAt} from '../../frustum-design/parameters.mjs';
/** Three tapered ring stacks: hollow, separate cathode and hydrogen circuits.
 * Each circuit ends at its own short stack-wall interface. The stack-internal
 * reaction passages are deliberately omitted rather than joined by bypasses.
 */
export function buildCompactFluidNetworks(ctx) {
  const { M, P, C, union, cylinder, tubePath, roundPath, polar, add } = ctx;
  const keys = ['air','cathode','feed','return'];
  const networks = Object.fromEntries(keys.map(k=>[k,{outer:[],bores:[]}]));
  const ports = [], allPaths = [], junctionChecks = [], stackCutters = P.stacks.map(()=>[]);
  const seals = [], componentChecks = [], isolationChecks = [], aftSupplyBranches = [];
  const vsub = (a,b)=>a.map((v,i)=>v-b[i]);
  const vadd = (a,b)=>a.map((v,i)=>v+b[i]);
  const vmul = (a,k)=>a.map(v=>v*k);
  const norm = v=>Math.hypot(...v);
  const unit = v=>vmul(v,1/norm(v));
  const front = P.stacks[0], last = P.stacks.at(-1), H = P.hydrogen;
  function extend(points, amount=.14) {
    const pp=points.map(p=>[...p]);
    pp[0]=vadd(pp[0],vmul(unit(vsub(pp[0],pp[1])),amount));
    const k=pp.length-1;
    pp[k]=vadd(pp[k],vmul(unit(vsub(pp[k],pp[k-1])),amount));
    return pp;
  }
  function path(key,points,outer,inner,{stage,round=0,blindStart=false,blindEnd=false}={}) {
    let pp=round?roundPath(points,round):points;
    pp=pp.filter((p,i)=>!i||norm(vsub(p,pp[i-1]))>1e-6);
    const outside=tubePath(pp,outer), bp=extend(pp);
    if(blindStart) bp[0]=vadd(pp[0],vmul(unit(vsub(pp[1],pp[0])),1));
    if(blindEnd) bp[bp.length-1]=vadd(pp.at(-1),vmul(unit(vsub(pp.at(-2),pp.at(-1))),1));
    const bore=tubePath(bp,inner);
    networks[key].outer.push(outside); networks[key].bores.push(bore);
    allPaths.push({key,points:pp,outer,inner});
    if(stage!==undefined) stackCutters[stage].push(tubePath(extend(pp,.3),outer+.035));
    return {outside,bore};
  }
  function arcPoints(x,r,start,end) {
    const n=Math.max(2,Math.ceil(Math.abs(end-start)/3));
    return Array.from({length:n+1},(_,k)=>polar(x,r,start+(end-start)*k/n));
  }
  const port=(fluid,stage,point,direction,inner,outer)=>ports.push({
    id:`${fluid}-${stage}-1`,fluid,medium:fluid,stage,module:1,position:point,direction,inner,outer,
  });
  const polarDirection=(theta,sign=1)=>[0,sign*Math.cos(theta*Math.PI/180),sign*Math.sin(theta*Math.PI/180)];
  const AIR=P.air, Q=P.stackPorts, railRadius=H.returnHeaderRadius, feedRadius=H.headerRadius,
    feedAngle=H.headerAngle, returnAngle=H.returnHeaderAngle, wetRadius=AIR.exhaustHeaderRadius,
    wetAngle=AIR.exhaustHeaderAngle;
  const heating=H.aftHeating;
  const supplyStart=front.rear+heating.frontOffset, returnStart=front.front+Q.frontOffset;
  const returnEnd=last.rear+13,wetEnd=last.rear+11,tailOutlet=last.rear+170;
  const firstWet=front.rear-Q.wetRearOffset;
  const airMain=path('air',[[P.compressor.outlet,0,0],[AIR.end,0,0]],AIR.outer,AIR.inner);
  const feedMain=path('feed',[polar(supplyStart-6,feedRadius,feedAngle),polar(H.inletX,feedRadius,feedAngle)],H.outer,H.inner,{blindStart:true});
  const returnMain=path('return',[polar(returnStart-6,railRadius,returnAngle),polar(returnEnd,railRadius,returnAngle)],H.outer,H.inner,{blindStart:true});
  const wetMain=path('cathode',[polar(firstWet-6,wetRadius,wetAngle),polar(wetEnd,wetRadius,wetAngle)],5.2,3.4,{blindStart:true});

  for(const [i,s] of P.stacks.entries()) {
    const stage=i+1;
    const airX=s.front+Q.frontOffset, wetX=s.rear-Q.wetRearOffset;
    const feedX=s.rear-Q.feedRearOffset,feedHeaderX=s.rear+heating.frontOffset,returnX=s.front+Q.frontOffset;
    const rootAt=x=>stackRadiusAt(s,x,'inner')+Q.stubDepth;
    const airIn=path('air',[[airX,0,0],polar(airX,rootAt(airX),Q.airAngle)],AIR.branchOuter,AIR.branchInner,{stage:i});
    const wetOut=path('cathode',[polar(wetX,rootAt(wetX),Q.wetAngle),polar(wetX,wetRadius,Q.wetAngle),
      ...arcPoints(wetX,wetRadius,Q.wetAngle,wetAngle).slice(1)],5.2,3.4,{stage:i});
    // The central header feeds one serial, open-ended helical turn behind each
    // stack. This is an exhaust-exposed supply route, not a closed bypass ring.
    // The incoming radial leg is at the front axial station; the exit is 14 mm
    // aft, moves to another angular sector and returns through the central
    // opening to a short inner-wall inlet. No internal feed-return rail exists.
    const heatingRadius=s.rearOuter-heating.radialInset;
    const heatingRear=s.rear+heating.rearOffset;
    const heatingAngle=heating.stageStartAngles?.[i]??feedAngle;
    const turnSamples=Math.ceil(heating.turnDegrees/5);
    const helix=Array.from({length:turnSamples+1},(_,j)=>{
      const f=j/turnSamples;
      return polar(feedHeaderX+(heatingRear-feedHeaderX)*f,heatingRadius,heatingAngle+heating.turnDegrees*f);
    });
    // The third-stage entry is at 90 degrees so its radial leg clears the
    // separate return-gas crossing at rear+13 mm, y=-65 mm.
    const headerArc=heatingAngle===feedAngle?[polar(feedHeaderX,feedRadius,feedAngle)]:
      arcPoints(feedHeaderX,feedRadius,feedAngle,heatingAngle);
    const supplyLead=[...headerArc.slice(0,-1),...roundPath([headerArc.at(-1),helix[0],helix[1]],5)];
    const exitX=s.rear+heating.exitOffset,exitRadius=heatingRadius-heating.exitRadialInset;
    const innerRadius=Math.max(AIR.outer+10,s.rearInner-heating.boreClearance);
    const innerTurnX=s.rear+heating.innerTurnOffset;
    const exitArc=arcPoints(exitX,exitRadius,heatingAngle,heating.returnAngle);
    const innerArc=arcPoints(innerTurnX,innerRadius,heating.returnAngle,Q.feedAngle);
    const exitLead=roundPath([helix.at(-2),helix.at(-1),exitArc[0],exitArc[1]],4);
    // The inward radial run stays at -35 degrees to clear the tail separators.
    // Only inside the central hole does it turn to the 45-degree stack inlet;
    // that inlet is 12 mm aft of the independent wet-exhaust takeoff.
    const inwardLead=roundPath([exitArc.at(-2),exitArc.at(-1),polar(exitX,innerRadius,heating.returnAngle),innerArc[0],innerArc[1]],5);
    const stubLead=roundPath([innerArc.at(-2),innerArc.at(-1),polar(feedX,innerRadius,Q.feedAngle),
      polar(feedX,rootAt(feedX),Q.feedAngle)],3);
    const feedRoute=[...supplyLead,...helix.slice(2,-2),...exitLead,...exitArc.slice(2,-2),
      ...inwardLead,...innerArc.slice(2,-2),...stubLead];
    const feedIn=path('feed',feedRoute,heating.outer,heating.inner,{stage:i});
    const returnOut=path('return',[polar(returnX,rootAt(returnX),Q.returnAngle),polar(returnX,railRadius,Q.returnAngle),
      ...arcPoints(returnX,railRadius,Q.returnAngle,returnAngle).slice(1)],3.3,2.1,{stage:i});
    port('air',stage,polar(airX,stackRadiusAt(s,airX,'inner'),Q.airAngle),polarDirection(Q.airAngle),AIR.branchInner,AIR.branchOuter);
    port('cathode',stage,polar(wetX,stackRadiusAt(s,wetX,'inner'),Q.wetAngle),polarDirection(Q.wetAngle,-1),3.4,5.2);
    port('hydrogen',stage,polar(feedX,stackRadiusAt(s,feedX,'inner'),Q.feedAngle),polarDirection(Q.feedAngle),2.1,3.3);
    port('return',stage,polar(returnX,stackRadiusAt(s,returnX,'inner'),Q.returnAngle),polarDirection(Q.returnAngle,-1),2.1,3.3);
    junctionChecks.push({name:`stage-${stage}-air-header`,a:airMain.bore,b:airIn.bore},
      {name:`stage-${stage}-wet-header`,a:wetMain.bore,b:wetOut.bore},
      {name:`stage-${stage}-hydrogen-header`,a:feedMain.bore,b:feedIn.bore},
      {name:`stage-${stage}-return-header`,a:returnMain.bore,b:returnOut.bore});
    isolationChecks.push({name:`stage-${stage}-air-vs-wet-exhaust`,a:airIn.bore,b:wetOut.bore},
      {name:`stage-${stage}-feed-vs-return-interface`,a:feedIn.bore,b:returnOut.bore});
    aftSupplyBranches.push({stage,bore:feedIn.bore});
    componentChecks.push({stage,airX,wetX,feedX,feedHeaderX,returnX,
      interfacesPerMedium:1,feedFace:'inner conical wall, rear',returnFace:'inner conical wall, front',
      interfaceAngles:{air:Q.airAngle,cathode:Q.wetAngle,feed:Q.feedAngle,return:Q.returnAngle},stubDepth:Q.stubDepth,
      aftSupplyTurn:{front:feedHeaderX,rear:heatingRear,radius:heatingRadius,
        degrees:heating.turnDegrees,startAngle:heatingAngle,outerRadius:heating.outer,innerRadius:heating.inner,
        routing:'central header → one serial circumferential turn → central bore → rear inner-wall inlet',
        performanceClaim:false},
      collectorRepresentation:'four independent short interface stubs; stack-internal passages omitted'});
  }

  function separator({key,label,front:x0,rear:x1,y,z,r,gasInner,gasOuter}) {
    const x=(x0+x1)/2, at=xx=>[xx,y,z], cupBottom=y-r-16, valveBottom=cupBottom-10;
    const cupOuter=8, cupInner=5.8, inlet=[x0-6,y,z], outlet=[x1+6,y,z];
    const gasRaw=union([cylinder(at(x0+2),at(x1-2),r-2,r-2,64),
      cylinder([x0-6.15,y,z],at(x0+3),gasInner,gasInner,32),
      cylinder(at(x1-3),[x1+6.15,y,z],gasInner,gasInner,32)]);
    const canOuter=union([cylinder(at(x0),at(x1),r,r,64),
      cylinder(inlet,at(x0+3),gasOuter,gasOuter,32),cylinder(at(x1-3),outlet,gasOuter,gasOuter,32),
      cylinder([x,cupBottom,z],[x,y-r+4,z],cupOuter,cupOuter,32)]);
    const cupVoid=cylinder([x,cupBottom+1.5,z],[x,y-r+5,z],cupInner,cupInner,32);
    const valveBore=cylinder([x,valveBottom-.15,z],[x,cupBottom+3,z],2,2,24);
    const drainPoints=roundPath([[x,valveBottom,z],[x,valveBottom-5,z],[x+18,valveBottom-5,z],[tailOutlet,valveBottom-5,z]],4);
    const drainBore=tubePath(extend(drainPoints),2), drainOutside=tubePath(drainPoints,3.3);
    const allDrain=union([cupVoid,valveBore,drainBore]);
    const baffles=[],baffleSeats=[];
    for(const [f,side] of [[.33,1],[.68,-1]]) {
      const bx=x0+(x1-x0)*f;
      const disk=cylinder(at(bx-.5),at(bx+.5),r-1.8,r-1.8,64);
      const window=cylinder([bx-.6,y+side*(r-2)*.5,z],[bx+.6,y+side*(r-2)*.5,z],(r-2)*.62,(r-2)*.62,32);
      const notch=cylinder([bx-.6,y-r+3,z],[bx+.6,y-r+3,z],2,2,24);
      baffles.push(disk.subtract(union([window,notch,allDrain])));baffleSeats.push(disk);
    }
    const baffleSolid=union(baffles), gasBore=gasRaw.subtract(baffleSolid);
    const can=canOuter.subtract(union([gasRaw,allDrain,...baffleSeats]));
    const valveOuter=cylinder([x,valveBottom,z],[x,cupBottom,z],5.2,5.2,32);
    const valve=valveOuter.subtract(allDrain);
    add(`${key}-separator`,`${label}气水分离器 · 独立气腔与集水杯`,`${key}Separator`,'#91a0aa',can,
      {clip:true,metallic:.77,roughness:.3});
    add(`${key}-separator-baffles`,`${label}分离器交错挡板`,`${key}Separator`,'#bcc7ce',baffleSolid,
      {clip:true,metallic:.78,roughness:.31});
    add(`${key}-drain-valve`,`${label}独立排水阀`,`${key}Drain`,'#637583',valve,{clip:true,metallic:.8,roughness:.3});
    add(`${key}-drain-pipe`,`${label}独立尾部排水管`,`${key}Drain`,'#a4afb8',drainOutside.subtract(allDrain),
      {clip:true,metallic:.65,roughness:.32});
    return {inlet,outlet,gasBore,drainBore:allDrain,outer:union([canOuter,valveOuter,drainOutside]),
      check:{key,front:x0,rear:x1,centre:[x,y,z],radius:r,baffles:2,drainOutlet:drainPoints.at(-1)}};
  }
  const anode=separator({key:'anode',label:'阳极',front:last.rear+26,rear:last.rear+56,y:-65,z:70,r:18,gasInner:2.5,gasOuter:4});
  const cathode=separator({key:'cathode',label:'阴极',front:last.rear+36,rear:last.rear+86,y:65,z:45,r:20,gasInner:3.4,gasOuter:5.2});
  path('return',[polar(returnEnd,railRadius,returnAngle),[returnEnd,-65,-105],[returnEnd,-65,70],anode.inlet],H.outer,H.inner,{round:7});
  path('cathode',[polar(wetEnd,wetRadius,wetAngle),[wetEnd,65,wetRadius],[wetEnd+10,65,45],cathode.inlet],5.2,3.4,{round:5});
  path('cathode',[cathode.outlet,[AIR.end,65,45],[tailOutlet,65,45]],5.2,3.4,{round:5});
  const pumpFront=P.pump.front,pumpRear=P.pump.rear,pumpCentre=[-65,70],pumpRadius=P.pump.radius;
  const pumpAt=x=>[x,...pumpCentre], pumpBore=cylinder(pumpAt(pumpFront-.15),pumpAt(pumpRear+.15),H.inner,H.inner,32);
  const pumpOuter=union([cylinder(pumpAt(pumpFront),pumpAt(pumpFront+4),pumpRadius,pumpRadius,64),
    cylinder(pumpAt(pumpFront+4),pumpAt(pumpRear-4),pumpRadius-1.2,pumpRadius-1.2,64),
    cylinder(pumpAt(pumpRear-4),pumpAt(pumpRear),pumpRadius,pumpRadius,64)]);
  add('pump','阳极循环泵 · 独立尾部腔内安装','pump',C.pump,pumpOuter.subtract(pumpBore),
    {clip:true,metallic:.55,roughness:.3});
  path('return',[anode.outlet,pumpAt(pumpFront)],H.outer,H.inner);
  path('feed',[pumpAt(pumpRear),pumpAt(pumpRear+17),polar(pumpRear+17,feedRadius,feedAngle)],H.outer,H.inner,{round:7});

  // Locate every pressure-pipe crossing of the cooling collector/liner walls.
  // One integral collar straddles the sheet; subtracting its exact envelope from
  // the guide makes a matching seat without ever opening the pressure bore.
  function sampledTransition(x,xa,xb,ra,rb,steps) {
    const q=Math.max(0,Math.min(steps,(x-xa)/(xb-xa)*steps));
    const n=Math.min(steps-1,Math.floor(q)),f=q-n;
    const smooth=t=>t*t*(3-2*t);
    return ra+(rb-ra)*(smooth(n/steps)*(1-f)+smooth((n+1)/steps)*f);
  }
  function guideRadius(x) {
    for(let k=0;k<2;k++){
      const a=P.stacks[k],b=P.stacks[k+1],r0=a.rearOuter+P.interstage.wall,r1=b.inner-P.interstage.linerClearance;
      if(x>=a.rear&&x<=b.front)return sampledTransition(x,a.rear,b.front,r0,r1,32);
      if(x>b.front&&x<b.rear)return stackRadiusAt(b,x,'inner')-P.interstage.linerClearance;
    }
    if(x>=last.rear&&x<=last.rear+P.interstage.tailGuideLength)
      return sampledTransition(x,last.rear,last.rear+P.interstage.tailGuideLength,last.rearOuter+P.interstage.wall,140,40);
    return null;
  }
  // The inner sleeve of one stage and the following outer collection lip are
  // separate walls at the same axial station. A radius jump there is not a
  // physical sheet crossing and must not create a fictitious sealing collar.
  function guideZone(x) {
    for(let k=0;k<2;k++){
      const a=P.stacks[k],b=P.stacks[k+1];
      if(x>=a.rear&&x<=b.front)return k*2;
      if(x>b.front&&x<b.rear)return k*2+1;
    }
    return x>=last.rear&&x<=last.rear+P.interstage.tailGuideLength?4:-1;
  }
  const gap=p=>{const r=guideRadius(p[0]);return r===null?null:Math.hypot(p[1],p[2])-r;};
  const used=[];
  for(const item of allPaths) for(let j=1;j<item.points.length;j++) {
    const a=item.points[j-1],b=item.points[j],delta=vsub(b,a),length=norm(delta),direction=unit(delta);
    const n=Math.max(1,Math.ceil(length/3));
    for(let k=1;k<=n;k++) {
      let ta=(k-1)/n,tb=k/n,pa=vadd(a,vmul(delta,ta)),pb=vadd(a,vmul(delta,tb));
      if(guideZone(pa[0])!==guideZone(pb[0]))continue;
      let fa=gap(pa),fb=gap(pb);
      if(fa===null||fb===null||fa*fb>0||Math.abs(fa-fb)<1e-8)continue;
      for(let it=0;it<30;it++){const tm=(ta+tb)/2,pm=vadd(a,vmul(delta,tm)),fm=gap(pm);
        if(fm===null)break;if(fa*fm<=0){tb=tm;fb=fm;}else{ta=tm;fa=fm;}}
      const centre=vadd(a,vmul(delta,(ta+tb)/2));
      if(used.some(p=>norm(vsub(p,centre))<3))continue;used.push(centre);
      const ca=vadd(centre,vmul(direction,-2.5)),cb=vadd(centre,vmul(direction,2.5));
      const collar=cylinder(ca,cb,item.outer+1.2,item.outer+1.2,32);
      networks[item.key].outer.push(collar);
      networks[item.key].bores.push(cylinder(vadd(ca,vmul(direction,-.15)),vadd(cb,vmul(direction,.15)),item.inner,item.inner,32));
      seals.push({medium:item.key,centre,outerRadius:item.outer+1.2,length:5});
      for(const [i,s]of P.stacks.entries())if(centre[0]>=s.front&&centre[0]<=s.rear)stackCutters[i].push(collar);
    }
  }
  const bores=Object.fromEntries(keys.map(k=>[k,union(networks[k].bores)]));
  isolationChecks.push({name:'air-header-vs-wet-exhaust-header',a:bores.air,b:bores.cathode},
    {name:'feed-vs-return-outside-circulation-pump',a:bores.feed,b:bores.return});
  const cathodeCircuit=union([bores.air,bores.cathode,cathode.gasBore,cathode.drainBore]);
  const anodeCircuit=union([bores.feed,bores.return,anode.gasBore,anode.drainBore,pumpBore]);
  const color={air:C.air,cathode:'#6aa5b7',feed:C.hydrogen,return:C.return};
  const groups={air:'air',cathode:'cathodeExhaust',feed:'hydrogen',return:'return'};
  const titles={air:'阴极反应空气 · 中央主管与三级独立支路',cathode:'三级阴极湿尾气 · 独立除水回路',
    feed:'中央供氢总管 · 堆后环绕与内缘后侧入口',return:'内缘前侧回氢 · 除水后循环'};
  const networkSolids={};
  for(const key of keys){
    const solid=union(networks[key].outer).subtract(key==='air'||key==='cathode'?cathodeCircuit:anodeCircuit);
    networkSolids[key]=solid;
    add(`${groups[key]}-network`,titles[key],groups[key],color[key],solid,
      {clip:true,metallic:.43,roughness:.31});
  }
  // These are presentation-only copies of the already hollow pressure parts.
  // The builder adds them after physical assembly checks. Cutting an existing
  // pipe wall to this window leaves annular open ends, never solid pipe caps.
  const inspectionWindow=[front.front-4,front.rear+70];
  const inspectionBox=M.cube([inspectionWindow[1]-inspectionWindow[0],1100,1100],true)
    .translate([(inspectionWindow[0]+inspectionWindow[1])/2,0,0]);
  const inspectionParts=keys.map(key=>({
    id:`inspection-stage-1-${groups[key]}`,name:`一级电堆局部完整管路 · ${titles[key]}`,
    group:groups[key],color:color[key],solid:networkSolids[key].intersect(inspectionBox),
    clip:false,inspectionOnly:true,inspectionStage:1,inspectionAxialWindow:inspectionWindow,
    metallic:.43,roughness:.31,
  }));
  inspectionBox.delete();
  // Do not use this cutter on the pressure parts themselves. It is exclusively
  // the receiving cooling-guide sheet's matching penetration seat envelope.
  const linerCutters=union([...keys.flatMap(k=>networks[k].outer),anode.outer,cathode.outer,pumpOuter]);
  return {ports,stackCutters:stackCutters.map(a=>union(a)),linerCutters,inspectionParts,
    bores:{...bores,cathodeCircuit,anodeCircuit},junctionChecks,isolationChecks,aftSupplyBranches,
    checks:{units:'mm',stages:componentChecks,portCounts:{air:3,cathode:3,hydrogen:3,return:3},
      independentModules:3,pressureCircuitsSeparate:true,centralAir:{outerRadius:AIR.outer,innerRadius:AIR.inner,end:AIR.end},
      hydrogenHeaders:{feedRadius,feedAngle,feedLocation:'stack central bore, outside air main',returnRadius:railRadius,returnAngle},sealedCoolingGuidePenetrations:seals,
      separators:[anode.check,cathode.check],independentDrainCount:2,cathodeTailGasOutlet:[tailOutlet,65,45],
      pump:{front:pumpFront,rear:pumpRear,centreYZ:pumpCentre,radius:pumpRadius},
      internalChannelStatus:'independent interface stubs only; no external air-exhaust or feed-return stack bypass'}};
}
