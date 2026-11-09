import ManifoldModule from 'manifold-3d';
import {Matrix4,Vector3} from 'three';
import assert from 'node:assert/strict';
import {parameters as P,colors as C} from '../new-design/parameters.mjs';

export async function createKernel() {
  const api=await ManifoldModule();api.setup();
  const {Manifold:M,CrossSection:CS}=api, parts=[];
  const vec=a=>new Vector3(...a),union=a=>M.union(a);
  const polar=(x,r,degrees)=>[x,r*Math.cos(degrees*Math.PI/180),r*Math.sin(degrees*Math.PI/180)];
  const cylinder=(a,b,r,r2=r,n=32)=>{
    const z=vec(b).sub(vec(a)),length=z.length();assert(length>0);z.normalize();
    const x=(Math.abs(z.z)<.8?new Vector3(0,0,1):new Vector3(0,1,0)).cross(z).normalize(),y=z.clone().cross(x);
    const primitive=M.cylinder(length,r,r2,n);
    const result=primitive.transform(new Matrix4().makeBasis(x,y,z).setPosition(vec(a)).elements);primitive.delete();return result;
  };
  const tubePath=(points,r,extension=0)=>{
    const pp=points.map(p=>[...p]);
    if(extension){pp[0]=vec(pp[0]).add(vec(pp[0]).sub(vec(pp[1])).normalize().multiplyScalar(extension)).toArray();
      const j=pp.length-1;pp[j]=vec(pp[j]).add(vec(pp[j]).sub(vec(pp[j-1])).normalize().multiplyScalar(extension)).toArray();}
    const pieces=[];
    for(let i=1;i<pp.length;i++)pieces.push(cylinder(pp[i-1],pp[i],r));
    for(const point of pp.slice(1,-1)){const ball=M.sphere(r,24);pieces.push(ball.translate(point));ball.delete();}
    const result=union(pieces);pieces.forEach(p=>p.delete());return result;
  };
  const roundPath=(points,bend=14)=>{
    if(points.length<3)return points;
    const output=[points[0]];
    for(let i=1;i<points.length-1;i++){
      const p=vec(points[i]),prev=vec(points[i-1]),next=vec(points[i+1]);
      const length=Math.min(bend,p.distanceTo(prev)*.3,p.distanceTo(next)*.3);
      const a=p.clone().add(prev.sub(p).normalize().multiplyScalar(length)),b=p.clone().add(next.sub(p).normalize().multiplyScalar(length));
      output.push(a.toArray());
      for(let j=1;j<=8;j++){const t=j/8;output.push(a.clone().multiplyScalar((1-t)**2).add(p.clone().multiplyScalar(2*t*(1-t))).add(b.clone().multiplyScalar(t*t)).toArray());}
    }
    output.push(points.at(-1));return output;
  };
  const revolved=(profile,wall)=>{
    const cs=new CS([[...profile.map(([x,r])=>[r,x]),...profile.toReversed().map(([x,r])=>[r-(typeof wall==='function'?wall(x):wall),x])]]);
    const raw=cs.revolve(192),result=raw.rotate([0,90,0]);raw.delete();cs.delete();return result;
  };
  const sector=(front,rear,inner,outer,start,end)=>{
    const pts=[],count=Math.ceil((end-start)/1);
    for(let i=0;i<=count;i++){const a=(start+(end-start)*i/count)*Math.PI/180;pts.push([-outer*Math.sin(a),outer*Math.cos(a)]);}
    for(let i=count;i>=0;i--){const a=(start+(end-start)*i/count)*Math.PI/180;pts.push([-inner*Math.sin(a),inner*Math.cos(a)]);}
    const cs=new CS([pts]),ex=cs.extrude(rear-front),ro=ex.rotate([0,90,0]),result=ro.translate([front,0,0]);
    cs.delete();ex.delete();ro.delete();return result;
  };
  const add=(id,name,group,color,solid,extra={})=>{
    assert.equal(solid.status(),'NoError',id);assert(solid.volume()>.00001,`${id}: empty`);
    parts.push({id,name,group,color,solid,...extra});
  };
  return {api,M,CS,P,C,union,cylinder,tubePath,roundPath,revolved,sector,polar,add,parts};
}
