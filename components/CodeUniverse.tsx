'use client';
import {useEffect,useRef} from 'react';
import * as THREE from 'three';

/* Hero scene: code tokens warp toward the viewer, a holographic Veyra editor types real code,
   and particle streams carry "ideas" into it. Pauses off-screen; static under reduced motion. */

const MINT='#68f4d1',CYAN='#4cdcf2',VIOLET='#b79bff',CORAL='#ff8f87',GOLD='#f3c66b',MUTED='#5f6c7b',TEXT='#d8e4ee';
const TOKENS:[string,string][]=[
  ['async',VIOLET],['await',VIOLET],['const',VIOLET],['fn',VIOLET],['impl',VIOLET],['return',VIOLET],['import',VIOLET],['match',VIOLET],['struct',VIOLET],['export',VIOLET],
  ['=>',CORAL],['{ }',CORAL],['===',CORAL],['&&',CORAL],['</>',CORAL],['::',CORAL],
  ['"local-first"',MINT],['"✓ passed"',MINT],["'feat: ship'",MINT],
  ['useEffect()',CYAN],['.then()',CYAN],['map()',CYAN],['commit()',CYAN],['review()',CYAN],['Result<T>',CYAN],['Option<T>',CYAN],['<Veyra/>',CYAN],
  ['git push',GOLD],['npm run dev',GOLD],['cargo build',GOLD],['ollama run',GOLD],['42',GOLD],['0x2A',GOLD],
  ['// TODO: ship it',MUTED],['// reviewed ✓',MUTED],
];

type Seg=[string,string];
// The program the holographic editor types. Line 4's tail is an AI suggestion accepted with Tab.
const PROGRAM:Seg[][]=[
  [['import ',VIOLET],['{ veyra } ',TEXT],['from ',VIOLET],['"@veyra/studio"',MINT],[';',TEXT]],
  [],
  [['export async function ',VIOLET],['ship',CYAN],['(idea: ',TEXT],['Idea',GOLD],[') {',TEXT]],
  [['  const ',VIOLET],['plan ',TEXT],['= await ',VIOLET],['veyra.ai.',TEXT],['plan',CYAN],['(idea);',TEXT]],
  [['  const ',VIOLET],['patch ',TEXT],['= await ',VIOLET],['plan.',TEXT],['write',CYAN],['({ review: ',TEXT],['true',GOLD],[' });',TEXT]],
  [['  await ',VIOLET],['git.',TEXT],['commit',CYAN],['(patch, ',TEXT],['"feat: "',MINT],[' + idea.name);',TEXT]],
  [['  return ',VIOLET],['deploy',CYAN],['(patch);',TEXT],['  // ✓ 42 tests passed',MUTED]],
  [['}',TEXT]],
];
const GHOST_LINE=4,GHOST_AT=13; // characters typed by hand on line 5 before the AI completes it

function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
const lineText=(line:Seg[])=>line.map(s=>s[0]).join('');

