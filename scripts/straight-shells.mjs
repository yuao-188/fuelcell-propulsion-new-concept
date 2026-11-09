/** Straight nacelle, local exhaust collectors, no overall inner casing. */
export function buildStraightShells(ctx, linerCutters = []) {
  const {P, M, CS, C, union, cylinder, revolved, polar, add, sector, tubePath, roundPath} = ctx;
  const os=P.outerShell, wall=P.interstage.wall;
  const penetrationCut=Array.isArray(linerCutters)?(linerCutters.length?union(linerCutters):null):linerCutters;
  const smooth=t=>t*t*(3-2*t);
  const profile=[[os.front,os.radius],[os.shoulder,os.radius]];
  for(let j=1;j<=48;j++) {
    const t=j/48;
    profile.push([os.shoulder+(os.rear-os.shoulder)*t,
      os.radius+(os.outletRadius-os.radius)*smooth(t)]);
  }
  const axial=(a,b,r)=>cylinder([a,0,0],[b,0,0],r,r,192);
  const radiusAt=x=>x<=os.shoulder?os.radius:os.radius+(os.outletRadius-os.radius)*smooth((x-os.shoulder)/(os.rear-os.shoulder));
  const envelope=revolved(profile,os.wall);
  // The flow envelope stays at R500 / R506. Assembly details are external or
  // fitted into explicit shallow seats; none thickens the wall into the fan.
  const R=os.radius,relief=.08;
  const boundaries=[os.front,380,980,1610,os.shoulder,os.rear];
  const joints=boundaries.slice(1,-1);
  const bodyCuts=[],flanges=[],gaskets=[],fasteners=[],panelParts=[],inspectionBases=[],inspectionCaps=[];
  const conduits=[],clamps=[],ears=[],boxParts=[],connectorCaps=[];
  const plus=(a,b)=>a.map((v,i)=>v+b[i]);
  const local=(x,r,t,a)=>{const q=a*Math.PI/180;return [x,r*Math.cos(q)-t*Math.sin(q),r*Math.sin(q)+t*Math.cos(q)];};
  const radial=(x,r0,r1,a,size,n=32)=>cylinder(polar(x,r0,a),polar(x,r1,a),size,size,n);
  const ring=(a,b,ro,ri)=>revolved([[a,ro],[b,ro]],ro-ri);
  const profiledRing=(p,inner)=>revolved(p,x=>{
    const j=p.findIndex(q=>q[0]>=x);
    if(j<=0)return p[0][1]-inner;
    const a=p[j-1],b=p[j];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])-inner;
  });
  const localBox=(x,r,t,L,H,W,a=0)=>M.cube([L,H,W],true).translate([x,r,t]).rotate([a,0,0]);
  const roundedPatch=(x,L,W,a,r0=490,r1=530,corner=12)=>{
    const d=r1-r0,rc=(r0+r1)/2;
    const pieces=[localBox(x,rc,0,L-2*corner,d,W,a),localBox(x,rc,0,L,d,W-2*corner,a)];
    for(const sx of [-1,1])for(const st of [-1,1]){
      const xx=x+sx*(L/2-corner),tt=st*(W/2-corner);
      pieces.push(cylinder(local(xx,r0,tt,a),local(xx,r1,tt,a),corner,corner,24));
    }
    return union(pieces);
  };
  const hexBolt=(a,b,shaftRadius,headRadius,headLength)=>{
    const v=b.map((q,i)=>q-a[i]),l=Math.hypot(...v),n=v.map(q=>q/l);
    const start=a.map((q,i)=>q-n[i]*headLength);
    return union([cylinder(a,b,shaftRadius,shaftRadius,16),cylinder(start,a,headRadius,headRadius,6)]);
  };
  const emit=(id,name,color,solid,finish='machined-aluminium',metallic=.88,roughness=.28)=>
    add(id,name,'outerShell',color,solid,{clip:true,metallic,roughness,finish});

  // Four pairs of separate raised flange ears, radial locating shoulders,
  // visible centre seals, and axial through-bolts. Bores are cut from the ears.
  for(const [jointIndex,x] of joints.entries()) {
    const r=radiusAt(x),ri=r-2.8;
    const left=profiledRing([[x-12,r+2],[x-5.02,r+2],[x-5,r+18],[x-4.2,r+19],[x-.65,r+19]],ri);
    const right=profiledRing([[x+.65,r+19],[x+4.2,r+19],[x+5,r+18],[x+5.02,r+2],[x+12,r+2]],ri);
    const holes=[];
    for(let j=0;j<24;j++) {
      const a=7.5+j*15,p=polar(x-9,r+12,a),q=polar(x+9,r+12,a);
      holes.push(cylinder(p,q,2.2,2.2,20));
      const shaft=cylinder(polar(x-5.1,r+12,a),polar(x+5.1,r+12,a),1.65,1.65,16);
      const head=cylinder(polar(x-8,r+12,a),polar(x-5.15,r+12,a),3.3,3.3,6);
      const nut=cylinder(polar(x+5.15,r+12,a),polar(x+8,r+12,a),3.1,3.1,6);
      fasteners.push(union([shaft,head,nut]));
    }
    const bores=union(holes);
    flanges.push(left.subtract(bores),right.subtract(bores));
    bodyCuts.push(ring(x-12-relief,x-.65+relief,R+5,ri-relief),ring(x+.65-relief,x+12+relief,R+5,ri-relief));
    gaskets.push(ring(x-.18,x+.18,r+6.5,r-os.wall));
  }

  // Four true curved access covers, on both observable sides of the nacelle.
  // Their rounded pockets leave an uninterrupted inner pressure skin behind.
  const panels=[{x:680,a:65,L:220,W:116},{x:1330,a:65,L:270,W:146},
    {x:1130,a:295,L:218,W:126},{x:1940,a:295,L:242,W:116}];
  for(const [pi,p] of panels.entries()) {
    const footprint=roundedPatch(p.x,p.L,p.W,p.a),pocket=roundedPatch(p.x,p.L+.7,p.W+.7,p.a);
    let cover=ring(p.x-p.L/2-2,p.x+p.L/2+2,R-.18,R-2.35).intersect(footprint);
    bodyCuts.push(ring(p.x-p.L/2-3,p.x+p.L/2+3,R+.4,R-2.55).intersect(pocket));
    const screwHoles=[];
    for(const sx of [-1,1])for(const st of [-1,1]) {
      const x=p.x+sx*(p.L/2-18),t=st*(p.W/2-17),rr=Math.sqrt((R-.18)**2-t*t);
      const lo=local(x,rr-2.4,t,p.a),hi=local(x,rr+.4,t,p.a);
      const hole=cylinder(lo,hi,2.55,2.55,24);bodyCuts.push(hole);screwHoles.push(hole);
      const head=cylinder(local(x,rr-2.2,t,p.a),local(x,rr-.1,t,p.a),2.3,2.3,24);
      const socket=cylinder(local(x,rr-.85,t,p.a),local(x,rr+.2,t,p.a),.95,.95,6);
      fasteners.push(head.subtract(socket));
    }
    cover=cover.subtract(union(screwHoles));panelParts.push(cover);
  }

  // Two inspection ports with recessed necks, real openings and bolted covers.
  // Their caps stay fitted; the original cooling/pressure circuits are untouched.
  for(const p of [{x:864,a:112},{x:1780,a:300}]) {
    const neck=radial(p.x,R-2.7,R+5,p.a,25,64),bore=radial(p.x,R-os.wall-1,R+12,p.a,13.5,48);
    bodyCuts.push(radial(p.x,R-2.85,R+.4,p.a,25.2,64),bore);
    let base=neck.subtract(bore),cap=radial(p.x,R+5.15,R+9.5,p.a,28,64);
    const holes=[];
    for(let j=0;j<4;j++) {
      const b=j*Math.PI/2,x=p.x+21*Math.cos(b),t=21*Math.sin(b);
      const a=local(x,R-2.4,t,p.a),z=local(x,R+10,t,p.a);
      const hole=cylinder(a,z,2.05,2.05,20);holes.push(hole);bodyCuts.push(hole);
      const lo=local(x,R-2.3,t,p.a),hi=local(x,R+9.65,t,p.a);
      const v=[0,Math.cos(p.a*Math.PI/180),Math.sin(p.a*Math.PI/180)];
      fasteners.push(union([cylinder(lo,hi,1.6,1.6,16),cylinder(hi,plus(hi,v.map(q=>q*2.1)),3.0,3.0,6)]));
    }
    const hc=union(holes);base=base.subtract(hc);cap=cap.subtract(hc);
    inspectionBases.push(base);inspectionCaps.push(cap);
  }

  // Restrained external electrical/service conduits. Stand-offs clear all four
  // raised joint flanges. Both ends meet recessed hollow bulkhead connectors.
  for(const line of [{a:35,x0:548,x1:1515,clampXs:[720,1100,1390]},
    {a:325,x0:1245,x1:2090,clampXs:[1395,1830,2000]}]) {
    const route=roundPath([polar(line.x0,R+7,line.a),polar(line.x0,R+29,line.a),
      polar(line.x1,R+29,line.a),polar(line.x1,R+7,line.a)],10);
    conduits.push(tubePath(route,2.8).subtract(tubePath(route,1.6,.2)));
    for(const x of [line.x0,line.x1]) {
      const bore=radial(x,R-os.wall-1,R+7.2,line.a,1.6,24);
      bodyCuts.push(radial(x,R-2.7,R+.3,line.a,7.2,32),bore);
      inspectionBases.push(radial(x,R-2.6,R+7,line.a,7,32).subtract(bore));
    }
    for(const x of line.clampXs) {
      const centre=polar(x,R+29,line.a);
      const clamp=cylinder([x-2,...centre.slice(1)],[x+2,...centre.slice(1)],4.8,4.8,40)
        .subtract(cylinder([x-2.1,...centre.slice(1)],[x+2.1,...centre.slice(1)],3.1,3.1,32));
      const foot=radial(x,R-1.6,R+1.5,line.a,5.5,28),stem=radial(x,R+1.5,R+24.05,line.a,2.0,20);
      bodyCuts.push(radial(x,R-1.7,R+.4,line.a,5.7,28));clamps.push(union([foot,stem,clamp]));
    }
  }

  // Top electrical box with a curved recessed saddle, an open cavity, separate
  // gasket/lid and two sealed connector sockets. It is an electrical enclosure,
  // not an imitation combustion/fuel accessory from the reference engine.
  const boxX=570,boxL=100,boxW=68,boxLower=R+5,boxUpper=R+38;
  const saddleBlank=roundedPatch(boxX,124,88,0,R-4,R+5,10);
  const saddle=saddleBlank.subtract(axial(boxX-70,boxX+70,R-2.8));
  const saddlePocket=roundedPatch(boxX,124.4,88.4,0,R-8,R+.3,10)
    .subtract(axial(boxX-70,boxX+70,R-2.9));
  bodyCuts.push(saddlePocket);
  const outerBox=localBox(boxX,(boxLower+boxUpper)/2,0,boxL,boxUpper-boxLower,boxW);
  const inside=localBox(boxX,(boxLower+2.8+boxUpper+.3)/2,0,80,boxUpper+.3-(boxLower+2.8),48);
  let box=outerBox.subtract(inside),lid=localBox(boxX,boxUpper+1.25,0,boxL,2,boxW);
  const boxHoles=[];
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    const x=boxX+sx*44.5,z=sz*28;
    boxHoles.push(cylinder([x,boxUpper-8,z],[x,boxUpper+3.2,z],1.65,1.65,20));
    fasteners.push(union([cylinder([x,boxUpper-7.8,z],[x,boxUpper+2.4,z],1.2,1.2,16),
      cylinder([x,boxUpper+2.4,z],[x,boxUpper+4.4,z],2.3,2.3,6)]));
  }
  const bh=union(boxHoles);box=box.subtract(bh);lid=lid.subtract(bh);
  boxParts.push(saddle,box,lid);
  for(const sign of [-1,1]) {
    const x=boxX+sign*boxL/2;
    const a=[x,R+23,0],b=[x+sign*12,R+23,0];
    inspectionBases.push(cylinder(a,b,8,8,40).subtract(cylinder([x-sign*.2,R+23,0],[x+sign*12.2,R+23,0],4,4,32)));
    connectorCaps.push(cylinder([x+sign*12.15,R+23,0],[x+sign*15.15,R+23,0],7,7,40));
  }

  // Four mounting eyes with real through-holes, integrated curved feet and
  // short ribs. Their tops remain below R551 and are visible from both sides.
  for(const x of [325,1720])for(const a of [80,280]) {
    const foot=sector(x-19,x+19,R-2.6,R+4,a-3,a+3);
    const web=localBox(x,R+20,0,7,32,14,a);
    const c=polar(x,R+32,a),eye=cylinder([x-3.5,...c.slice(1)],[x+3.5,...c.slice(1)],12,12,48);
    const hole=cylinder([x-3.7,...c.slice(1)],[x+3.7,...c.slice(1)],5,5,32);
    ears.push(union([foot,web,eye]).subtract(hole));
    bodyCuts.push(sector(x-19.15,x+19.15,R-2.75,R+.4,a-3.03,a+3.03));
  }

  const allCuts=union(bodyCuts),sectionTints=['#a8b4bc','#bec7cc','#a7b4bc','#b7c1c8','#9faeb9'];
  for(let i=0;i<boundaries.length-1;i++) {
    const a=boundaries[i]+(i===0?8.05:.24),b=boundaries[i+1]-(i===boundaries.length-2?5.05:.24);
    const body=envelope.intersect(axial(a,b,R+2)).subtract(allCuts);
    emit(i===0?'outer-shell':`outer-shell-section-${i+1}`,`${i+1}段银灰装配机匣`,sectionTints[i],body,'casing-satin',.88,.34);
  }
  const rims=union([envelope.intersect(axial(os.front,os.front+8,R+2)),envelope.intersect(axial(os.rear-5,os.rear,R+2))]);
  emit('outer-shell-rims','进出口精加工口沿','#d1d9de',rims);
  emit('outer-shell-joint-flanges','四组双耳连接法兰','#bdc7ce',union(flanges));
  emit('outer-shell-joint-gaskets','机匣分段密封缝','#33444d',union(gaskets),'dark-gasket',.08,.68);
  emit('outer-shell-access-panels','双侧弧面检修盖','#a2b0ba',union(panelParts),'access-panel',.84,.36);
  emit('outer-shell-inspection-bases','检查口与线管接口底座','#aab8c2',union(inspectionBases));
  emit('outer-shell-inspection-caps','双侧检查口法兰封盖','#c0cbd2',union(inspectionCaps));
  emit('outer-shell-service-conduits','双侧外部电气保护线管','#596e7a',union(conduits),'service-conduit',.82,.32);
  emit('outer-shell-conduit-clamps','线管间隔卡箍与座脚','#8a9aa5',union(clamps));
  emit('outer-shell-electrical-box','顶部接线盒与可拆盖','#aab7bf',union(boxParts),'electrical-housing',.81,.36);
  emit('outer-shell-connector-caps','电气接口防尘端盖','#3c5665',union(connectorCaps),'connector-polymer',.12,.56);
  emit('outer-shell-mounting-ears','双侧安装耳座','#aebbc4',union(ears));
  emit('outer-shell-fasteners','机匣法兰与检修件紧固件','#74838e',union(fasteners),'machined-fastener',.94,.24);
  const support=P.statorSupport;
  add('stator-support','后静叶独立短支承环','statorSupport','#95a5af',revolved([[support.front,support.radius],[support.rear,support.radius]],support.radius-support.inner),
    {clip:true,metallic:.81,roughness:.3});

  const guides=[], cavities=[];
  for(let k=0;k<2;k++) {
    const a=P.stacks[k],b=P.stacks[k+1],start=a.rear,end=b.front;
    const radius0=a.outer+wall,radius1=b.inner-P.interstage.linerClearance;
    const p=[[start,radius0]];
    for(let j=1;j<=32;j++) {
      const t=j/32;p.push([start+(end-start)*t,radius0+(radius1-radius0)*smooth(t)]);
    }
    p.push([b.rear,radius1]);
    let solid=revolved(p,wall);
    if(penetrationCut)solid=solid.subtract(penetrationCut);
    add(`interstage-guide-${k+1}`,`第${k+1}级冷却排气收集罩与第${k+2}级中心隔离筒`,'interstageGuide','#73858e',solid,
      {clip:true,stage:k+2,metallic:.79,roughness:.3,finish:'satin-aluminium'});
    guides.push({from:k+1,to:k+2,front:start,contractionEnd:end,rear:b.rear,
      radialStart:radius0,radialEnd:radius1,wall,axialGap:end-start,linerToCellsClearance:b.inner-radius1});
    cavities.push({front:end,rear:b.rear,innerRadius:radius1-wall});
  }
  const last=P.stacks.at(-1), finalProfile=[];
  for(let j=0;j<=40;j++) { const t=j/40; finalProfile.push([last.rear+P.interstage.tailGuideLength*t,last.outer+wall+(140-last.outer-wall)*smooth(t)]); }
  let final=revolved(finalProfile,wall);
  if(penetrationCut)final=final.subtract(penetrationCut);
  add('final-exhaust-guide','末级冷却排气收集尾罩','interstageGuide','#73858e',final,{clip:true,stage:3,metallic:.79,roughness:.3});
  return {profile,guides,cavities,removedOverallInnerShell:true,statorSupport:support,
    straightBore:2*(os.radius-os.wall),exitBore:2*(os.outletRadius-os.wall),length:os.rear-os.front,
    fanTipClearance:os.radius-os.wall-P.fan.radius};
}
