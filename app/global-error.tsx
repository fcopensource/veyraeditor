'use client';
import {useEffect} from 'react';

/** Last-resort error screen (when the root layout itself fails). Self-contained: no layout, fonts or CSS imports. */
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  const stale=/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(`${error.name} ${error.message}`);
  useEffect(()=>{
    console.error(error);
    if(stale){try{if(!sessionStorage.getItem('veyra-reloaded')){sessionStorage.setItem('veyra-reloaded','1');location.reload();}}catch{/* storage blocked */}}
  },[error,stale]);
  return <html lang="en"><body style={{margin:0,minHeight:'100vh',display:'grid',placeItems:'center',background:'#06080d',color:'#edf5f5',fontFamily:'system-ui,sans-serif',textAlign:'center',padding:24}}>
    <div>
      <p style={{color:'#68f4d1',letterSpacing:2,fontSize:11}}>VEYRA</p>
      <h1 style={{fontSize:36,margin:'12px 0'}}>Something went wrong.</h1>
      <p style={{color:'#84919f'}}>{stale?'The website was just updated. Reload to continue.':'Please reload the page.'}</p>
      <button onClick={()=>stale?location.reload():reset()} style={{marginTop:16,padding:'12px 20px',border:0,borderRadius:10,background:'#68f4d1',color:'#06100d',fontWeight:700,cursor:'pointer'}}>Reload</button>
    </div>
  </body></html>;
}
