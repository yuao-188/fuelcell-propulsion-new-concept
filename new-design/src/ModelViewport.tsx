import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createEngineeringMaterials } from './materials';

type Props = {
  viewMode: 'complete' | 'cutaway'; sectionDepth: number;
  cameraView: 'perspective' | 'side' | 'front' | 'fan' | 'machinery' | 'stacks' | 'cells' | 'water';
  showOuterShell: boolean; showInnerShell: boolean; showStacks: boolean;
  showIntake: boolean; showIntakeInner: boolean; showCompressorCase: boolean;
  showAir: boolean; showHydrogen: boolean; showReturn: boolean;
  showCathodeWater: boolean; showAnodeSeparator: boolean; showWiring: boolean; resetKey: number;
};

export default function ModelViewport(props: Props) {
  const host=useRef<HTMLDivElement>(null), latest=useRef(props);
  const [status,setStatus]=useState('正在加载精细实体模型…');
  useEffect(()=>{latest.current=props;},[props]);
  useEffect(()=>{
    const element=host.current;
    if(!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,stencil:true}); }
    catch { setStatus('三维显示无法启动，请启用浏览器硬件加速后刷新。'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=.96;
    renderer.localClippingEnabled=true;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label','燃料电池推进系统三维模型，可拖动旋转、滚轮缩放');
    element.appendChild(renderer.domElement);
    const scene=new THREE.Scene(); scene.background=new THREE.Color('#e9eef1');
    const finishes=createEngineeringMaterials(renderer);
    const camera=new THREE.PerspectiveCamera(30,1,1,18000);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true; controls.dampingFactor=.09;
    controls.minDistance=180; controls.maxDistance=9000;
    controls.target.set(1000,0,0);

    // Bright strips and dark flags describe curvature through reflection. A
    // broad, uniformly bright environment would flatten metal into plastic.
    const studio=new THREE.Scene(); studio.background=new THREE.Color('#56616a');
    const cardGeometry=new THREE.BoxGeometry(1,1,1);
    const cardMaterials:THREE.MeshBasicMaterial[]=[];
    const card=(position:number[],scale:number[],intensity:number)=>{
      const material=new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity)});
      cardMaterials.push(material);
      const mesh=new THREE.Mesh(cardGeometry,material);
      mesh.position.fromArray(position);mesh.scale.fromArray(scale);studio.add(mesh);
    };
    card([0,6,1],[16,.1,4],3.8);
    card([-6,2,3],[.1,6,11],2.6);
    card([2,1.4,7],[13,1.2,.1],3);
    card([0,-1.6,6],[16,2.5,.1],.14);
    card([5,3,-6],[7,4,.1],1.7);
    card([0,-6,0],[16,.1,12],.16);
    const pmrem=new THREE.PMREMGenerator(renderer);
    const environment=pmrem.fromScene(studio,.04);
    scene.environment=environment.texture;scene.environmentIntensity=.95;
    cardGeometry.dispose();cardMaterials.forEach(m=>m.dispose());
    scene.add(new THREE.HemisphereLight('#edf5ff','#57636e',.38));
    const key=new THREE.DirectionalLight('#fff5e6',2.15);
    key.position.set(100,1800,1400);key.target.position.set(1000,0,0);
    key.castShadow=true;key.shadow.mapSize.set(2048,2048);
    Object.assign(key.shadow.camera,{left:-1600,right:1600,top:1150,bottom:-1150,near:50,far:5000});
    key.shadow.bias=-.0005;key.shadow.normalBias=1.1;key.shadow.radius=3;
    scene.add(key,key.target);
    const fill=new THREE.DirectionalLight('#cbdfea',.58);fill.position.set(1900,500,-1300);fill.target.position.set(1000,0,0);scene.add(fill,fill.target);
    const rim=new THREE.DirectionalLight('#f0f6ff',1.05);rim.position.set(1800,1500,-1100);rim.target.position.set(1000,0,0);scene.add(rim,rim.target);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),new THREE.ShadowMaterial({color:'#344656',opacity:.18}));
    floor.rotation.x=-Math.PI/2;floor.position.set(1000,-520,0);floor.receiveShadow=true;scene.add(floor);
    const grid=new THREE.GridHelper(3600,48,'#c6d2d9','#d8e0e5');grid.position.set(1000,-522,0);
    (grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.25;scene.add(grid);

    let root:THREE.Group|undefined,cancelled=false,frame=0,dirty=true;
    controls.addEventListener('change',()=>{dirty=true;});
    const meshes:THREE.Mesh[]=[];
    const clipping=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
    const sections:{source:THREE.Mesh; stencil:THREE.Group; cap:THREE.Mesh}[]=[];
    const capGeometry=new THREE.PlaneGeometry(2200,1200);
    let priorReset=-1,priorCamera='',priorMode='',priorDepth=-1,priorVisibility='';
    function fit() {
      const view=latest.current.cameraView;
      const direction=view==='side'?new THREE.Vector3(0,0,1):view==='front'?new THREE.Vector3(-1,0,0):view==='fan'?new THREE.Vector3(-1,.17,.5).normalize():view==='machinery'?new THREE.Vector3(.2,.18,1).normalize():view==='cells'?new THREE.Vector3(-1,.28,.9).normalize():view==='water'?new THREE.Vector3(.25,.2,1).normalize():new THREE.Vector3(-.52,.30,1).normalize();
      let box=view==='fan'?[[40,220],[-505,505],[-505,505]]:view==='machinery'?[[205,705],[-180,180],[-180,180]]:view==='stacks'?[[680,1780],[-340,340],[-340,340]]:view==='cells'?[[680,910],[90,240],[-140,35]]:view==='water'?[[1480,1900],[-180,100],[-120,220]]:[[-12,2030],[-525,525],[-525,525]];
      if(view==='water') {
        const waterBounds=new THREE.Box3();
        meshes.filter(mesh=>['cathodeSeparator','anodeSeparator'].includes(mesh.userData.group))
          .forEach(mesh=>waterBounds.expandByObject(mesh));
        if(!waterBounds.isEmpty()) {
          waterBounds.expandByScalar(45);
          box=['x','y','z'].map(axis=>[waterBounds.min[axis as 'x'|'y'|'z'],waterBounds.max[axis as 'x'|'y'|'z']]);
        }
      }
      const target=new THREE.Vector3(...box.map(range=>(range[0]+range[1])/2) as [number,number,number]);controls.target.copy(target);
      const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
      const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;
      let distance=0;
      for(const x of box[0]) for(const y of box[1]) for(const z of box[2]) {
        const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(direction);
        distance=Math.max(distance,depth+Math.abs(p.dot(right))/tanH,depth+Math.abs(p.dot(up))/tanV);
      }
      camera.position.copy(target).add(direction.multiplyScalar(distance*1.015));controls.update();dirty=true;
    }
    const disposeObject=(object:THREE.Object3D)=>object.traverse(item=>{
      const mesh=item as THREE.Mesh;mesh.geometry?.dispose();
      if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>m.dispose());
    });
    function addSection(mesh:THREE.Mesh,index:number) {
      // Winding stencils use actual closed solids, preserving pipe and ring bores.
      const stencil=new THREE.Group();
      const base=new THREE.MeshBasicMaterial({depthWrite:false,depthTest:false,colorWrite:false,stencilWrite:true,stencilFunc:THREE.AlwaysStencilFunc,clippingPlanes:[clipping]});
      // Material.clone() clones Plane instances as well. Both stencil passes
      // must use the live plane or moving the slider leaves a stale zero slice.
      const back=base.clone();back.side=THREE.BackSide;back.clippingPlanes=[clipping];
      back.stencilFail=back.stencilZFail=back.stencilZPass=THREE.IncrementWrapStencilOp;
      const front=base.clone();front.side=THREE.FrontSide;front.clippingPlanes=[clipping];
      front.stencilFail=front.stencilZFail=front.stencilZPass=THREE.DecrementWrapStencilOp;
      [back,front].forEach((material,i)=>{const m=new THREE.Mesh(mesh.geometry,material);m.renderOrder=index*4+i+1;stencil.add(m);});base.dispose();
      const source=mesh.material as THREE.MeshStandardMaterial;
      const material=finishes.section(source,mesh.userData);
      const cap=new THREE.Mesh(capGeometry,material);cap.position.set(1006,0,0);cap.renderOrder=index*4+3;
      cap.onAfterRender=()=>renderer.clearStencil();
      scene.add(stencil,cap);sections.push({source:mesh,stencil,cap});
    }
    const modelUrl=new URL('model.glb?v=20261023-radial-cells-twin-compressor-1',document.baseURI);
    const modelRequest=new AbortController();
    const loadFailed=()=>{if(!cancelled)setStatus('模型加载失败，请刷新页面重试。');};
    // Read the binary directly. FileLoader's rewrapped progress stream can
    // report ERR_ABORTED in Chromium even after delivering the complete GLB.
    fetch(modelUrl,{signal:modelRequest.signal}).then(response=>{
      if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(data=>{
      if(cancelled)return;
      new GLTFLoader().parse(data,new URL('.',modelUrl).href,gltf=>{
      if(cancelled){disposeObject(gltf.scene);return;}
      root=gltf.scene;scene.add(root);
      root.traverse(item=>{
        if(!(item instanceof THREE.Mesh))return;
        meshes.push(item);item.renderOrder=1000;item.castShadow=true;item.receiveShadow=true;
        const source=item.material as THREE.MeshStandardMaterial;
        item.material=finishes.create(source,item.userData);
        if(item.userData.clip)addSection(item,sections.length);
      });
      setStatus('');priorMode='';priorDepth=-1;priorVisibility='';fit();
      },loadFailed);
    }).catch(loadFailed);
    const resize=()=>{
      const width=element.clientWidth,height=element.clientHeight;if(width<1||height<1)return;
      renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();fit();
    };
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    const render=()=>{
      frame=requestAnimationFrame(render);const p=latest.current;
      if(priorReset!==p.resetKey||priorCamera!==p.cameraView){fit();priorReset=p.resetKey;priorCamera=p.cameraView;}
      if(priorMode!==p.viewMode||priorDepth!==p.sectionDepth){
        clipping.constant=530*(1-2*p.sectionDepth/100);
        for(const {source,cap} of sections){
          const material=source.material as THREE.MeshStandardMaterial;
          if(priorMode!==p.viewMode){material.clippingPlanes=p.viewMode==='cutaway'?[clipping]:[];material.needsUpdate=true;}
          cap.position.z=clipping.constant;
        }
        priorMode=p.viewMode;priorDepth=p.sectionDepth;dirty=true;
      }
      const visibility=[p.showOuterShell,p.showInnerShell,p.showStacks,p.showAir,p.showHydrogen,p.showReturn,p.showIntake,p.showIntakeInner,p.showCompressorCase,p.showCathodeWater,p.showAnodeSeparator,p.showWiring].join();
      if(priorVisibility!==visibility){
        const visible:Record<string,boolean>={outerShell:p.showOuterShell,innerShell:p.showInnerShell,intakeOuter:p.showIntake,intakeInner:p.showIntakeInner,compressorCase:p.showCompressorCase,stacks:p.showStacks,air:p.showAir,hydrogen:p.showHydrogen,return:p.showReturn,anodeInternal:p.showHydrogen||p.showReturn,cathodeExhaust:p.showCathodeWater,cathodeSeparator:p.showCathodeWater,cathodeDrain:p.showCathodeWater,anodeSeparator:p.showAnodeSeparator,anodeDrain:p.showAnodeSeparator,wiring:p.showWiring};
        meshes.forEach(mesh=>{mesh.visible=visible[mesh.userData.group]??true;});priorVisibility=visibility;dirty=true;
      }
      for(const {source,stencil,cap} of sections){
        if(!source.geometry.boundingBox)source.geometry.computeBoundingBox();
        const bounds=source.geometry.boundingBox!;
        stencil.visible=cap.visible=source.visible&&p.viewMode==='cutaway'&&clipping.constant>bounds.min.z&&clipping.constant<bounds.max.z;
      }
      controls.update();grid.visible=floor.visible=p.cameraView!=='front';
      if(dirty){renderer.render(scene,camera);dirty=false;}
    };render();
    return()=>{
      cancelled=true;modelRequest.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();
      if(root)disposeObject(root);
      sections.forEach(({stencil,cap})=>{stencil.children.forEach(o=>((o as THREE.Mesh).material as THREE.Material).dispose());(cap.material as THREE.Material).dispose();});
      capGeometry.dispose();disposeObject(grid);disposeObject(floor);finishes.dispose();environment.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();
    };
  },[]);
  return <div className="model-viewport" style={{position:'relative'}}>
    <div ref={host} style={{position:'absolute',inset:0}} />
    {status&&<div role="status" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',zIndex:1,color:'#68808d',fontSize:13}}>{status}</div>}
  </div>;
}
