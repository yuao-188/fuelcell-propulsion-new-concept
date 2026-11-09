/** Three complete ring stacks: hollow, separate cathode and hydrogen circuits.
 * Local root/edge channels are schematic module collectors, not cell-resolved
 * electrochemistry. Every pressure passage has a real outer wall and bore.
 */
export function buildCompactFluidNetworks(ctx) {
  const { M, P, C, union, cylinder, tubePath, roundPath, polar, add } = ctx;
  const keys = ['air','cathode','feed','return'];
  const networks = Object.fromEntries(keys.map(k=>[k,{outer:[],bores:[]}]));
  const ports = [], allPaths = [], junctionChecks = [], stackCutters = P.stacks.map(()=>[]);
  const seals = [], componentChecks = [];
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
    if(stage!==undefined) stackCutters[stage].push(tubePath(pp,outer+.035));
    return {outside,bore};
  }
  function arcPoints(x,r,start,end) {
    const n=Math.max(2,Math.ceil(Math.abs(end-start)/3));
    return Array.from({length:n+1},(_,k)=>polar(x,r,start+(end-start)*k/n));
  }
  function roundedJunction(key,point,outer,inner,stage) {
    // Orthogonal runs sharing an endpoint need a real elbow envelope; two
    // flat-ended cylinders alone leave tiny open corners beyond their caps.
    const shell=M.sphere(outer,32).translate(point),bore=M.sphere(inner,32).translate(point);
    networks[key].outer.push(shell);networks[key].bores.push(bore);
    stackCutters[stage].push(M.sphere(outer+.035,32).translate(point));
  }
  const port=(fluid,stage,point,direction,inner,outer)=>ports.push({
    id:`${fluid}-${stage}-1`,fluid,medium:fluid,stage,module:1,position:point,direction,inner,outer,
  });
  const polarDirection=(theta,sign=1)=>[0,sign*Math.cos(theta*Math.PI/180),sign*Math.sin(theta*Math.PI/180)];
  const AIR=P.air, railRadius=350, feedRadius=H.headerRadius,feedAngle=H.headerAngle, returnAngle=225, wetRadius=39;
  const supplyStart=front.rear+H.rearOffset, returnStart=front.front+65;
  const returnEnd=last.rear+13,wetEnd=last.rear+11,tailOutlet=last.rear+170;
  const firstWet=front.front+.56*(front.rear-front.front);
  path('air',[[P.compressor.outlet,0,0],[AIR.end,0,0]],AIR.outer,AIR.inner);
  path('feed',[polar(supplyStart-6,feedRadius,feedAngle),polar(H.inletX,feedRadius,feedAngle)],H.outer,H.inner,{blindStart:true});
  path('return',[polar(returnStart-6,railRadius,returnAngle),polar(returnEnd,railRadius,returnAngle)],H.outer,H.inner,{blindStart:true});
  path('cathode',[polar(firstWet-6,wetRadius,90),polar(wetEnd,wetRadius,90)],5.2,3.4,{blindStart:true});

  for(const [i,s] of P.stacks.entries()) {
    const stage=i+1, L=s.rear-s.front;
    const airX=s.front+.32*L, wetX=s.front+.56*L, midX=(airX+wetX)/2;
    const feedX=s.rear-9,feedHeaderX=s.rear+(H.branchRearOffsets?.[i]??H.rearOffset), returnX=s.front+65;
    const root=s.inner+3.3, edge=s.outer-4;
    const airIn=path('air',[[airX,0,0],polar(airX,root,0)],5,3.5,{stage:i,blindEnd:true});
    const inletRail=path('air',[polar(airX,root,0),polar(midX,root,0)],3.3,2.1,{stage:i});
    const outletRail=path('cathode',[polar(midX,root,0),polar(wetX,root,0)],3.3,2.1,{stage:i});
    const wetOut=path('cathode',[polar(wetX,root,0),polar(wetX,wetRadius,0),...arcPoints(wetX,wetRadius,0,90).slice(1)],5.2,3.4,{stage:i,blindStart:true});
    roundedJunction('air',polar(airX,root,0),3.3,2.1,i);
    roundedJunction('cathode',polar(wetX,root,0),3.3,2.1,i);
    // The supply header sits inside the stack centre bore, outside the blue
    // air pipe. Each branch turns through the interstage bay, then enters the
    // stack axially through its rear face. Its pressure wall stays continuous.
    const feedIn=path('feed',[polar(feedHeaderX,feedRadius,feedAngle),polar(feedHeaderX,edge,feedAngle),
      polar(feedX,edge,feedAngle)],3.3,2.1,{stage:i,round:6});
    const anodeMid=(feedX+returnX)/2;
    const feedRail=path('feed',[polar(feedX,edge,feedAngle),polar(anodeMid,edge,feedAngle)],3.3,2.1,{stage:i});
    roundedJunction('feed',polar(feedX,edge,feedAngle),3.3,2.1,i);
    const returnRail=path('return',[polar(anodeMid,edge,feedAngle),polar(returnX,edge,feedAngle),
      ...arcPoints(returnX,edge,feedAngle,returnAngle).slice(1),polar(returnX,railRadius,returnAngle)],3.3,2.1,{stage:i});
    port('air',stage,polar(airX,s.inner,0),polarDirection(0),3.5,5);
    port('cathode',stage,polar(wetX,s.inner,0),polarDirection(0,-1),3.4,5.2);
    port('hydrogen',stage,polar(s.rear,edge,feedAngle),[-1,0,0],2.1,3.3);
    port('return',stage,polar(returnX,s.outer,returnAngle),polarDirection(returnAngle),2.1,3.3);
    junctionChecks.push({name:`stage-${stage}-cathode-root`,a:airIn.bore,b:inletRail.bore},
      {name:`stage-${stage}-cathode-mid`,a:inletRail.bore,b:outletRail.bore},
      {name:`stage-${stage}-wet-out`,a:outletRail.bore,b:wetOut.bore},
      {name:`stage-${stage}-hydrogen-port`,a:feedIn.bore,b:feedRail.bore},
      {name:`stage-${stage}-anode-mid`,a:feedRail.bore,b:returnRail.bore});
    componentChecks.push({stage,airX,wetX,feedX,feedHeaderX,returnX,rootRailRadius:root,hydrogenEdgeRailRadius:edge,
      interfacesPerMedium:1,feedFace:'rear axial face',returnFace:'outer cylindrical face',
      collectorRepresentation:'local pressure channels seated in radial plate edges'});
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
  path('cathode',[polar(wetEnd,wetRadius,90),[wetEnd,65,39],[wetEnd+10,65,45],cathode.inlet],5.2,3.4,{round:5});
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
      const a=P.stacks[k],b=P.stacks[k+1],r0=a.outer+P.interstage.wall,r1=b.inner-P.interstage.linerClearance;
      if(x>=a.rear&&x<=b.front)return sampledTransition(x,a.rear,b.front,r0,r1,32);
      if(x>b.front&&x<b.rear)return r1;
    }
    if(x>=last.rear&&x<=last.rear+P.interstage.tailGuideLength)
      return sampledTransition(x,last.rear,last.rear+P.interstage.tailGuideLength,last.outer+P.interstage.wall,140,40);
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
  const cathodeCircuit=union([bores.air,bores.cathode,cathode.gasBore,cathode.drainBore]);
  const anodeCircuit=union([bores.feed,bores.return,anode.gasBore,anode.drainBore,pumpBore]);
  const color={air:C.air,cathode:'#6aa5b7',feed:C.hydrogen,return:C.return};
  const groups={air:'air',cathode:'cathodeExhaust',feed:'hydrogen',return:'return'};
  const titles={air:'阴极反应空气 · 中央主管与三级独立支路',cathode:'三级阴极湿尾气 · 独立除水回路',
    feed:'中央孔内供氢总管 · 三级后端面入口',return:'三级阳极回氢 · 除水后循环'};
  for(const key of keys)add(`${groups[key]}-network`,titles[key],groups[key],color[key],
    union(networks[key].outer).subtract(key==='air'||key==='cathode'?cathodeCircuit:anodeCircuit),
    {clip:true,metallic:.43,roughness:.31});
  // Do not use this cutter on the pressure parts themselves. It is exclusively
  // the receiving cooling-guide sheet's matching penetration seat envelope.
  const linerCutters=union([...keys.flatMap(k=>networks[k].outer),anode.outer,cathode.outer,pumpOuter]);
  return {ports,stackCutters:stackCutters.map(a=>union(a)),linerCutters,
    bores:{...bores,cathodeCircuit,anodeCircuit},junctionChecks,
    checks:{units:'mm',stages:componentChecks,portCounts:{air:3,cathode:3,hydrogen:3,return:3},
      independentModules:3,pressureCircuitsSeparate:true,centralAir:{outerRadius:AIR.outer,innerRadius:AIR.inner,end:AIR.end},
      hydrogenHeaders:{feedRadius,feedAngle,feedLocation:'stack central bore, outside air main',returnRadius:railRadius,returnAngle},sealedCoolingGuidePenetrations:seals,
      separators:[anode.check,cathode.check],independentDrainCount:2,cathodeTailGasOutlet:[tailOutlet,65,45],
      pump:{front:pumpFront,rear:pumpRear,centreYZ:pumpCentre,radius:pumpRadius},
      internalChannelStatus:'local edge-collector representation; broad axial cooling windows remain open'}};
}
