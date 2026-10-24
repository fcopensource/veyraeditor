import Link from 'next/link';
import {Sparkles} from 'lucide-react';
import {EXTENSIONS,related} from '@/lib/products';

/** "More for VS Code: …" under an extension's FAQ: related extensions picked from lib/products.ts, so new ones show up by themselves. */
export function MoreExtensions({current}:{current:string}){
  const picks=related(current,4);
  return <p className="live-more"><Sparkles size={14}/>More for VS Code: {picks.map((p,i)=><span key={p.href}>{i?(i===picks.length-1?' and ':', '):''}<Link href={p.href}>{p.title}</Link></span>)}. Or browse <Link href="/extensions#made-by-veyra">all {EXTENSIONS.length} Veyra extensions</Link>.</p>;
}