/** Draws the editor window for a given typing progress (characters typed across the program). */
function drawEditor(ctx:CanvasRenderingContext2D,typed:number,phase:'typing'|'ghost'|'done',caretOn:boolean,mono:string){
  const W=ctx.canvas.width,H=ctx.canvas.height;
  ctx.clearRect(0,0,W,H);
  rounded(ctx,6,6,W-12,H-12,26);
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'rgba(18,25,36,0.94)');bg.addColorStop(1,'rgba(9,13,20,0.94)');
  ctx.fillStyle=bg;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='rgba(104,244,209,0.35)';ctx.stroke();
  // Title bar
  ctx.fillStyle='rgba(255,255,255,0.04)';ctx.fillRect(8,8,W-16,52);
  ['#ff5f57','#febc2e','#28c840'].forEach((c,i)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(40+i*24,34,7,0,Math.PI*2);ctx.fill();});
  ctx.font=`500 20px ${mono}`;ctx.fillStyle='#9aa7b4';ctx.textAlign='center';ctx.fillText('ship.ts — Veyra Studio',W/2,41);ctx.textAlign='left';
  ctx.fillStyle=MINT;ctx.fillText('✦ AI',W-90,41);
  // Code
  const top=104,lh=46,left=118;let start=0,caret=null as {x:number,y:number}|null;
  const count=Math.floor(typed);
  ctx.font=`500 25px ${mono}`;
  PROGRAM.forEach((line,i)=>{
    const y=top+i*lh,full=lineText(line).length,lineStart=start;start+=full;
    const show=Math.max(0,Math.min(full,count-lineStart)),reached=count>=lineStart;
    ctx.fillStyle=reached?'#6d7c8c':'#36414e';ctx.textAlign='right';ctx.fillText(String(i+1),left-34,y);ctx.textAlign='left';
    if(show>0){ctx.fillStyle=MINT;ctx.fillRect(left-20,y-28,5,lh-8);} // git "added" gutter marker
    let x=left,left2=show;
    for(const [text,color] of line){
      if(left2<=0)break;
      const part=text.slice(0,left2);ctx.fillStyle=color;ctx.fillText(part,x,y);x+=ctx.measureText(part).width;left2-=part.length;
    }
    if(i===GHOST_LINE&&phase==='ghost'){ // ghost suggestion, then accepted with Tab
      const rest=lineText(line).slice(GHOST_AT);ctx.fillStyle='rgba(183,155,255,0.45)';ctx.fillText(rest,x,y);
      const w=ctx.measureText(rest).width;rounded(ctx,x+w+16,y-26,92,34,8);ctx.fillStyle='rgba(183,155,255,0.18)';ctx.fill();ctx.fillStyle=VIOLET;ctx.font=`600 18px ${mono}`;ctx.fillText('Tab ↹',x+w+28,y-3);ctx.font=`500 25px ${mono}`;
    }
    if(!caret&&reached&&count<lineStart+full)caret={x,y};
  });
  if(phase!=='done'&&caret&&caretOn){ctx.fillStyle=MINT;ctx.fillRect(caret.x+2,caret.y-26,3,32);}
  // Status bar
  const sy=H-58;ctx.fillStyle=phase==='done'?'rgba(104,244,209,0.16)':'rgba(255,255,255,0.04)';ctx.fillRect(8,sy,W-16,50);
  ctx.font=`500 19px ${mono}`;ctx.fillStyle='#9aa7b4';ctx.fillText('⎇ main ↑1',34,sy+32);
  ctx.fillStyle=phase==='done'?MINT:'#9aa7b4';
  ctx.fillText(phase==='done'?'✓ 42 tests passed · ready to ship':phase==='ghost'?'✦ Veyra AI suggestion':'● typing…',220,sy+32);
  ctx.fillStyle='#6d7c8c';ctx.textAlign='right';ctx.fillText('TypeScript  ♥ 98',W-34,sy+32);ctx.textAlign='left';
}

function tokenTexture(text:string,color:string,mono:string){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d')!;ctx.font=`500 58px ${mono}`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor=color;ctx.shadowBlur=24;ctx.fillStyle=color;ctx.fillText(text,256,64);ctx.shadowBlur=0;ctx.fillText(text,256,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return {texture,aspect:Math.min(4,Math.max(1.2,ctx.measureText(text).width/56))};
}

