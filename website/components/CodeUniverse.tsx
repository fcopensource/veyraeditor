'use client';
import {useEffect,useRef} from 'react';

/* The three.js hero is loaded only after the page has painted and the browser is idle, so it never
   delays the headline, the buttons or the first tap (Largest Contentful Paint / Total Blocking Time). */
export function CodeUniverse(){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    // Phones and data-saver users get the static gradient backdrop: same look, no WebGL cost.
    const connection=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection;
    if(matchMedia('(max-width: 700px)').matches||connection?.saveData)return;
    let cleanup:(()=>void)|undefined,cancelled=false;
    const start=()=>{void import('./codeUniverseScene').then(({mountCodeUniverse})=>{if(!cancelled&&host.current){cleanup=mountCodeUniverse(host.current);host.current.classList.add('ready');}});};
    const idle=window as Window&{requestIdleCallback?:(cb:()=>void,opts?:{timeout:number})=>number;cancelIdleCallback?:(id:number)=>void};
    const handle=idle.requestIdleCallback?idle.requestIdleCallback(start,{timeout:2500}):window.setTimeout(start,1200);
    return()=>{cancelled=true;if(idle.cancelIdleCallback)idle.cancelIdleCallback(handle);else clearTimeout(handle);cleanup?.();};
  },[]);
  return <div className="code-universe" ref={host} aria-hidden="true"/>;
}
