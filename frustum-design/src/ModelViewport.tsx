import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createEngineeringMaterials } from './materials';
// Shared with the offline solid builder; these JavaScript modules are the
// single source for dimensions and moving inlet surfaces.
// @ts-expect-error The repository shares an untyped ES module with its builder.
import { parameters as P } from '../parameters.mjs';
// @ts-expect-error The same deterministic solver is used in the GLB builder.
import { getIntakeGeometry, getIntakeKinematics } from '../intake-kinematics.mjs';

export type CameraView = 'perspective' | 'side' | 'front' | 'fan' | 'machinery' | 'compressor' | 'stacks' | 'cells' | 'water' | 'intake2' | 'intake3';
export type IntakePose = { opening: number; pitchDeg: number; yawDeg: number };
type IntakeGeometry = { id: string; positions: ArrayLike<number>; indices: ArrayLike<number> };

type Props = {
  viewMode: 'complete' | 'cutaway'; sectionDepth: number;
  cameraView: CameraView;
  compressorView: 'passage' | 'rotors';
  showOuterShell: boolean; showVariableIntake: boolean; showInterstageGuide: boolean; showStacks: boolean;
  showIntake: boolean; showIntakeInner: boolean; showCompressorCase: boolean;
  showAir: boolean; showHydrogen: boolean; showReturn: boolean;
  showCathodeWater: boolean; showAnodeSeparator: boolean; showWiring: boolean; resetKey: number;
  intake2: IntakePose; intake3: IntakePose;
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
    // Thin illustrative interlayers need enough screen samples even on a
    // standard-density desktop display; cap resolution remains bounded.
    renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio,2),2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=.96;
    renderer.localClippingEnabled=true;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label','凸台电堆方案三维模型，可拖动旋转、滚轮缩放');
    element.appendChild(renderer.domElement);
    // Labels point to physical components and move with the camera. They do
    // not create another solid or cover the real flow-passage geometry.
    const svgNS='http://www.w3.org/2000/svg';
    const callouts=document.createElementNS(svgNS,'svg');
    callouts.setAttribute('class','compressor-callouts');callouts.setAttribute('aria-hidden','true');
    element.appendChild(callouts);
    const compressorX=(x:number)=>P.compressor.front+(x-480)*(P.compressor.outlet-P.compressor.front)/210;
    const anchors:[string,number[],number,boolean][]=[
      ['一级驱动电机',[compressorX(497),24,-16],.24,false],
      ['一级离心叶轮',[compressorX(536.638),99.8717715,-14.3679942],.40,false],
      ['一级扩压静叶',[compressorX(559.5),151.548,-32.53],.56,false],
      ['一级背盘',[compressorX(546.5),100,-18],.72,false],
      ['二级驱动电机',[compressorX(636.5),24,-16],.24,true],
      ['二级离心叶轮',[compressorX(601.584),76.428834,-8.627901],.40,true],
      ['二级扩压静叶',[compressorX(624),122.831,-28.079],.56,true],
      ['二级背盘',[compressorX(613.5),80,-15],.72,true],
    ];
    const calloutItems=anchors.map(([label,point,row,rightSide])=>{
      const group=document.createElementNS(svgNS,'g'), line=document.createElementNS(svgNS,'polyline');
      const dot=document.createElementNS(svgNS,'circle'), text=document.createElementNS(svgNS,'text');
      text.textContent=label;dot.setAttribute('r','2.3');group.append(line,dot,text);callouts.append(group);
      return {point:new THREE.Vector3(...point),row,rightSide,group,line,dot,text};
    });
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
    const variableMeshes = new Map<number, Map<string, THREE.Mesh>>();
    const priorIntake = new Map<number, string>();
    // Start from the confirmed core envelope, then replace it with the loaded
    // assembly bounds so raised flanges, lugs and service pipes stay in frame.
    const modelBounds=new THREE.Box3(
      new THREE.Vector3(Math.min(P.outerShell.front,P.fan.spinnerFront),-P.outerShell.radius,-P.outerShell.radius),
      new THREE.Vector3(P.outerShell.rear,P.outerShell.radius,P.outerShell.radius));
    const clipping=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
    const sections:{source:THREE.Mesh; stencil:THREE.Group; cap:THREE.Mesh}[]=[];
    const sectionLength=P.outerShell.rear-P.outerShell.front+220;
    const sectionCenter=(P.outerShell.front+P.outerShell.rear)/2;
    let capGeometry=new THREE.PlaneGeometry(sectionLength,P.outerShell.radius*2+160);
    let priorReset=-1,priorCamera='',priorMode='',priorDepth=-1,priorVisibility='';
    const inletFraming=(stage:number)=>{
      const inlet=getIntakeKinematics(P,stage,{opening:1,pitchDeg:0,yawDeg:0});
      const S=P.stacks[stage-1];
      return {front:inlet.lipCenter[0]-35,rear:S.front+100,
        radius:Math.max(S.outer+30,inlet.conservativeEnvelopeRadius)+12};
    };
    function fit() {
      const view=latest.current.cameraView;
      const intakeStage=view==='intake2'?2:view==='intake3'?3:0;
      const direction=view==='side'?new THREE.Vector3(0,0,1):view==='front'?new THREE.Vector3(-1,0,0):view==='fan'?new THREE.Vector3(-1,.17,.5).normalize():view==='compressor'?(latest.current.compressorView==='rotors'?new THREE.Vector3(-1,.25,1.6).normalize():new THREE.Vector3(-.08,.08,1).normalize()):intakeStage?new THREE.Vector3(-.34,.25,1).normalize():view==='machinery'?new THREE.Vector3(.2,.18,1).normalize():view==='cells'?new THREE.Vector3(-.65,.3,1).normalize():view==='water'?new THREE.Vector3(.25,.2,1).normalize():new THREE.Vector3(-.52,.30,1).normalize();
      const first=P.stacks[0],last=P.stacks[P.stacks.length-1],r=last.outer+35;
      let box=view==='fan'?[[Math.min(-10,P.fan.spinnerFront-10),P.fan.rear+20],[-P.fan.radius-15,P.fan.radius+15],[-P.fan.radius-15,P.fan.radius+15]]:view==='compressor'?[[P.compressor.front-15,P.compressor.outlet+15],[-185,230],[-180,180]]:view==='machinery'?[[P.motorHousing.front-5,P.compressor.outlet+15],[-190,190],[-190,190]]:view==='stacks'?[[first.front-20,last.rear+20],[-r,r],[-r,r]]:view==='cells'?[[first.front-20,first.rear+20],[-first.outer-20,first.outer+20],[-first.outer-20,first.outer+20]]:view==='water'?[[last.rear+5,P.outerShell.rear-15],[-120,120],[-120,120]]:[[modelBounds.min.x-18,modelBounds.max.x+18],[modelBounds.min.y-20,modelBounds.max.y+20],[modelBounds.min.z-20,modelBounds.max.z+20]];
      if(intakeStage) {
        // Include the complete inlet from the preceding stack's midpoint to
        // this stack: articulated lip, long duct and downstream attachment.
        const inlet=inletFraming(intakeStage);
        box=[[inlet.front,inlet.rear],[-inlet.radius,inlet.radius],[-inlet.radius,inlet.radius]];
      }
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
      const frameMargin=view==='compressor'&&element!.clientWidth<700?1.2:1.015;
      camera.position.copy(target).add(direction.multiplyScalar(distance*frameMargin));controls.update();dirty=true;
    }
    const disposeObject=(object:THREE.Object3D)=>object.traverse(item=>{
      const mesh=item as THREE.Mesh;mesh.geometry?.dispose();
      if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>m.dispose());
    });
    function addSection(mesh:THREE.Mesh,index:number) {
      // Winding stencils use actual closed solids, preserving pipe and ring bores.
      const stencil=new THREE.Group();stencil.matrixAutoUpdate=false;
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
      const cap=new THREE.Mesh(capGeometry,material);cap.position.set(sectionCenter,0,0);cap.renderOrder=index*4+3;
      cap.onAfterRender=()=>renderer.clearStencil();
      scene.add(stencil,cap);sections.push({source:mesh,stencil,cap});
    }
    function updateIntake(stage:number,pose:IntakePose) {
      const stageMeshes=variableMeshes.get(stage);
      if(!stageMeshes?.size)return;
      const key=`${pose.opening}/${pose.pitchDeg}/${pose.yawDeg}`;
      if(priorIntake.get(stage)===key)return;
      const shape=getIntakeGeometry(P,stage,pose) as IntakeGeometry[];
      for(const part of shape) {
        const source=stageMeshes.get(part.id);
        if(!source)continue;
        // Preserve the same closed-surface topology as the offline builder.
        // Replacing geometry also replaces BOTH winding-stencil geometries;
        // otherwise the material cap would remain at the previous inlet pose.
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(part.positions),3));
        geometry.setIndex(Array.from(part.indices));
        geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
        const previous=source.geometry;source.geometry=geometry;
        for(const section of sections)if(section.source===source) {
          section.stencil.children.forEach(child=>{(child as THREE.Mesh).geometry=geometry;});
        }
        previous.dispose();
      }
      priorIntake.set(stage,key);dirty=true;
    }
    // Read-only numerical snapshots are enabled only for the local QA URL.
    // They prove each control changes the rendered buffers independently.
    const qaWindow=window as unknown as { __frustumDesignQA?: { snapshot: () => unknown } };
    const qaAccess={snapshot:()=>({
      version:'20261109-frustum-copy',loaded:Boolean(root),
      schematicStacks:meshes.filter(mesh=>/^stack-\d+-1$/.test(String(mesh.userData.id))).length,
      stackArrangement:P.stackAppearance.arrangement,countIsIllustrative:true,
      groups:meshes.reduce((result,mesh)=>{const group=String(mesh.userData.group);result[group]=(result[group]||0)+1;return result;},{} as Record<string,number>),
      intakes:Object.fromEntries([2,3].map(stage=>{
        const parts=[...(variableMeshes.get(stage)?.values()??[])].map(mesh=>{
          const position=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
          const words=new Uint32Array(position.array.buffer,position.array.byteOffset,position.array.byteLength/4);
          let hash=2166136261;
          for(const word of words)hash=Math.imul(hash^word,16777619)>>>0;
          const section=sections.find(candidate=>candidate.source===mesh);
          const bounds=mesh.geometry.boundingBox!;
          return {id:mesh.userData.id,vertices:position.count,hash:hash.toString(16),
            bounds:[bounds.min.toArray(),bounds.max.toArray()],
            stencilMatches:Boolean(section)&&section!.stencil.children.every(child=>(child as THREE.Mesh).geometry===mesh.geometry)};
        });
        return [stage,{appliedPose:priorIntake.get(stage),parts}];
      })),
    })};
    if(new URLSearchParams(location.search).get('qa')==='1')qaWindow.__frustumDesignQA=qaAccess;
    const modelUrl=new URL('model.glb?v=20261109-frustum-copy',document.baseURI);
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
        meshes.push(item);item.renderOrder=100000;item.castShadow=true;item.receiveShadow=true;
        const source=item.material as THREE.MeshStandardMaterial;
        item.material=finishes.create(source,item.userData);
        if(item.userData.clip)addSection(item,sections.length);
        const variableStage=Number(item.userData.variableStage);
        if(variableStage===2||variableStage===3) {
          if(!variableMeshes.has(variableStage))variableMeshes.set(variableStage,new Map());
          variableMeshes.get(variableStage)!.set(String(item.userData.id),item);
        }
      });
      root.updateMatrixWorld(true);
      updateIntake(2,latest.current.intake2);updateIntake(3,latest.current.intake3);
      modelBounds.setFromObject(root);
      const assemblySize=modelBounds.getSize(new THREE.Vector3()),assemblyCenter=modelBounds.getCenter(new THREE.Vector3());
      const oldCapGeometry=capGeometry;
      capGeometry=new THREE.PlaneGeometry(assemblySize.x+160,assemblySize.y+160);
      for(const {cap} of sections) {
        cap.geometry=capGeometry;cap.position.x=assemblyCenter.x;cap.position.y=assemblyCenter.y;
      }
      oldCapGeometry.dispose();
      floor.position.set(assemblyCenter.x,modelBounds.min.y-12,0);
      grid.position.set(assemblyCenter.x,modelBounds.min.y-14,0);
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
      updateIntake(2,p.intake2);updateIntake(3,p.intake3);
      const cameraKey=`${p.cameraView}:${p.compressorView}`;
      const isolated=p.cameraView==='compressor', rotors=isolated&&p.compressorView==='rotors';
      const stackDetail=p.cameraView==='cells';
      const intakeStage=p.cameraView==='intake2'?2:p.cameraView==='intake3'?3:0;
      const modeKey=`${p.viewMode}:${isolated}:${rotors}:${intakeStage}:${stackDetail}`;
      const cut=p.viewMode==='cutaway'&&!rotors;
      if(priorReset!==p.resetKey||priorCamera!==cameraKey){fit();priorReset=p.resetKey;priorCamera=cameraKey;}
      if(priorMode!==modeKey||priorDepth!==p.sectionDepth){
        const assemblyClipRadius=Math.max(Math.abs(modelBounds.min.z),Math.abs(modelBounds.max.z))+2;
        clipping.constant=(isolated?180:intakeStage?inletFraming(intakeStage).radius:stackDetail?P.stacks[0].outer+2:assemblyClipRadius)*(1-2*p.sectionDepth/100);
        for(const {source,cap} of sections){
          const material=source.material as THREE.MeshStandardMaterial;
          if(priorMode!==modeKey){material.clippingPlanes=cut?[clipping]:[];material.needsUpdate=true;}
          cap.position.z=clipping.constant;
        }
        priorMode=modeKey;priorDepth=p.sectionDepth;dirty=true;
      }
      const visibility=[isolated,rotors,intakeStage,stackDetail,p.showOuterShell,p.showVariableIntake,p.showInterstageGuide,p.showStacks,p.showAir,p.showHydrogen,p.showReturn,p.showIntake,p.showIntakeInner,p.showCompressorCase,p.showCathodeWater,p.showAnodeSeparator,p.showWiring].join();
      if(priorVisibility!==visibility){
        const visible:Record<string,boolean>={outerShell:p.showOuterShell,variableIntake:p.showVariableIntake,interstageGuide:p.showInterstageGuide,intakeOuter:p.showIntake,intakeInner:p.showIntakeInner,compressorCase:p.showCompressorCase,stacks:p.showStacks,air:p.showAir,hydrogen:p.showHydrogen,return:p.showReturn,anodeInternal:p.showHydrogen||p.showReturn,cathodeExhaust:p.showCathodeWater,cathodeSeparator:p.showCathodeWater,cathodeDrain:p.showCathodeWater,anodeSeparator:p.showAnodeSeparator,anodeDrain:p.showAnodeSeparator,wiring:p.showWiring};
        meshes.forEach(mesh=>{
          const id=String(mesh.userData.id??'');
          if(isolated) {
            mesh.visible=id.startsWith('compressor-') && !(rotors && mesh.userData.group==='compressorCase');
          } else if(stackDetail) {
            mesh.visible=mesh.userData.group==='stacks'&&Number(mesh.userData.stage)===1&&p.showStacks;
          } else if(intakeStage) {
            const group=String(mesh.userData.group),stage=Number(mesh.userData.stage);
            mesh.visible=(group==='variableIntake'&&Number(mesh.userData.variableStage)===intakeStage&&p.showVariableIntake)
              ||(group==='stacks'&&(stage===intakeStage||stage===intakeStage-1)&&p.showStacks)
              ||(group==='interstageGuide'&&stage===intakeStage&&id!=='final-exhaust-guide'&&p.showInterstageGuide);
          } else mesh.visible=visible[mesh.userData.group]??true;
        });priorVisibility=visibility;dirty=true;
      }
      for(const {source,stencil,cap} of sections){
        if(!source.geometry.boundingBox)source.geometry.computeBoundingBox();
        source.updateWorldMatrix(true,false);
        stencil.matrix.copy(source.matrixWorld);stencil.matrixWorldNeedsUpdate=true;
        const bounds=source.geometry.boundingBox!.clone().applyMatrix4(source.matrixWorld);
        stencil.visible=cap.visible=source.visible&&cut&&clipping.constant>bounds.min.z&&clipping.constant<bounds.max.z;
      }
      controls.update();grid.visible=floor.visible=p.cameraView!=='front'&&!isolated&&!intakeStage&&!stackDetail;
      if(dirty){
        renderer.render(scene,camera);
        callouts.style.display=isolated?'block':'none';
        if(isolated) {
          const w=element.clientWidth,h=element.clientHeight;
          callouts.setAttribute('viewBox',`0 0 ${w} ${h}`);
          for(const label of calloutItems) {
            const projected=label.point.clone().project(camera),x=(projected.x+1)*w/2,y=(1-projected.y)*h/2;
            const edge=label.rightSide?w-18:18,baseline=label.row*h;
            const end=label.rightSide?w-130:130;
            label.group.style.display=(projected.z>1||projected.z< -1||cut&&label.point.z>clipping.constant)?'none':'';
            label.line.setAttribute('points',`${x},${y} ${end},${baseline+5} ${edge},${baseline+5}`);
            label.dot.setAttribute('cx',String(x));label.dot.setAttribute('cy',String(y));
            label.text.setAttribute('x',String(edge));label.text.setAttribute('y',String(baseline));
            label.text.setAttribute('text-anchor',label.rightSide?'end':'start');
          }
        }
        dirty=false;
      }
    };render();
    return()=>{
      if(qaWindow.__frustumDesignQA===qaAccess)delete qaWindow.__frustumDesignQA;
      cancelled=true;modelRequest.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();
      if(root)disposeObject(root);
      sections.forEach(({stencil,cap})=>{stencil.children.forEach(o=>((o as THREE.Mesh).material as THREE.Material).dispose());(cap.material as THREE.Material).dispose();});
      capGeometry.dispose();disposeObject(grid);disposeObject(floor);finishes.dispose();environment.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();callouts.remove();
    };
  },[]);
  return <div className="model-viewport" style={{position:'relative'}}>
    <div ref={host} style={{position:'absolute',inset:0}} />
    {status&&<div role="status" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',zIndex:1,color:'#68808d',fontSize:13}}>{status}</div>}
  </div>;
}
