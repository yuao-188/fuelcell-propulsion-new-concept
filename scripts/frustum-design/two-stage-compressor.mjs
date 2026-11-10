/** Variant-private continuously contracting casing, beginning at its inlet.
 * The existing rotor radii/axial stations constrain how early it can narrow:
 * follow each blade-tip envelope with a real running gap, then contract more
 * quickly after it. Diffuser outer edges seat against the updated inner wall;
 * their inner edges, count and axial positions remain unchanged.
 */
export function getCompressorCasingProfile(P) {
  const K=P.compressor,scale=(K.outlet-K.front)/210;
  const ax=x=>K.front+(x-480)*scale,rr=r=>r*K.inner/165;
  const neckStart=K.outlet-(K.outletNeckLength??(K.outlet-K.rear)*.5);
  const bladeTipClearance=1.0;
  // The warped blades extend 0.15 mm behind their nominal rear face. Include
  // that extension instead of sizing the casing only at the backplate plane.
  const rotorEnvelopes=K.stages.map((stage,i)=>({
    stage:i+1,rear:ax(i===0?544:611)+.15,
    radius:rr(stage.bladeOuter),clearance:bladeTipClearance,
  }));
  // Keep a visible downstream diffuser passage before the final collection
  // bend. This is not an extra level land: all interior tangents are negative.
  const diffuserRear=ax(K.stages[1].diffuserRear);
  const diffuserPassage=rr(K.stages[1].diffuserInner)+7.3;
  const knots=[[K.front,K.inner],
    ...rotorEnvelopes.map(S=>[S.rear,S.radius+S.clearance]),
    [diffuserRear,diffuserPassage],
    [neckStart,P.air.inner],[K.outlet,P.air.inner]];
  if(knots.some((p,i)=>i&&(p[0]<=knots[i-1][0]||p[1]>knots[i-1][1])))
    throw new Error('Compressor casing needs ordered axial stations and decreasing radii');
  const h=knots.slice(1).map((p,i)=>p[0]-knots[i][0]);
  const slopes=knots.slice(1).map((p,i)=>(p[1]-knots[i][1])/h[i]);
  const tangents=knots.map((_,i)=>{
    if(i===0||i===knots.length-1||slopes[i-1]*slopes[i]<=0)return 0;
    const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];
    return (w1+w2)/(w1/slopes[i-1]+w2/slopes[i]);
  });
  const innerAt=x=>{
    if(x<=K.front)return K.inner;
    if(x>=K.outlet)return P.air.inner;
    const i=Math.max(1,knots.findIndex(p=>p[0]>=x)),a=knots[i-1],b=knots[i];
    const t=(x-a[0])/(b[0]-a[0]),t2=t*t,t3=t2*t,length=b[0]-a[0];
    return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*length*tangents[i-1]
      +(-2*t3+3*t2)*b[1]+(t3-t2)*length*tangents[i];
  };
  const wallAt=r=>(P.air.outer-P.air.inner)+(K.outer-K.inner-(P.air.outer-P.air.inner))
    *Math.max(0,Math.min(1,(r-P.air.inner)/(K.inner-P.air.inner)));
  const inside=[knots[0]];
  for(let i=1;i<knots.length;i++){
    const samples=Math.max(8,Math.ceil((knots[i][0]-knots[i-1][0])/1.25));
    for(let j=1;j<=samples;j++){
      const x=knots[i-1][0]+(knots[i][0]-knots[i-1][0])*j/samples;
      inside.push([x,innerAt(x)]);
    }
  }
  const outside=inside.map(([x,r])=>[x,r+wallAt(r)]);
  return {neckStart,knots,tangents,innerAt,inside,outside,rotorEnvelopes,
    contractionStart:K.front,bladeTipClearance,diffuserOuterEdges:'seated-to-casing'};
}

