/** Straight nacelle, local exhaust collectors, no overall inner casing. */
export function buildStraightShells(ctx, linerCutters = []) {
  const {P, M, C, union, cylinder, revolved, polar, add} = ctx;
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
  const rims=union([envelope.intersect(axial(os.front,os.front+8,os.radius+2)),
    envelope.intersect(axial(os.rear-5,os.rear,os.radius+2))]);
  const cuts=[axial(os.front-.01,os.front+8.04,os.radius+2),axial(os.rear-5.04,os.rear+.01,os.radius+2)];
  const fasteners=[];
  for(const x of [30,650,1400,2024]) {
    cuts.push(revolved([[x-.45,radiusAt(x)+.05],[x+.45,radiusAt(x)+.05]],.8));
    for(let j=0;j<12;j++) {
      const theta=15+j*30,r=radiusAt(x+10),a=polar(x+10,r-2.6,theta),b=polar(x+10,r-.12,theta);
      const pocket=cylinder(polar(x+10,r-2.7,theta),polar(x+10,r+.1,theta),2.2,2.2,24);
      const head=cylinder(a,b,2.0,2.0,24).subtract(cylinder(polar(x+10,r-1,theta),polar(x+10,r+.2,theta),.85,.85,6));
      cuts.push(pocket);fasteners.push(head);
    }
  }
  add('outer-shell','直筒外机匣与轻收缩尾段','outerShell','#99a7b2',envelope.subtract(union(cuts)),
    {clip:true,metallic:.83,roughness:.32,finish:'satin-aluminium'});
  add('outer-shell-rims','进出口精加工口沿','outerShell','#c9d2d9',rims,{clip:true,metallic:.9,roughness:.23});
  add('outer-shell-fasteners','机匣分段接缝紧固件','outerShell','#65727c',union(fasteners),{clip:true,metallic:.85,roughness:.27});
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
  for(let j=0;j<=40;j++) { const t=j/40; finalProfile.push([last.rear+(2195-last.rear)*t,last.outer+wall+(140-last.outer-wall)*smooth(t)]); }
  let final=revolved(finalProfile,wall);
  if(penetrationCut)final=final.subtract(penetrationCut);
  add('final-exhaust-guide','末级冷却排气收集尾罩','interstageGuide','#73858e',final,{clip:true,stage:3,metallic:.79,roughness:.3});
  return {profile,guides,cavities,removedOverallInnerShell:true,statorSupport:support,
    straightBore:2*(os.radius-os.wall),exitBore:2*(os.outletRadius-os.wall),length:os.rear-os.front,
    fanTipClearance:os.radius-os.wall-P.fan.radius};
}
