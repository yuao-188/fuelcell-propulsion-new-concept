import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

type Props = {
  viewMode: 'complete' | 'cutaway';
  cameraView: 'perspective' | 'side' | 'front';
  showOuterShell: boolean; showInnerShell: boolean; showStacks: boolean;
  showAir: boolean; showHydrogen: boolean; showReturn: boolean; resetKey: number;
};

export default function ModelViewport(props: Props) {
  const host=useRef<HTMLDivElement>(null), latest=useRef(props);
  const [status,setStatus]=useState('正在加载实体模型…');
  useEffect(()=>{latest.current=props;},[props]);
  useEffect(()=>{
    const element=host.current;
    if(!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); }
    catch { setStatus('三维显示无法启动，请启用浏览器硬件加速后刷新。'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1;
    renderer.localClippingEnabled=true;
    renderer.domElement.setAttribute('aria-label','燃料电池推进系统三维模型，可拖动旋转、滚轮缩放');
    element.appendChild(renderer.domElement);
    const scene=new THREE.Scene(); scene.background=new THREE.Color('#edf2f4');
    const camera=new THREE.PerspectiveCamera(32,1,1,15000);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true; controls.dampingFactor=.08;
    controls.minDistance=600; controls.maxDistance=7000;
    controls.target.set(650,0,0);
    const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
    const environment=pmrem.fromScene(room,.02); scene.environment=environment.texture; scene.environmentIntensity=.65; room.dispose();
    scene.add(new THREE.HemisphereLight('#ffffff','#637c8d',1.4));
    const key=new THREE.DirectionalLight('#ffffff',2); key.position.set(-500,1500,1600); scene.add(key);
    const fill=new THREE.DirectionalLight('#eff7ff',.8); fill.position.set(1500,300,-800); scene.add(fill);
    const grid=new THREE.GridHelper(2400,40,'#d7e0e5','#e0e7eb'); grid.position.set(650,-540,0); scene.add(grid);
    let root:THREE.Group|undefined, cancelled=false, frame=0, dirty=true;
    controls.addEventListener('change',()=>{dirty=true;});
    const meshes:THREE.Mesh[]=[];
    const clipping=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
    let priorReset=-1, priorCamera='', priorMode='', priorVisibility='';
    function fit() {
      const view=latest.current.cameraView;
      const direction=view==='side'?new THREE.Vector3(0,0,1):view==='front'?new THREE.Vector3(-1,0,0):new THREE.Vector3(-.27,.20,1).normalize();
      const target=new THREE.Vector3(675,0,0);
      controls.target.copy(target);
      const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize();
      const up=new THREE.Vector3().crossVectors(direction,right);
      const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;
      let distance=0;
      for(const x of [-110,1470]) for(const y of [-550,550]) for(const z of [-550,550]) {
        const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(direction);
        distance=Math.max(distance,depth+Math.abs(p.dot(right))/tanH,depth+Math.abs(p.dot(up))/tanV);
      }
      camera.position.copy(target).add(direction.multiplyScalar(distance*1.03));
      controls.update();dirty=true;
    }
    const disposeObject=(object:THREE.Object3D)=>object.traverse(item=>{
      const mesh=item as THREE.Mesh;
      mesh.geometry?.dispose();
      if(mesh.material) (Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>m.dispose());
    });
    new GLTFLoader().load(new URL('model.glb',document.baseURI).href,gltf=>{
      if(cancelled) { disposeObject(gltf.scene); return; }
      root=gltf.scene; scene.add(root);
      root.traverse(item=>{
        if(!(item instanceof THREE.Mesh)) return;
        meshes.push(item);
        const source=item.material as THREE.MeshStandardMaterial,material=source.clone(); item.material=material;
        if(item.userData.laminated) {
          material.onBeforeCompile=shader=>{
            shader.vertexShader='varying vec3 vLocalPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLocalPosition=position;');
            shader.fragmentShader='varying vec3 vLocalPosition;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
              float stripe=step(10.0,mod(length(vLocalPosition.yz),14.0));
              diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.54,0.58,0.61),stripe);`);
          };
          material.customProgramCacheKey=()=> 'laminated-stack-v1';
        }
      });
      setStatus(''); priorMode=''; priorVisibility=''; fit();
    },undefined,()=>{if(!cancelled)setStatus('模型加载失败，请刷新页面重试。');});
    const resize=()=>{
      const width=element.clientWidth,height=element.clientHeight;
      if(width<1||height<1)return;
      renderer.setSize(width,height,false); camera.aspect=width/height; camera.updateProjectionMatrix(); fit();
    };
    const observer=new ResizeObserver(resize); observer.observe(element); resize();
    const render=()=>{
      frame=requestAnimationFrame(render);
      const p=latest.current;
      if(priorReset!==p.resetKey||priorCamera!==p.cameraView) {fit();priorReset=p.resetKey;priorCamera=p.cameraView;}
      if(priorMode!==p.viewMode) {
        for(const mesh of meshes) {
          const material=mesh.material as THREE.MeshStandardMaterial;
          material.clippingPlanes=p.viewMode==='cutaway'&&(mesh.userData.clip||mesh.userData.laminated)?[clipping]:[];
          material.needsUpdate=true;
        }
        priorMode=p.viewMode;
        dirty=true;
      }
      const visibility=[p.showOuterShell,p.showInnerShell,p.showStacks,p.showAir,p.showHydrogen,p.showReturn].join();
      if(priorVisibility!==visibility) {
        const visible:Record<string,boolean>={outerShell:p.showOuterShell,innerShell:p.showInnerShell,stacks:p.showStacks,air:p.showAir,hydrogen:p.showHydrogen,return:p.showReturn,anodeInternal:p.showHydrogen||p.showReturn};
        meshes.forEach(mesh=>{mesh.visible=visible[mesh.userData.group]??true;});
        priorVisibility=visibility;
        dirty=true;
      }
      controls.update(); grid.visible=p.cameraView!=='front';
      if(dirty) {renderer.render(scene,camera);dirty=false;}
    };
    render();
    return()=>{
      cancelled=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();
      if(root)disposeObject(root);disposeObject(grid);environment.texture.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();
    };
  },[]);
  return <div className="model-viewport" style={{position:'relative'}}>
    <div ref={host} style={{position:'absolute',inset:0}} />
    {status&&<div role="status" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',zIndex:1,color:'#68808d',fontSize:13}}>{status}</div>}
  </div>;
}
