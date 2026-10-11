'use client';
import {useEffect} from 'react';
import Link from 'next/link';
import {Home,RotateCw} from 'lucide-react';

/** After a redeploy, a page that was already open asks for script files that no longer exist. */
const isStaleBuild=(error:Error)=>/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error.name} ${error.message}`);

/** Replaces Next.js's bare "Application error" screen: recovers automatically from stale builds, otherwise offers a retry. */
export default function PageError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{
    console.error(error);
    if(isStaleBuild(error)){
      // Reload once to pick up the new build; a flag prevents a reload loop.
      try{if(!sessionStorage.getItem('veyra-reloaded')){sessionStorage.setItem('veyra-reloaded','1');location.reload();}}catch{/* storage blocked */}
    }
  },[error]);
  return <main className="page-shell error-shell">
    <div className="page-head">
      <span>SOMETHING WENT WRONG</span>
      <h1>This page hit a snag.</h1>
      <p>{isStaleBuild(error)?'The website was just updated. Reloading usually fixes it.':'Please try again. If it keeps happening, let us know on GitHub.'}{error.digest?<><br/><small>Reference: {error.digest}</small></>:null}</p>
      <div className="error-actions">
        <button className="primary" onClick={()=>isStaleBuild(error)?location.reload():reset()}><RotateCw size={16}/>Try again</button>
        <Link className="secondary" href="/"><Home size={16}/>Home</Link>
      </div>
    </div>
  </main>;
}