export function CodeUniverse(){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const element=host.current;if(!element)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mono='"DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const small=innerWidth<700; // phones: lighter scene for smooth scrolling and battery
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch{return;} // no WebGL: CSS backdrop remains
    renderer.setPixelRatio(Math.min(devicePixelRatio,small?1.5:1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;element.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x06080d,0.034);
    const camera=new THREE.PerspectiveCamera(46,1,.1,120);camera.position.set(0,0,10);

    // 1. Token warp field
    const field=new THREE.Group();scene.add(field);
    const textures=TOKENS.map(([text,color])=>({...tokenTexture(text,color,mono)}));
    const sprites=Array.from({length:small?40:90},(_,i)=>{
      const {texture,aspect}=textures[i%textures.length];
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.85,fog:true}));
      const angle=Math.random()*Math.PI*2,radius=3.2+Math.random()*10;
      sprite.position.set(Math.cos(angle)*radius*1.35,Math.sin(angle)*radius*.7,-Math.random()*60);
      const size=.32+Math.random()*.38;sprite.scale.set(size*aspect,size,1);
      sprite.userData.speed=2.2+Math.random()*3.2;field.add(sprite);return sprite;
    });

    // 2. Holographic editor that types code
    const editorCanvas=document.createElement('canvas');editorCanvas.width=1024;editorCanvas.height=560;
    const editorCtx=editorCanvas.getContext('2d')!;
    const editorTexture=new THREE.CanvasTexture(editorCanvas);editorTexture.colorSpace=THREE.SRGBColorSpace;editorTexture.anisotropy=8;
    const panel=new THREE.Group();scene.add(panel);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(5.6,3.06),new THREE.MeshBasicMaterial({map:editorTexture,transparent:true,depthWrite:false}));panel.add(screen);
    const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=256;const g=glowCanvas.getContext('2d')!;const radial=g.createRadialGradient(128,128,0,128,128,128);radial.addColorStop(0,'rgba(80,239,217,0.55)');radial.addColorStop(.45,'rgba(110,120,255,0.18)');radial.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=radial;g.fillRect(0,0,256,256);
    const glowTexture=new THREE.CanvasTexture(glowCanvas);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(10,7),new THREE.MeshBasicMaterial({map:glowTexture,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));glow.position.z=-.35;panel.add(glow);
    const frame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(5.75,3.2)),new THREE.LineBasicMaterial({color:0x68f4d1,transparent:true,opacity:.35}));frame.position.z=-.02;panel.add(frame);

    // 3. Particle streams spiralling into the editor
    const COUNT=small?500:1400,positions=new Float32Array(COUNT*3),colors=new Float32Array(COUNT*3),seeds=new Float32Array(COUNT*3);
    const palette=[new THREE.Color(MINT),new THREE.Color(VIOLET),new THREE.Color(CYAN)];
    for(let i=0;i<COUNT;i++){seeds[i*3]=Math.random();seeds[i*3+1]=Math.random()*Math.PI*2;seeds[i*3+2]=.6+Math.random()*1.8;const c=palette[i%3];colors.set([c.r,c.g,c.b],i*3);}
    const streamGeometry=new THREE.BufferGeometry();streamGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));streamGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const stream=new THREE.Points(streamGeometry,new THREE.PointsMaterial({size:.05,vertexColors:true,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));scene.add(stream);

    // 4. Moving grid floor
    const grid=new THREE.GridHelper(120,90,0x2bd5bc,0x1d3346);const gridMaterial=grid.material as THREE.Material;gridMaterial.transparent=true;gridMaterial.opacity=.22;grid.position.y=-4.2;scene.add(grid);

    // Layout: editor beside the copy on wide screens, behind it on narrow ones.
    let wide=true;
    const resize=()=>{const w=element.clientWidth,h=element.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();wide=camera.aspect>1.15;
      panel.position.set(wide?3.1:0,wide?.05:-1.6,wide?0:-3.5);panel.scale.setScalar(wide?Math.min(1,camera.aspect/1.9):.8);(screen.material as THREE.MeshBasicMaterial).opacity=wide?1:.35;};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();

    // Typing timeline
    const total=PROGRAM.reduce((n,l)=>n+lineText(l).length,0);
    const ghostIndex=PROGRAM.slice(0,GHOST_LINE).reduce((n,l)=>n+lineText(l).length,0)+GHOST_AT;
    const ghostRestLength=lineText(PROGRAM[GHOST_LINE]).length-GHOST_AT;
    let typed=0,phase:'typing'|'ghost'|'done'='typing',phaseTime=0,lastDraw='';
    const fontReady=(document as Document&{fonts?:FontFaceSet}).fonts?.ready;
    const redraw=(caretOn:boolean)=>{const key=typed+phase+caretOn;if(key===lastDraw)return;lastDraw=key;drawEditor(editorCtx,typed,phase,caretOn,mono);editorTexture.needsUpdate=true;};
    if(reduced){typed=total;phase='done';}
    // Canvas text uses DM Mono once the web font has loaded; repaint the editor and tokens then.
    let disposed=false;
    redraw(true);fontReady?.then(()=>{if(disposed)return;lastDraw='';redraw(true);textures.forEach((t,i)=>{const fresh=tokenTexture(TOKENS[i][0],TOKENS[i][1],mono);t.texture.image=fresh.texture.image;t.texture.needsUpdate=true;fresh.texture.dispose();});if(reduced)renderer.render(scene,camera);});

    let pointerX=0,pointerY=0,scroll=0,visible=true,raf=0,last=performance.now();
    const move=(e:PointerEvent)=>{pointerX=e.clientX/innerWidth-.5;pointerY=e.clientY/innerHeight-.5;};
    const onScroll=()=>{scroll=Math.min(1,scrollY/Math.max(1,element.clientHeight));};
    addEventListener('pointermove',move);addEventListener('scroll',onScroll,{passive:true});
    const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible&&!raf){last=performance.now();raf=requestAnimationFrame(tick);}});io.observe(element);

    function tick(now:number){
      raf=0;if(!visible||document.hidden){return;}
      const dt=Math.min(.05,(now-last)/1000);last=now;const t=now/1000;
      if(!reduced){
        for(const s of sprites){s.position.z+=s.userData.speed*dt;if(s.position.z>camera.position.z+1){s.position.z=-60;}}
        grid.position.z=(t*1.6)%(120/90);
        // Typing state machine
        phaseTime+=dt;
        if(phase==='typing'){const target=Math.min(total,typed+dt*24);typed=typed<ghostIndex&&target>=ghostIndex?ghostIndex:target;if(typed===ghostIndex&&typed<total){phase='ghost';phaseTime=0;}else if(typed>=total&&phaseTime>.2){phase='done';phaseTime=0;}}
        else if(phase==='ghost'&&phaseTime>1.3){typed=ghostIndex+ghostRestLength;phase='typing';phaseTime=0;}
        else if(phase==='done'&&phaseTime>3.6){typed=0;phase='typing';phaseTime=0;}
        redraw(Math.floor(t*2.2)%2===0);
      }
      // Particles: spiral from the depths into the editor
      const target=panel.position;
      for(let i=0;i<COUNT;i++){
        const p=(seeds[i*3]+t*.054*seeds[i*3+2])%1,a=seeds[i*3+1]+p*6.0,r=(1-p)*(5+seeds[i*3+2]*2);
        positions[i*3]=target.x+Math.cos(a)*r;positions[i*3+1]=target.y+Math.sin(a)*r*.55;positions[i*3+2]=target.z-28*(1-p)*(1-p);
      }
      streamGeometry.attributes.position.needsUpdate=true;
      // Pointer parallax + scroll dolly
      camera.position.x+=(pointerX*1.4-camera.position.x)*.04;camera.position.y+=(-pointerY*.9-scroll*1.5-camera.position.y)*.04;camera.position.z=10-scroll*2.5;
      camera.lookAt(0,-scroll*.8,-6);
      panel.rotation.y+=((wide?-.32:0)+pointerX*.35-panel.rotation.y)*.05;panel.rotation.x+=(pointerY*.2+.04-panel.rotation.x)*.05;
      panel.position.y+=Math.sin(t*1.1)*.0015;
      renderer.render(scene,camera);
      if(!reduced)raf=requestAnimationFrame(tick);
    }
    const onVisibility=()=>{if(!document.hidden&&visible&&!raf){last=performance.now();raf=requestAnimationFrame(tick);}};document.addEventListener('visibilitychange',onVisibility);
    raf=requestAnimationFrame(tick);
    return()=>{disposed=true;cancelAnimationFrame(raf);io.disconnect();observer.disconnect();removeEventListener('pointermove',move);removeEventListener('scroll',onScroll);document.removeEventListener('visibilitychange',onVisibility);
      textures.forEach(t=>t.texture.dispose());editorTexture.dispose();glowTexture.dispose();
      scene.traverse(o=>{const m=o as THREE.Mesh;m.geometry?.dispose?.();const mats=Array.isArray(m.material)?m.material:m.material?[m.material]:[];mats.forEach(x=>x.dispose());});
      renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div className="code-universe" ref={host} aria-hidden="true"/>;
}
