import Link from 'next/link';
import {ArrowLeft,Download} from 'lucide-react';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';

export default function NotFound(){
  return <><Nav/><main className="page-shell not-found">
    <code>404 · ENOENT</code>
    <h1>This page doesn't exist.</h1>
    <p>The link may be out of date, or the page has moved.</p>
    <div><Link className="primary" href="/"><ArrowLeft size={16}/>Back home</Link><Link className="secondary" href="/download"><Download size={16}/>Download Veyra</Link></div>
  </main><Footer/></>;
}
