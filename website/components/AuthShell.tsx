import type {ReactNode} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {Check} from 'lucide-react';

export function AuthShell({title,copy,children}:{title:string;copy:string;children:ReactNode}){
  return <main className="auth-page">
    <section className="auth-art">
      <Link className="brand" href="/"><span><Image src="/veyra.png" width={34} height={34} alt=""/></span><b>Veyra</b><i>STUDIO</i></Link>
      <div>
        <span>BUILD BEYOND THE ORDINARY</span>
        <h1>A better room<br/>for your code.</h1>
        <p>One account for preview access, release updates and your future Veyra workspace sync.</p>
        <ul className="auth-perks">
          <li><Check size={14}/>Early access to new releases</li>
          <li><Check size={14}/>Your code never leaves your machine</li>
          <li><Check size={14}/>Free, open source, no credit card</li>
        </ul>
      </div>
      <small>Local-first · Open source · Developer controlled</small>
    </section>
    <section className="auth-panel">
      <div>
        <div className="auth-topbar">
          <Link className="brand auth-mobile-brand" href="/" aria-label="Veyra home"><span><Image src="/veyra.png" width={30} height={30} alt=""/></span><b>Veyra</b></Link>
          <Link className="auth-back" href="/">← Back to Veyra</Link>
        </div>
        <span>VEYRA ACCOUNT</span>
        <h2>{title}</h2>
        <p>{copy}</p>
        {children}
      </div>
    </section>
  </main>;
}
