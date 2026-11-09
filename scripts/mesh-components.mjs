/** Connected closed triangle components without allocating a WASM object per cell. */
export function meshComponents(mesh) {
  const stride=mesh.numProp,positions=mesh.vertProperties,triangles=mesh.triVerts;
  const count=positions.length/stride,parent=new Int32Array(count),rank=new Uint8Array(count);
  for(let i=0;i<count;i++)parent[i]=i;
  const find=i=>{let r=i;while(parent[r]!==r)r=parent[r];while(parent[i]!==i){const n=parent[i];parent[i]=r;i=n;}return r;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;};
  for(let i=0;i<triangles.length;i+=3){join(triangles[i],triangles[i+1]);join(triangles[i],triangles[i+2]);}
  const groups=new Map();
  for(let i=0;i<triangles.length;i+=3){
    const r=find(triangles[i]);
    if(!groups.has(r))groups.set(r,{triangles:[],volume:0,box:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}});
    const g=groups.get(r),ix=[triangles[i],triangles[i+1],triangles[i+2]],v=ix.map(k=>[positions[k*stride],positions[k*stride+1],positions[k*stride+2]]);
    g.triangles.push(...ix);
    for(const p of v)for(let a=0;a<3;a++){g.box.min[a]=Math.min(g.box.min[a],p[a]);g.box.max[a]=Math.max(g.box.max[a],p[a]);}
    const [a,b,c]=v;g.volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  return [...groups.values()];
}

export function selectMeshComponents(mesh, components) {
  const indexMap=new Int32Array(mesh.vertProperties.length/mesh.numProp).fill(-1),positions=[],triangles=[];
  for(const g of components)for(const oldIndex of g.triangles){
    if(indexMap[oldIndex]===-1){indexMap[oldIndex]=positions.length/3;for(let a=0;a<3;a++)positions.push(mesh.vertProperties[oldIndex*mesh.numProp+a]);}
    triangles.push(indexMap[oldIndex]);
  }
  return {numProp:3,vertProperties:new Float32Array(positions),triVerts:new Uint32Array(triangles)};
}
