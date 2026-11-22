'use client';
import {useState} from 'react';
import {Check,Copy} from 'lucide-react';

/** A shell command with a copy button. */
export function CopyCommand({command,label}:{command:string;label?:string}){
  const [copied,setCopied]=useState(false);
  const copy=async()=>{
    try{await navigator.clipboard.writeText(command);setCopied(true);setTimeout(()=>setCopied(false),1600);}catch{/* the text is selectable anyway */}
  };
  return <div className="snap-cmd">
    <code><span aria-hidden="true">$</span>{command}</code>
    <button type="button" onClick={copy} aria-label={label||`Copy: ${command}`}>{copied?<Check size={15}/>:<Copy size={15}/>}<span>{copied?'Copied':'Copy'}</span></button>
  </div>;
}