/** Two independently driven centrifugal stages. All drive sizes are schematic. */
export function buildTwoStageCompressor({ M, CS, P, C, union, cylinder, axisCylinder, solidLathe, hollowLathe, add }) {
  const tau = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const metal = { metallic: .83, roughness: .27, finish: 'machined' };
  const steel = '#dce6ed', darkSteel = '#526673', paleSteel = '#b2bec6', vaneSteel = '#718794';
  const K = P.compressor, axialScale = (K.outlet - K.front) / 210;
  const ax = nominal => K.front + (nominal - 480) * axialScale;
  const rr = nominal => nominal * K.inner / 165;
  const casingProfile=getCompressorCasingProfile(P);
  const {neckStart,innerAt,inside:casingInside,outside:casingOutside}=casingProfile;
  const caseLumen = solidLathe(casingInside);
  const caseFree = solidLathe(casingInside.map(([x, r]) => [x, r - .08]));
  const casingWall = hollowLathe(casingOutside, casingInside);

  function radialVane(inner, outer, angle, sweep, width, start, end, heightAt, rootExtensionInner = inner) {
    const profile = [], steps = 28;
    const radii = [];
    if (rootExtensionInner < inner) for (let j = 0; j < 8; j++) radii.push(lerp(rootExtensionInner, inner, j / 8));
    radii.push(...Array.from({ length: steps + 1 }, (_, j) => lerp(inner, outer, j / steps)));
    for (const side of [1, -1]) for (const r of side === 1 ? radii : radii.toReversed()) {
      // Below the original working inner radius, continue its radial tangent
      // into the hub. The original swept blade profile is unchanged outside it.
      const t = Math.max(0, (r - inner) / (outer - inner));
      const a = angle + sweep * t * t + side * width / (2 * r);
      profile.push([-r * Math.sin(a), r * Math.cos(a)]);
    }
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const a = profile[i], b = profile[(i + 1) % profile.length]; area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) profile.reverse();
    let solid = new CS([profile]).extrude(1).rotate([0, 90, 0]);
    if (heightAt) solid = solid.warp(v => {
      const t = clamp((Math.hypot(v[1], v[2]) - inner) / (outer - inner), 0, 1);
      v[0] = end - heightAt(t) * (1 - v[0]) + .15 * v[0];
    });
    else solid = solid.scale([end - start, 1, 1]).translate([start, 0, 0]);
    return solid;
  }
  const [firstStage, secondStage] = K.stages;
  const stages = [
    { number: 1, plate: ax(544), back: ax(549), radius: rr(firstStage.backplateRadius), eye: rr(41),
      bladeInner: rr(39), bladeOuter: rr(firstStage.bladeOuter), heightIn: 22 * axialScale, heightOut: 9.5 * axialScale,
      hubStart: ax(514), hubShoulder: ax(522), shaftFront: ax(487), shaftRear: ax(549),
      diffuserStart: ax(firstStage.diffuserFront), diffuserEnd: ax(firstStage.diffuserRear), diffuserInner: rr(firstStage.diffuserInner) },
    { number: 2, plate: ax(611), back: ax(616), radius: rr(secondStage.backplateRadius), eye: rr(35.6),
      bladeInner: rr(33.5), bladeOuter: rr(secondStage.bladeOuter), heightIn: 27 * axialScale, heightOut: 11 * axialScale,
      hubStart: ax(576), hubShoulder: ax(584), shaftFront: ax(611), shaftRear: ax(638),
      diffuserStart: ax(secondStage.diffuserFront), diffuserEnd: ax(secondStage.diffuserRear), diffuserInner: rr(secondStage.diffuserInner) },
  ];
  const shaftRadius = rr(12.375), bladeCount = K.bladesPerStage;
  const backplateSegments = K.backplateSegments;
  for (const S of stages) {
    // Both stages' working blades extend beyond their unchanged rear disks.
    // The supported blade bottoms embed 0.15 mm into the corresponding disk.
    const rootFront = S.plate - S.heightIn, rootInner = S.eye * .69 - rr(.8);
    const rotor = [axisCylinder(S.shaftFront, S.shaftRear, shaftRadius, 64),
      axisCylinder(S.plate, S.back, S.radius, backplateSegments),
      solidLathe([[S.hubStart, shaftRadius * 1.15], [S.hubShoulder, S.eye * .69], [S.plate, S.eye]])];
    // The extended inner strips lie inside the original cone at their root,
    // then emerge exactly on its surface. They join along the full axial root
    // span rather than touching only the cone's downstream end.
    for (let i = 0; i < bladeCount; i++) rotor.push(radialVane(S.bladeInner, S.bladeOuter, i * tau / bladeCount,
      -.52, rr(2.6), 0, S.plate, t => lerp(S.heightIn, S.heightOut, t), rootInner));
    add(`compressor-rotor-${S.number}`, `第${S.number}级十八叶离心叶轮与后背盘`, 'front', steel,
      union(rotor), { ...metal, roughness: .21, clip: true, rotor: `compressor-${S.number}`, bladeCount,
        stage: S.number, backplate: true, shroud: false, backplateRadiusMm: S.radius, bladeTipRadiusMm: S.bladeOuter,
        bladeTipOverhangMm: S.bladeOuter - S.radius,
        backplateSegments, bladeRootAxialFrontMm: rootFront, bladeRootAxialRearMm: S.plate,
        bladeRootEmbeddingMm: rr(.8), bladeRootMount: 'continuous-conical-hub-and-backplate' });

    // Both static cover disks are also removed from the physical model.
    // Both diffuser rows sit aft of their respective rotor disks. Clip each
    // curved vane to the narrowing casing while keeping the inner passage open.
    const diffuser = [];
    for (let i = 0; i < 18; i++) diffuser.push(radialVane(S.diffuserInner, K.inner + .5,
      (i + .35) * tau / 18, .10, rr(2.1), S.diffuserStart, S.diffuserEnd).intersect(caseLumen));
    add(`compressor-diffuser-${S.number}`, `第${S.number}级十八扩压静叶`, 'front', vaneSteel,
      union(diffuser), { ...metal, roughness: .34, clip: true, stationary: true, bladeCount: 18, stage: S.number,
        axialFrontMm: S.diffuserStart, axialRearMm: S.diffuserEnd,
        axialGapBehindBackplateMm: S.diffuserStart - S.back });
  }

  // The complete eighteen-vane intermediate return assembly stays absent,
  // along with its former central diaphragm and the two stationary covers.

  // Restore the original first motor position and its three fine radial rods.
  // There are no inlet guide blades or interstage return guide blades.
  // These are packaging placeholders, not validated power-rated motor models.
  const motors = [{ number: 1, front: ax(484), rear: ax(510), support: ax(492) },
    { number: 2, front: ax(624), rear: ax(649), support: ax(634) }];
  const driveSector=(x0,x1,ri,ro,a,b)=>{
    const points=[],steps=8;
    for(let j=0;j<=steps;j++){const t=lerp(a,b,j/steps);points.push([-ro*Math.sin(t),ro*Math.cos(t)]);}
    for(let j=steps;j>=0;j--){const t=lerp(a,b,j/steps);points.push([-ri*Math.sin(t),ri*Math.cos(t)]);}
    return new CS([points]).extrude(x1-x0).rotate([0,90,0]).translate([x0,0,0]);
  };
  for (const D of motors) {
    const motorRadius = rr(33), bore = shaftRadius + .9;
    const capDepth=3*axialScale,bodyFront=D.front+capDepth,bodyRear=D.rear-capDepth;
    const at=(x,r,t)=>[x,r*Math.cos(t),r*Math.sin(t)];
    const body = axisCylinder(bodyFront,bodyRear,motorRadius,96)
      .subtract(axisCylinder(bodyFront-.1,bodyRear+.1,rr(30.7),96));
    const pieces = [body],caps=[],capCuts=[];
    // Hollow dark barrel, fine axial ribs and its existing three supports.
    for(let fin=0;fin<16;fin++) {
      const t=fin*tau/16;
      pieces.push(cylinder(at(bodyFront+1.5,motorRadius+.2,t),at(bodyRear-1.5,motorRadius+.2,t),rr(.7),rr(.7),12));
    }
    if(D.number===2)pieces.push(solidLathe([[D.rear+.025,motorRadius],[ax(662),.25]])
      .subtract(solidLathe([[D.rear-.1,rr(30.5)],[ax(662)-1.8,.1]])));
    for (let i = 0; i < 3; i++) {
      const angle = i * tau / 3;
      const p = r => [D.support, r * Math.cos(angle), r * Math.sin(angle)];
      pieces.push(cylinder(p(motorRadius - .5), p(K.inner + 1), rr(2.4), rr(2.4), 32).intersect(caseFree));
      }
    // Silver end caps carry real shaft bores, recessed bearing races and eight
    // integral screw heads with hex sockets. Their complete axial envelope stays
    // at the existing motor stations; no extra flow-blocking outer disk is added.
    for(const isFront of [true,false]){
      const lo=isFront?D.front:bodyRear,hi=isFront?bodyFront:D.rear;
      caps.push(axisCylinder(lo,hi,motorRadius+rr(1.4),96)
        .subtract(axisCylinder(lo-.1,hi+.1,bore,64)));
      const face=isFront?lo:hi,d=isFront?1:-1;
      const a=Math.min(face-.02*d,face+.42*d),b=Math.max(face-.02*d,face+.42*d);
      capCuts.push(axisCylinder(a,b,rr(18.1),96).subtract(axisCylinder(a-.1,b+.1,rr(17.3),96)));
      for(let j=0;j<8;j++){
        const theta=(j+.5)*tau/8,p=x=>at(x,rr(27.6),theta);
        const ca=Math.min(face-.02*d,face+.25*d),cb=Math.max(face-.02*d,face+.25*d);
        capCuts.push(cylinder(p(ca),p(cb),rr(1.35),rr(1.35),24)
          .subtract(cylinder(p(ca-.1),p(cb+.1),rr(1.08),rr(1.08),24)));
        const sa=Math.min(face-.03*d,face+.65*d),sb=Math.max(face-.03*d,face+.65*d);
        capCuts.push(cylinder(p(sa),p(sb),rr(.48),rr(.48),6));
      }
    }
    const turnFront=bodyFront+1.25,turnRear=bodyRear-1.25,steelFront=turnFront+1.4,steelRear=turnRear-1.4;
    const statorPieces=[axisCylinder(steelFront,steelRear,rr(30.4),96)
      .subtract(axisCylinder(steelFront-.1,steelRear+.1,rr(27.2),96))];
    const copper=[];
    const coilTube=(points,r)=>{
      const segments=[];
      for(let j=1;j<points.length;j++)segments.push(cylinder(points[j-1],points[j],r,r,12));
      for(const point of points.slice(1,-1))segments.push(M.sphere(r,12).translate(point));
      return union(segments);
    };
    for(let j=0;j<12;j++){
      const theta=j*tau/12,a=theta-8*Math.PI/180,b=theta+8*Math.PI/180;
      statorPieces.push(driveSector(steelFront,steelRear,rr(20.8),rr(27.3),theta-4*Math.PI/180,theta+4*Math.PI/180));
      const loop=[at(turnFront,rr(24),a),at(turnRear,rr(24),a)];
      for(let k=1;k<=6;k++)loop.push(at(turnRear,rr(24),lerp(a,b,k/6)));
      loop.push(at(turnFront,rr(24),b));
      for(let k=1;k<=6;k++)loop.push(at(turnFront,rr(24),lerp(b,a,k/6)));
      copper.push(coilTube(loop,rr(.85)));
    }
    const rotor=axisCylinder(bodyFront+.6,bodyRear-.6,rr(18.8),96)
      .subtract(axisCylinder(bodyFront+.5,bodyRear-.5,shaftRadius,64));
    // A small curved terminal seat and two short insulated leads stay tucked
    // against the barrel, clear of its three radial mounts and end caps.
    const terminalX=bodyFront+4,terminalAngle=Math.PI/3;
    const foot=driveSector(terminalX-3,terminalX+3,rr(32.8),rr(35.4),terminalAngle-.105,terminalAngle+.105);
    const terminals=[foot],terminalBores=[];
    for(const sign of [-1,1]){
      const t=terminalAngle+sign*.045,p=x=>at(x,rr(34.5),t);
      terminalBores.push(cylinder(p(terminalX-1),p(terminalX+3.1),rr(.72),rr(.72),20));
      terminals.push(cylinder(p(terminalX+2),p(bodyRear-1),rr(.55),rr(.55),16));
      terminals.push(cylinder(p(bodyRear-2),p(bodyRear-.2),rr(.9),rr(.9),20));
    }
    const terminalBody=foot.subtract(union(terminalBores));
    const terminalSolid=union([terminalBody,...terminals.slice(1)]);
    add(`compressor-motor-${D.number}`,`第${D.number}级独立电机 · 中空定子壳与散热筋`,'front','#394b58',
      union(pieces).subtract(foot),{...metal,clip:true,stationary:true,stage:D.number,motorSizing:'schematic-only',
        finish:'motor-stator-housing',supportCount:3,supportAxialCentreMm:D.support,inletGuideVaneCount:0});
    const details=[
      ['endcaps','银灰端盖、轴承座与内六角紧固件','#cbd6df',union(caps).subtract(union(capCuts)),'motor-machined-endcaps'],
      ['stator','叠片定子轭与齿','#59616a',union(statorPieces),'motor-laminated-steel'],
      ['windings','十二组铜色绕组','#b96d3e',union(copper),'motor-copper-windings'],
      ['rotor','中央转子环与短轴配合套','#9caebb',rotor,'motor-rotor-steel'],
      ['terminals','接线座与双短线束','#263039',terminalSolid,'motor-insulated-terminals'],
    ];
    for(const [suffix,label,color,solid,finish]of details)add(`compressor-drive-${D.number}-${suffix}`,
      `第${D.number}级电机 · ${label}`,'front',color,solid,{...metal,clip:true,stage:D.number,finish,motorSizing:'schematic-only'});
  }

  const flangeDepth = 3 * axialScale, flangeGap = .04;
  const flangeSlots = [], compressorScrews = [];
  for (const [i, x] of [K.front + axialScale, ax(619)].entries()) {
    const profile = Array.from({ length: 9 }, (_, j) => {
      const q = x + flangeDepth * j / 8, inner = innerAt(q);
      const wall = lerp(P.air.outer - P.air.inner, K.outer - K.inner,
        clamp((inner - P.air.inner) / (K.inner - P.air.inner), 0, 1));
      return [q, inner + wall];
    });
    const inside = profile.map(([q]) => [q, innerAt(q) + 1.2]);
    const flange = hollowLathe(profile, inside);
    const slotOutside = [[x - flangeGap, profile[0][1] + .1],
      ...profile.map(([q, r]) => [q, r + .1]), [x + flangeDepth + flangeGap, profile.at(-1)[1] + .1]];
    const slotInside = [[x - flangeGap, inside[0][1] - flangeGap],
      ...inside.map(([q, r]) => [q, r - flangeGap]), [x + flangeDepth + flangeGap, inside.at(-1)[1] - flangeGap]];
    flangeSlots.push(hollowLathe(slotOutside, slotInside));
    const headVoids = [];
    for (let j = 0; j < 12; j++) {
      const angle = (j + .5) * tau / 12, mid = x + flangeDepth / 2;
      const radius = profile[4][1], p = r => [mid, r * Math.cos(angle), r * Math.sin(angle)];
      compressorScrews.push(cylinder(p(radius - 2.6), p(radius - .2), .95, .95, 24)
        .subtract(cylinder(p(radius - .85), p(radius), .42, .42, 6)).intersect(flange));
      headVoids.push(cylinder(p(radius - 2.65), p(radius + .05), 1.02, 1.02, 24));
    }
    add(i === 0 ? 'compressor-front-flange' : 'compressor-rear-flange',
      i === 0 ? '压气机前装配法兰' : '第二级后装配法兰', 'compressorCase', paleSteel,
      flange.subtract(union(headVoids)), { ...metal, clip: true });
  }
  add('compressor-casing', '双级离心压气机渐缩机匣', 'compressorCase', C.compressorCase ?? '#b6a77c',
    casingWall.subtract(union(flangeSlots)),
    { metallic: .64, roughness: .31, finish: 'satin-champagne-metal', clip: true, stages: 2 });
  add('compressor-fasteners', '压气机装配法兰沉头紧固件', 'compressorCase', darkSteel,
    union(compressorScrews), { ...metal, clip: true });
  return { compressorStages: 2, compressorBladeCount: bladeCount, neckStart,
    casingCurve:'monotone C1 Hermite; contraction from inlet with no level intermediate lands',
    casingControlPoints:casingProfile.knots,casingTangents:casingProfile.tangents,
    casingContractionStartMm:casingProfile.contractionStart,
    casingBladeTipClearanceMm:casingProfile.bladeTipClearance,
    casingRotorEnvelopes:casingProfile.rotorEnvelopes,
    driveArchitecture: 'independent-front-and-rear-motors', motorSizing: 'schematic-only', casingInside, stages,
    removedDiscSurfaces: ['compressor-shroud-1', 'compressor-return-diaphragm', 'compressor-shroud-2'],
    restoredBackplates: stages.map(S => ({ stage: S.number, front: S.plate, rear: S.back,
      radius: S.radius, segments: backplateSegments })),
    returnVaneCount: 0, returnDiaphragmSupportCount: 0, inletGuideVaneCount: 0 };
}
