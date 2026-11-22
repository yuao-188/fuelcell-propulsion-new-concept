/** Front fan duct and independent downstream cooling collectors. */
export function buildStraightShells(ctx, linerCutters = []) {
  const {P, M, union, cylinder, revolved, polar, add, sector} = ctx;
  const os=P.outerShell, R=os.radius, bore=R-os.wall, wall=P.interstage.wall;
  const penetrationCut=Array.isArray(linerCutters)
    ? (linerCutters.length?union(linerCutters):null) : linerCutters;
  const profile=[[os.front,R],[os.rear,R]];
  const smooth=t=>t*t*(3-2*t);
  const emit=(id,name,color,solid,finish='machined-aluminium')=>
    add(id,name,'outerShell',color,solid,{clip:true,metallic:.86,roughness:.32,finish});
  const ring=(a,b,outer,inner)=>revolved([[a,outer],[b,outer]],outer-inner);

  const flangeFront=os.rear-12;
  const flange=revolved([[flangeFront,R],[flangeFront+1,R+3],
    [flangeFront+6,R+17],[flangeFront+8,R+19],[os.rear,R+19]],x=>{
    if(x<=flangeFront+1)return R+(x-flangeFront)*3-bore;
    if(x<=flangeFront+6)return R+3+(x-flangeFront-1)*14/5-bore;
    return R+Math.min(19,17+x-flangeFront-6)-bore;
  });
  const holes=[];
  for(let i=0;i<24;i++){
    const a=7.5+15*i,r=R+12;
    holes.push(cylinder(polar(flangeFront-.1,r,a),polar(os.rear+.1,r,a),2.4,2.4,24));
  }
  emit('outer-shell-joint-flange','前涵道后端加强法兰','#bdc7ce',flange.subtract(union(holes)));

  const ears=[];
  for(const a of [80,280]){
    const foot=sector(306,344,R-2.6,R+4,a-3,a+3);
    const web=M.cube([7,32,14],true).translate([325,R+19,0]).rotate([a,0,0]);
    const eye=cylinder(polar(321.5,R+32,a),polar(328.5,R+32,a),12,12,48);
    const hole=cylinder(polar(321.3,R+32,a),polar(328.7,R+32,a),5,5,32);
    ears.push(union([foot,web,eye]).subtract(hole));
  }
  const mountingEars=union(ears);
  emit('outer-shell','银灰风扇涵道','#a8b4bc',
    ring(os.front+8,flangeFront,R,bore).subtract(mountingEars),'casing-satin');
  emit('outer-shell-rims','前进口精加工口沿','#d1d9de',ring(os.front,os.front+8,R,bore));
  emit('outer-shell-mounting-ears','前涵道双侧安装耳座','#aebbc4',mountingEars);

  const support=P.statorSupport;
  add('stator-support','后静叶短支承环','statorSupport','#95a5af',
    ring(support.front,support.rear,support.radius,support.inner),
    {clip:true,metallic:.81,roughness:.3});

  const guides=[], cavities=[];
  for(let k=0;k<P.stacks.length-1;k++) {
    const a=P.stacks[k],b=P.stacks[k+1],start=a.rear,end=b.front;
    const radius0=(a.rearOuter??a.outer)+wall,radius1=b.inner-P.interstage.linerClearance;
    const linerRear=(b.rearInner??b.inner)-P.interstage.linerClearance;
    const p=[[start,radius0]];
    for(let j=1;j<=32;j++) {
      const t=j/32;p.push([start+(end-start)*t,radius0+(radius1-radius0)*smooth(t)]);
    }
    // The isolated exhaust liner follows the downstream stack's actual conical
    // bore, retaining the specified radial clearance all along its axial length.
    p.push([b.rear,linerRear]);
    let solid=revolved(p,wall);
    if(penetrationCut)solid=solid.subtract(penetrationCut);
    add(`interstage-guide-${k+1}`,`第${k+1}级冷却排气收集罩与第${k+2}级中心隔离筒`,'interstageGuide','#73858e',solid,
      {clip:true,stage:k+2,metallic:.79,roughness:.3,finish:'satin-aluminium'});
    guides.push({from:k+1,to:k+2,front:start,contractionEnd:end,rear:b.rear,
      radialStart:radius0,radialEnd:radius1,linerRearRadius:linerRear,wall,axialGap:end-start,
      linerToCellsClearance:b.inner-radius1,rearLinerToCellsClearance:(b.rearInner??b.inner)-linerRear});
    cavities.push({front:end,rear:b.rear,innerRadius:Math.min(radius1,linerRear)-wall,
      frontInnerRadius:radius1-wall,rearInnerRadius:linerRear-wall});
  }
  const last=P.stacks.at(-1), finalProfile=[];
  const lastOuter=last.rearOuter??last.outer;
  for(let j=0;j<=40;j++) { const t=j/40; finalProfile.push([last.rear+P.interstage.tailGuideLength*t,lastOuter+wall+(140-lastOuter-wall)*smooth(t)]); }
  let final=revolved(finalProfile,wall);
  if(penetrationCut)final=final.subtract(penetrationCut);
  add('final-exhaust-guide','末级冷却排气收集尾罩','interstageGuide','#73858e',final,{clip:true,stage:P.stacks.length,metallic:.79,roughness:.3});
  return {profile,guides,cavities,removedOverallInnerShell:true,statorSupport:support,
    straightBore:2*bore,length:os.rear-os.front,rearFlange:[flangeFront,os.rear],
    fanTipClearance:os.radius-os.wall-P.fan.radius};
}
