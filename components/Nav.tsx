'use client';
import {useEffect,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Download,Menu,UserRound,X} from 'lucide-react';

const links=[
  {href:'/features',label:'Features'},
  {href:'/extensions',label:'Extensions'},
  {href:'/docs',label:'Docs'},
  {href:'/download',label:'Download'},
  {href:'/changelog',label:'Changelog'},
  {href:'https://github.com/fcopensource/veyraeditor',label:'GitHub',external:true},
];

export function Nav(){
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  const [signedIn,setSignedIn]=useState(false);
  useEffect(()=>{setSignedIn(document.cookie.split('; ').includes('veyra-signed-in=1'));},[pathname]);
  useEffect(()=>{setOpen(false);},[pathname]);
  useEffect(()=>{
    if(!open)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('keydown',close);document.body.classList.add('menu-open');
    return()=>{document.removeEventListener('keydown',close);document.body.classList.remove('menu-open');};
  },[open]);
  const current=(href:string)=>!href.includes('#')&&!href.startsWith('http')&&pathname===href;
  return <header className={'nav'+(open?' open':'')}>
    <Link className="brand" href="/" aria-label="Veyra Studio home"><span><Image src="/veyra.png" width={34} height={34} alt=""/></span><b>Veyra</b><i>STUDIO</i></Link>
    <nav aria-label="Main">{links.map(link=>link.external
      ?<a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
      :<Link key={link.href} href={link.href} aria-current={current(link.href)?'page':undefined}>{link.label}</Link>)}</nav>
    <div className="nav-actions">
      {signedIn
        ?<Link className="pill" href="/dashboard"><UserRound size={14}/>Account</Link>
        :<><Link className="ghost" href="/login">Log in</Link><Link className="pill" href="/register">Join the preview</Link></>}
    </div>
    <button className="nav-toggle" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={()=>setOpen(value=>!value)}>{open?<X size={20}/>:<Menu size={20}/>}</button>
    <div id="mobile-menu" className="mobile-menu" hidden={!open}>
      <nav aria-label="Mobile">{links.map(link=>link.external
        ?<a key={link.href} href={link.href} target="_blank" rel="noreferrer" onClick={()=>setOpen(false)}>{link.label}</a>
        :<Link key={link.href} href={link.href} onClick={()=>setOpen(false)} aria-current={current(link.href)?'page':undefined}>{link.label}</Link>)}</nav>
      <div className="mobile-actions">
        <Link className="primary" href="/download" onClick={()=>setOpen(false)}><Download size={16}/>Download Veyra</Link>
        {signedIn
          ?<Link className="secondary" href="/dashboard" onClick={()=>setOpen(false)}><UserRound size={16}/>My account</Link>
          :<div><Link className="secondary" href="/login" onClick={()=>setOpen(false)}>Log in</Link><Link className="secondary" href="/register" onClick={()=>setOpen(false)}>Create account</Link></div>}
      </div>
    </div>
  </header>;
}
