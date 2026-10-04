'use client';
import {useEffect,useRef} from 'react';
import * as THREE from 'three';

export function VeyraScene(){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const element=host.current;if(!element)return;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(0,0,7.4);
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;element.appendChild(renderer.domElement);
    const group=new THREE.Group();scene.add(group);
    const colors=[0x58f5df,0x6a7cff,0xff5f9f];
    const curves=colors.map((color,index)=>{
      const points:Array<THREE.Vector3>=[];
      for(let i=0;i<160;i++){const t=i/159*Math.PI*2;const phase=index*Math.PI*2/3;points.push(new THREE.Vector3(Math.cos(t+phase)*2.05,Math.sin(t*2+phase)*.8,Math.sin(t+phase)*.72));}
      const curve=new THREE.CatmullRomCurve3(points,true,'catmullrom',.45);
      const geometry=new THREE.TubeGeometry(curve,220,.12-index*.018,10,true);
      const material=new THREE.MeshPhysicalMaterial({color,roughness:.22,metalness:.14,transmission:.12,emissive:color,emissiveIntensity:.32,transparent:true,opacity:.86});
      const mesh=new THREE.Mesh(geometry,material);group.add(mesh);return mesh;
    });
    const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.48,2),new THREE.MeshPhysicalMaterial({color:0xeafcff,emissive:0x62ffe3,emissiveIntensity:.85,roughness:.12,metalness:.25,transparent:true,opacity:.88}));group.add(core);
    scene.add(new THREE.AmbientLight(0xffffff,1.4));const light=new THREE.PointLight(0x75ffe7,18,18);light.position.set(2,2,4);scene.add(light);
    let pointerX=0,pointerY=0,frame=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const move=(event:PointerEvent)=>{const rect=element.getBoundingClientRect();pointerX=(event.clientX-rect.left)/rect.width-.5;pointerY=(event.clientY-rect.top)/rect.height-.5;};element.addEventListener('pointermove',move);
    const resize=()=>{const width=element.clientWidth,height=element.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(element);resize();
    const render=(time=0)=>{group.rotation.y+=(pointerX*.5-group.rotation.y)*.035;group.rotation.x+=(-pointerY*.32-group.rotation.x)*.035;if(!reduced){group.rotation.z=Math.sin(time*.00022)*.08;curves.forEach((mesh,index)=>mesh.rotation.y=Math.sin(time*.00035+index)*.08);core.rotation.x=time*.00032;core.rotation.y=time*.00045;}renderer.render(scene,camera);frame=requestAnimationFrame(render);};render();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();element.removeEventListener('pointermove',move);renderer.dispose();scene.traverse(item=>{if(item instanceof THREE.Mesh){item.geometry.dispose();const materials=Array.isArray(item.material)?item.material:[item.material];materials.forEach(material=>material.dispose());}});renderer.domElement.remove();};
  },[]);
  return <div className="veyra-scene" ref={host} aria-hidden="true"/>;
}
