import {useRef,useState} from "react";
import {FilePlus2,FolderPlus,ChevronRight,CircleAlert,X} from "lucide-react";

type Props={directory:boolean;parent:string;project:string;onCreate:(path:string)=>Promise<void>;onClose:()=>void};
export function CreateEntryDialog({directory,parent,project,onCreate,onClose}:Props){
  const [name,setName]=useState("");
  const [error,setError]=useState("");
  const [working,setWorking]=useState(false);
  const submitting=useRef(false);
  const label=directory?"New folder":"New file";
  const path=[parent,name].filter(Boolean).join("/");
  const invalid=!name.trim()?"Enter a name to continue.":name.split("/").some(part=>!part.trim()||part==="."||part==="..")||/[\\\x00-\x1f]/.test(name)||name.startsWith("/")?"Use a relative name or path. Empty segments and dot segments (. or ..) are not allowed.":"";
  async function submit(){
    if(submitting.current)return;
    if(invalid){setError(invalid);return;}
    submitting.current=true;setWorking(true);setError("");
    try{await onCreate(path);onClose();}catch(e){setError(String(e));}
    finally{submitting.current=false;setWorking(false);}
  }
  return <div className="overlay creation-overlay" onKeyDown={e=>{if(e.key==="Escape"&&!working){e.stopPropagation();onClose();}}}>
    <form className="dialog creation-dialog" role="dialog" aria-modal="true" aria-labelledby="creation-title" onKeyDown={e=>{
      if(e.key!=="Tab")return;
      const controls=e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      const first=controls[0],last=controls[controls.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }} onSubmit={e=>{e.preventDefault();void submit();}}>
      <header><span className="creation-icon">{directory?<FolderPlus size={23}/>:<FilePlus2 size={23}/>}</span><div><small>BUILD YOUR WORKSPACE</small><h2 id="creation-title">{label}</h2></div><button type="button" title="Cancel creation" disabled={working} onClick={onClose}><X size={17}/></button></header>
      <div className="creation-location"><span>Create in</span><b>{project}</b><ChevronRight size={12}/><code>{parent||"Project root"}</code></div>
      <label className="creation-name">{directory?"Folder name":"File name"}<input autoFocus aria-label={label} autoComplete="off" spellCheck={false} value={name} disabled={working} placeholder={directory?"components/ui":"components/Button.tsx"} onChange={e=>{setName(e.target.value);setError("");}} aria-describedby="creation-help" aria-invalid={!!error}/></label>
      <p id="creation-help">Use / to create nested folders. Missing parent folders are created for you.</p>
      <div className="creation-preview"><span>DESTINATION</span><code>{project}/{path||"…"}{directory?"/":""}</code></div>
      {error&&<p className="creation-error" role="alert"><CircleAlert size={15}/>{error}</p>}
      <footer><small>Existing files are never overwritten.</small><button className="secondary" type="button" disabled={working} onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={working||!name.trim()}>{working?"Creating…":"Create"}</button></footer>
    </form>
  </div>;
}
