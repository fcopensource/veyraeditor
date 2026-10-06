import {useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {Archive,ArchiveRestore,ArrowDown,ArrowUp,Check,ChevronDown,ChevronRight,CloudDownload,Download,ExternalLink,GitBranch,GitBranchPlus,GitCommitHorizontal,GitFork,History,Minus,Network,Plus,RefreshCw,RefreshCcw,RotateCcw,Upload} from 'lucide-react';
import {DimensionalIcon} from './DimensionalIcon';
import {keys} from './platform';
type Change={path:string;index:string;worktree:string};
type Branch={name:string;current:boolean;upstream:string};
type GithubInfo={available:boolean;authenticated:boolean;login:string;name:string;avatar:string;repository:string;url:string;visibility:string;default_branch:string};
type Props={status:string;activePath:string;refresh:()=>Promise<void>;openDiff:(path:string)=>Promise<void>;report:(error:unknown)=>void;onWorkspaceChanged:()=>void;notify:(message:string)=>void};
const emptyGithub:GithubInfo={available:true,authenticated:false,login:'',name:'',avatar:'',repository:'',url:'',visibility:'',default_branch:''};

/** Parse `## main...origin/main [ahead 1, behind 2]` from `git status --short --branch`. */
export function parseBranch(header:string){
  const line=header.startsWith('## ')?header.slice(3):'';
  const name=line.replace(/^No commits yet on /,'').replace(/^Initial commit on /,'').split('...')[0].split(' [')[0].trim();
  return {name:name||'',upstream:line.includes('...')?line.split('...')[1].split(' ')[0]:'',ahead:+(line.match(/ahead (\d+)/)?.[1]||0),behind:+(line.match(/behind (\d+)/)?.[1]||0)};
}

export function SourceControl({status,activePath,refresh,openDiff,report,onWorkspaceChanged,notify}:Props){
  const [message,setMessage]=useState('');const [amend,setAmend]=useState(false);
  const [history,setHistory]=useState('');const [graph,setGraph]=useState('');const [github,setGithub]=useState<GithubInfo>(emptyGithub);
  const [busy,setBusy]=useState('');const [graphOpen,setGraphOpen]=useState(true);const [discard,setDiscard]=useState('');
  const [branches,setBranches]=useState<Branch[]>([]);const [branchMenu,setBranchMenu]=useState(false);const [newBranch,setNewBranch]=useState('');
  const [stashes,setStashes]=useState<string[]>([]);const [fileHistory,setFileHistory]=useState('');const [historyOpen,setHistoryOpen]=useState(true);
  const menu=useRef<HTMLDivElement>(null);
  const lines=status.split('\n').filter(Boolean);
  const header=lines[0]?.startsWith('## ')?lines.shift()!:'';
  const info=parseBranch(header);const branch=header?info.name||'HEAD':'No repository';
  const changes=useMemo<Change[]>(()=>lines.filter(line=>line.length>=3).map(line=>({index:line[0],worktree:line[1],path:line.slice(3).replace(/^"|"$/g,'').split(' -> ').at(-1)!})),[status]);
  const staged=changes.filter(item=>item.index!==' '&&item.index!=='?');const unstaged=changes.filter(item=>item.worktree!==' '||item.index==='?');
  const tracked=unstaged.filter(item=>item.index!=='?');

  async function loadDetails(){
    const [log,graphData,account,branchList,stashList]=await Promise.allSettled([invoke<string>('git_log'),invoke<string>('git_graph'),invoke<GithubInfo>('github_info'),invoke<Branch[]>('git_branches'),invoke<string>('git_stash',{action:'list'})]);
    setHistory(log.status==='fulfilled'?log.value||'':'');setGraph(graphData.status==='fulfilled'?graphData.value||'':'');
    if(account.status==='fulfilled'&&account.value)setGithub(account.value);
    setBranches(branchList.status==='fulfilled'&&Array.isArray(branchList.value)?branchList.value:[]);
    setStashes(stashList.status==='fulfilled'&&stashList.value?stashList.value.split('\n').filter(Boolean):[]);
  }
  useEffect(()=>{void loadDetails();},[header]);
  useEffect(()=>{
    if(!activePath||!header){setFileHistory('');return;}
    let stale=false;invoke<string>('git_file_history',{path:activePath}).then(value=>{if(!stale)setFileHistory(value||'');}).catch(()=>{if(!stale)setFileHistory('');});
    return()=>{stale=true;};
  },[activePath,header,history]);
  useEffect(()=>{if(!branchMenu)return;const close=(event:MouseEvent)=>{if(!menu.current?.contains(event.target as Node))setBranchMenu(false);};window.addEventListener('mousedown',close);return()=>window.removeEventListener('mousedown',close);},[branchMenu]);

  /** Run a git command, then refresh status (and the workspace when files on disk may have changed). */
  async function run(label:string,command:string,args:Record<string,unknown>={},opts:{changesFiles?:boolean;done?:string}={}){
    setBusy(label);
    try{await invoke(command,args);await refresh();await loadDetails();if(opts.changesFiles)onWorkspaceChanged();if(opts.done)notify(opts.done);return true;}
    catch(error){report(error);return false;}finally{setBusy('');}
  }
  async function commit(){
    if((!message.trim()&&!amend)||(!staged.length&&!amend))return;
    if(await run('commit','git_commit',{message,amend},{done:amend?'Amended last commit':'Committed '+staged.length+' file'+(staged.length===1?'':'s')})){setMessage('');setAmend(false);}
  }
  async function login(){setBusy('login');try{await invoke('github_login');await loadDetails();}catch(error){report(error);}finally{setBusy('');}}
  async function remote(action:'fetch'|'pull'|'push'){return run(action,'git_remote_action',{action},{changesFiles:action==='pull',done:action==='fetch'?'Fetched from remote':action==='pull'?'Pulled latest changes':'Pushed to remote'});}
  async function sync(){if(info.behind&&!await remote('pull'))return;if(info.ahead||!info.behind)await remote('push');}
  async function switchTo(name:string,create=false){setBranchMenu(false);setNewBranch('');await run('switch','git_switch',{branch:name,create},{changesFiles:true,done:(create?'Created and switched to ':'Switched to ')+name});}

  const group=(title:string,items:Change[],isStaged:boolean)=><section className="scm-group"><header><span>{title}</span>
    <div className="scm-group-actions">{isStaged?<button title="Unstage all changes" aria-label="Unstage all changes" disabled={!!busy||!items.length} onClick={()=>void run('unstage-all','git_unstage_all')}><Minus size={13}/></button>
      :<>{tracked.length>0&&<button title="Discard all tracked changes" aria-label="Discard all changes" disabled={!!busy} onClick={()=>setDiscard('*')}><RotateCcw size={12}/></button>}<button title="Stage all changes" aria-label="Stage all changes" disabled={!!busy||!items.length} onClick={()=>void run('stage-all','git_stage_all')}><Plus size={13}/></button></>}</div>
    <b>{items.length}</b></header>
    {items.map(item=><div className="scm-change" key={(isStaged?'s':'u')+item.path}><button className="scm-file" title={'View diff · '+item.path} onClick={()=>void openDiff(item.path)}><DimensionalIcon path={item.path}/><span>{item.path}</span><i className={'git-letter git-'+(isStaged?item.index:item.worktree===' '?'U':item.worktree==='?'?'U':item.worktree)}>{isStaged?item.index:item.worktree===' '||item.worktree==='?'?'U':item.worktree}</i></button><div className="scm-actions">{isStaged?<button title="Unstage change" disabled={!!busy} onClick={()=>void run('unstage'+item.path,'git_unstage',{path:item.path})}><Minus size={13}/></button>:<><button title="Stage change" disabled={!!busy} onClick={()=>void run('stage'+item.path,'git_stage',{path:item.path})}><Plus size={13}/></button>{item.index!=='?'&&<button title="Discard change" disabled={!!busy} onClick={()=>setDiscard(item.path)}><RotateCcw size={12}/></button>}</>}</div></div>)}</section>;
  const graphLines=graph.split('\n').filter(Boolean);
  const canCommit=amend?!busy:!!message.trim()&&staged.length>0&&!busy;

  return <div className="source-control">
    <div className="github-card">{github.authenticated?<><img src={github.avatar} alt=""/><span><b>{github.name||github.login}</b><small>@{github.login}</small></span><i className="online" title="GitHub connected"/></>:<><span className="github-mark"><GitFork size={18}/></span><span><b>GitHub</b><small>{github.available?'Connect your account':'Install GitHub CLI to connect'}</small></span><button disabled={!github.available||busy==='login'} onClick={()=>void login()}>Sign in</button></>}</div>
    {github.repository&&<div className="repo-card"><span><Network size={14}/><b>{github.repository}</b><small>{github.visibility}</small></span><div><button title="Fetch" disabled={!!busy} onClick={()=>void remote('fetch')}><CloudDownload size={14}/></button><button title="Pull" disabled={!!busy} onClick={()=>void remote('pull')}><Download size={14}/></button><button title="Push" disabled={!!busy} onClick={()=>void remote('push')}><Upload size={14}/></button><button title="Open repository on GitHub" onClick={()=>void invoke('github_open').catch(report)}><ExternalLink size={14}/></button></div></div>}
    <div className="git-heading" ref={menu}>
      <GitCommitHorizontal size={16}/>
      <button className="branch-button" title="Switch or create branch" aria-label="Switch branch" aria-expanded={branchMenu} disabled={!header||!!busy} onClick={()=>setBranchMenu(v=>!v)}><b>{branch}</b>{header&&<ChevronDown size={12}/>}</button>
      {(info.ahead>0||info.behind>0)&&<button className="sync-badge" title={`Sync: pull ${info.behind}, push ${info.ahead}`} aria-label="Synchronize changes" disabled={!!busy} onClick={()=>void sync()}>{info.behind>0&&<><ArrowDown size={11}/>{info.behind}</>}{info.ahead>0&&<><ArrowUp size={11}/>{info.ahead}</>}</button>}
      {header&&!info.upstream&&branch!=='HEAD'&&github.repository&&<small className="no-upstream" title="This branch has not been pushed yet">local only</small>}
      <button className="icon-button" title="Refresh Git" onClick={()=>{void refresh();void loadDetails();}}><RefreshCw size={14} className={busy?'spin':''}/></button>
      {branchMenu&&<div className="branch-menu" role="menu">
        <form onSubmit={event=>{event.preventDefault();if(newBranch.trim())void switchTo(newBranch.trim(),true);}}><GitBranchPlus size={13}/><input autoFocus aria-label="New branch name" placeholder="Create new branch…" value={newBranch} onChange={event=>setNewBranch(event.target.value)}/></form>
        {branches.map(item=><button key={item.name} role="menuitem" className={item.current?'current':''} disabled={item.current} onClick={()=>void switchTo(item.name)}><GitBranch size={13}/><span>{item.name}</span>{item.upstream&&<small>{item.upstream}</small>}{item.current&&<Check size={12}/>}</button>)}
        {!branches.length&&<p>No local branches yet. Make a first commit.</p>}
      </div>}
    </div>
    {branch==='No repository'?<div className="scm-empty">Open a folder containing a Git repository, or run <code>git init</code> in the terminal.</div>:<>
      <textarea aria-label="Commit message" placeholder={amend?'New message (leave empty to keep the current one)':`Message (${keys('⌘')}Enter to commit)`} value={message} onChange={event=>setMessage(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter')void commit();}}/>
      <div className="scm-commit-row">
        <button className="scm-commit primary" disabled={!canCommit} onClick={()=>void commit()}><Check size={14}/>{amend?'Amend last commit':`Commit ${staged.length?`${staged.length} staged`:''}`}</button>
        <label className="scm-amend" title="Replace the previous commit instead of creating a new one"><input type="checkbox" checked={amend} onChange={event=>setAmend(event.target.checked)}/>Amend</label>
      </div>
      <div className="scm-toolbar">
        <button title="Stash all changes, including untracked files" disabled={!!busy||!changes.length} onClick={()=>void run('stash','git_stash',{action:'push'},{changesFiles:true,done:'Changes stashed'})}><Archive size={13}/>Stash</button>
        <button title={stashes[0]?'Apply and remove: '+stashes[0].split('\t').at(-1):'No stashes'} disabled={!!busy||!stashes.length} onClick={()=>void run('pop','git_stash',{action:'pop'},{changesFiles:true,done:'Stash applied'})}><ArchiveRestore size={13}/>Pop{stashes.length>0&&<i>{stashes.length}</i>}</button>
        {info.upstream&&<button title="Pull, then push" disabled={!!busy} onClick={()=>void sync()}><RefreshCcw size={13}/>Sync</button>}
      </div>
      {group('STAGED CHANGES',staged,true)}{group('CHANGES',unstaged,false)}
      {!changes.length&&<div className="scm-empty"><Check size={18}/>Working tree clean</div>}
      {activePath&&<section className="commit-graph"><button onClick={()=>setHistoryOpen(value=>!value)}>{historyOpen?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<History size={13}/>FILE HISTORY · {activePath.split('/').pop()}</button>
        {historyOpen&&<div className="graph-list">{fileHistory?fileHistory.split('\n').filter(Boolean).map(line=>{const [hash,author,when,...subject]=line.split('\t');return <article key={hash}><span className="graph-rail"><i/></span><div><b>{subject.join(' ')}</b><small><code>{hash}</code>{author} · {when}</small></div></article>;}):<p>No commits touch this file yet.</p>}</div>}</section>}
      <section className="commit-graph"><button onClick={()=>setGraphOpen(value=>!value)}>{graphOpen?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<Network size={13}/>COMMIT GRAPH</button>{graphOpen&&<div className="graph-list">{graphLines.length?graphLines.map((line,index)=>{const [hash,,refs,author,when,...subject]=line.split('\t');return <article key={hash}><span className="graph-rail"><i/>{index<graphLines.length-1&&<em/>}</span><div><b>{subject.join(' ')}</b>{refs&&<label>{refs.replace(/[()]/g,'')}</label>}<small><code>{hash}</code>{author} · {when}</small></div></article>}):history?history.split('\n').map(line=>{const [hash,author,when,...subject]=line.split('\t');return <article key={hash}><span className="graph-rail"><i/></span><div><b>{subject.join(' ')}</b><small><code>{hash}</code>{author} · {when}</small></div></article>}):<p>No commits yet.</p>}</div>}</section>
    </>}
    {discard&&<div className="scm-confirm"><p>{discard==='*'?<>Discard changes in <b>{tracked.length} tracked file{tracked.length===1?'':'s'}</b>?</>:<>Discard changes in <b>{discard}</b>?</>}</p><small>This cannot be undone. Untracked files are kept.</small><div><button onClick={()=>setDiscard('')}>Cancel</button><button className="danger" onClick={()=>{const target=discard;setDiscard('');void (target==='*'?run('discard-all','git_discard_all',{},{changesFiles:true,done:'Discarded all tracked changes'}):run('discard'+target,'git_discard',{path:target},{changesFiles:true}));}}>Discard</button></div></div>}
  </div>;
}
