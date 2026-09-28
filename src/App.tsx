import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Files, Search, GitBranch, Settings2, FolderOpen, ChevronRight, ChevronDown, Folder, Plus, X, RefreshCw, PanelLeft, PanelBottom, Columns2, TerminalSquare, Check, CircleAlert, CircleX, Save, ArrowUpRight, Command, MoreHorizontal, Sun, Moon, Braces, Trash2, Pencil, WrapText, FilePlus2, FolderPlus, CheckCheck, Sparkles, Copy, Scissors, ClipboardPaste, ExternalLink } from "lucide-react";
import { monaco, languageFor } from "./editor";
import { Terminal } from "./Terminal";
import "./App.css";
import "./explorer.css";
import {CreateEntryDialog} from "./CreateEntryDialog";
import {Package} from "lucide-react";
import {ExtensionsPanel} from "./ExtensionsPanel";
import {activateExtensions,installedExtensions,saveExtensions,themeId,type Extension} from "./extensions";
import {AIStudio,type AISnapshot,type AIProposal} from './AIStudio';
import {DimensionalIcon} from './DimensionalIcon';
import {PrismIcon,type PrismTone} from './PrismIcon';
import './studio.css';

type Entry = { path: string; name: string; directory: boolean };
type Tab = { path: string; text: string; original: string; external?: boolean };
type Hit = { path: string; line: number; text: string };
type Modal = { title: string; detail?: string; initial?: string; input?: boolean; choices: string[]; resolve: (value: string | null) => void };
type Preferences = { fontSize: number; wrap: boolean; minimap: boolean; light: boolean };
type ExplorerMenu = { x: number; y: number; entry: Entry };
const baseName = (path: string) => path.split("/").pop() || path;
const dirty = (tab: Tab) => tab.text !== tab.original;
const IconFile = DimensionalIcon;
function readPreferences(): Preferences {
  try { return {fontSize:14,wrap:false,minimap:true,light:false,...JSON.parse(localStorage.getItem("veyra.preferences") || "{}")}; } catch { return {fontSize:14,wrap:false,minimap:true,light:false}; }
}

export default function App() {
  const [root, setRoot] = useState("");
  const [tree, setTree] = useState<Record<string,Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [selectedFolder,setSelectedFolder]=useState("");
  const [selectedPath,setSelectedPath]=useState("");
  const [creation,setCreation]=useState<{directory:boolean;parent:string}|null>(null);
  const [indexed, setIndexed] = useState<string[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState("");
  const [panel, setPanel] = useState("files");
  const [aiOpen,setAiOpen]=useState(true);
  const [aiIntent,setAiIntent]=useState(0);
  const [proposal,setProposal]=useState<AIProposal|null>(null);
  const [proposalError,setProposalError]=useState('');
  const [extensions,setExtensions]=useState(installedExtensions);
  const [extensionTheme,setExtensionTheme]=useState(()=>localStorage.getItem('veyra.extensionTheme')||'');
  useEffect(()=>activateExtensions(extensions),[extensions]);
  const availableThemes=extensions.filter(x=>x.enabled).flatMap(x=>x.themes.map((_,i)=>themeId(x.id,i)));
  const effectiveTheme=availableThemes.includes(extensionTheme)?extensionTheme:'';
  const selectedTheme=extensions.filter(x=>x.enabled).flatMap(x=>x.themes.map((t,i)=>({...t,id:themeId(x.id,i)}))).find(t=>t.id===effectiveTheme);
  const themeColors=selectedTheme?.data.colors;
  const themeLight=selectedTheme?.data.base==='vs';
  const workspaceTheme:CSSProperties|undefined=themeColors?{
    '--editor':themeColors['editor.background']||(themeLight?'#ffffff':'#1e1e1e'),
    '--sidebar':themeColors['sideBar.background']||themeColors['editor.background']||(themeLight?'#f3f3f3':'#252526'),
    '--toolbar':themeColors['titleBar.activeBackground']||themeColors['sideBar.background']||themeColors['editor.background']||(themeLight?'#dddddd':'#333333'),
    '--text':themeColors['foreground']||themeColors['editor.foreground']||(themeLight?'#333333':'#d4d4d4'),
    '--bright':themeColors['editor.foreground']||(themeLight?'#202020':'#eeeeee'),
    '--muted':themeColors['descriptionForeground']||themeColors['editor.foreground']||(themeLight?'#606060':'#aaaaaa'),
    '--border':themeColors['panel.border']||(themeLight?'#cccccc':'#454545'),
    '--accent':themeColors['focusBorder']||themeColors['button.background']||(themeLight?'#0066b8':'#80cbbf'),
    '--hover':themeColors['list.hoverBackground']||(themeLight?'#e8e8e8':'#343434'),
    '--selection':themeColors['list.activeSelectionBackground']||(themeLight?'#cce5ff':'#264f78'),
    '--card':themeColors['sideBar.background']||themeColors['editor.background']||(themeLight?'#ffffff':'#252526'),
  } as CSSProperties:undefined;
  function changeExtensions(next:Extension[]){saveExtensions(next);setExtensions(next);}
  function changeExtensionTheme(theme:string){localStorage.setItem('veyra.extensionTheme',theme);setExtensionTheme(theme);}
  const [sidebar, setSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(258);
  const [bottom, setBottom] = useState<"terminal"|"problems"|null>(null);
  const [terminalStarted, setTerminalStarted] = useState(false);
  const [split, setSplit] = useState(false);
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(()=>{monaco.editor.setTheme(effectiveTheme||(preferences.light?'vs':'veyra'));},[effectiveTheme,preferences.light,extensions]);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [git, setGit] = useState("");
  const [diff, setDiff] = useState<string|null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [palette, setPalette] = useState<"files"|"commands"|null>(null);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [modal, setModal] = useState<Modal|null>(null);
  const [explorerMenu,setExplorerMenu]=useState<ExplorerMenu|null>(null);
  const [clipboard,setClipboard]=useState<{entry:Entry;cut:boolean}|null>(null);
  const [input, setInput] = useState("");
  const [problems, setProblems] = useState<monaco.editor.IMarker[]>([]);
  const [symbols, setSymbols] = useState<{name:string;line:number}[]>([]);
  const [position, setPosition] = useState({lineNumber:1,column:1});
  const editor = useRef<monaco.editor.IStandaloneCodeEditor|null>(null);
  const state = useRef({tabs,active,root}); state.current = {tabs,active,root};
  const saving = useRef(new Set<string>());
  const opening = useRef(new Set<string>());
  const diskCheckRunning=useRef(false);
  const cursorTimer=useRef<number|undefined>(undefined);
  const modalRef = useRef<Modal|null>(null); modalRef.current = modal;
  const file = tabs.find(t => t.path === active);
  const selectedEntry=Object.values(tree).flat().find(entry=>entry.path===selectedPath);
  const countDirty = tabs.filter(dirty).length;
  const projectName = root ? baseName(root) : "Your next idea";
  const projectType = indexed.includes("Cargo.toml") ? "Rust" : indexed.includes("package.json") ? "JavaScript / TypeScript" : indexed.some(p=>p==="pyproject.toml"||p==="requirements.txt") ? "Python" : "Workspace";
  const report = (e: unknown) => { setError(String(e)); setStatus("Action needs attention"); };
  const ask = (title: string, choices: string[], detail?: string, initial?: string) => new Promise<string|null>(resolve => {
    setInput(initial || ""); setModal({title,choices,detail,initial,input:initial!==undefined,resolve});
  });
  const answer = (value: string|null) => { modal?.resolve(value); setModal(null); };
  function captureAI(scope:string):AISnapshot|null {
    const current=state.current;const tab=current.tabs.find(t=>t.path===current.active);
    if(!tab||!current.root)return null;
    let start=0,end=tab.text.length;
    if(scope==='selection'){
      const model=editor.current?.getModel();const selection=editor.current?.getSelection();
      if(!model||!selection||selection.isEmpty()||model.uri.toString()!==monaco.Uri.file(current.root+'/'+tab.path).toString())return null;
      start=model.getOffsetAt(selection.getStartPosition());end=model.getOffsetAt(selection.getEndPosition());
    }
    return {root:current.root,path:tab.path,original:tab.text,start,end,content:tab.text.slice(start,end)};
  }
  function applyProposal(){
    if(!proposal)return;const snapshot=proposal.snapshot;const current=state.current;
    const tab=current.tabs.find(t=>t.path===snapshot.path);
    const model=monaco.editor.getModel(monaco.Uri.file(snapshot.root+'/'+snapshot.path));
    if(current.root!==snapshot.root||current.active!==snapshot.path||!tab||tab.text!==snapshot.original||!model||model.getValue()!==snapshot.original){setProposalError('The file or workspace changed after this request. Return to the original file and request a fresh edit. Your current work is preserved.');return;}
    const replacement=snapshot.original.slice(0,snapshot.start)+proposal.replacement+snapshot.original.slice(snapshot.end);
    model.pushStackElement();model.pushEditOperations([],[{range:model.getFullModelRange(),text:replacement}],()=>null);model.pushStackElement();
    setTabs(all=>all.map(t=>t.path===snapshot.path?{...t,text:replacement}:t));setProposal(null);setStatus('AI edit applied to buffer · review and save with ⌘S');editor.current?.focus();
  }
  function editWithAI(){setAiOpen(true);setAiIntent(n=>n+1);}

  async function refresh(reveal?:unknown) {
    if (!state.current.root) return;
    const currentRoot = state.current.root;
    try {
      const folders=new Set(expanded);
      folders.add("");
      if(typeof reveal==="string"){
        const parts=reveal.split("/").filter(Boolean);
        for(let i=1;i<=parts.length;i++)folders.add(parts.slice(0,i).join("/"));
      }
      const loaded=await Promise.all([...folders].map(async path=>{
        try{return [path,await invoke<Entry[]>("list_directory",{path})] as const;}
        catch(e){if(!path)throw e;return null;}
      }));
      const paths = await invoke<string[]>("project_files");
      if (state.current.root !== currentRoot) return;
      const entries=loaded.filter((item):item is NonNullable<typeof item>=>item!==null);
      setTree(Object.fromEntries(entries));setExpanded(new Set(entries.map(([path])=>path)));setIndexed(paths);
      void refreshGit();
    } catch(e) { report(e); }
  }
  async function refreshGit() {
    try { setGit(await invoke<string>("git_status")); } catch { setGit(""); }
  }
  async function saveTab(path = state.current.active) {
    const tab = state.current.tabs.find(t=>t.path===path);
    if (!tab || !dirty(tab)) return true;
    if (saving.current.has(path)) return false;
    saving.current.add(path);
    try {
      await invoke("save_file",{path,content:tab.text,original:tab.original});
      setTabs(all=>all.map(t=>t.path===path?{...t,original:tab.text,external:false}:t));
      setStatus("Saved " + baseName(path)); void refreshGit(); return true;
    } catch(e) { report(e); return false; }
    finally { saving.current.delete(path); }
  }
  async function saveAll() { for (const tab of state.current.tabs.filter(dirty)) if (!await saveTab(tab.path)) return false; return true; }
  async function allowDiscard(title: string, selected = state.current.tabs) {
    if (!selected.some(dirty)) return true;
    const choice = await ask(title,["Cancel","Discard changes","Save changes"],"There are unsaved edits. Save them before continuing.");
    if (choice === "Discard changes") return true;
    if (choice === "Save changes") { for (const tab of selected.filter(dirty)) if (!await saveTab(tab.path)) return false; return true; }
    return false;
  }
  async function chooseFolder() {
    if (busy || !await allowDiscard("Switch workspace?")) return;
    setBusy(true);
    try {
      const selected = await invoke<string|null>("choose_folder");
      if (!selected) return;
      setTerminalStarted(false); setRoot(selected); state.current.root=selected;
      setSelectedFolder("");setSelectedPath("");setCreation(null);
      setTabs([]); setActive(""); setTree({}); setIndexed([]); setQuery(""); setHits([]); setDiff(null);
      monaco.editor.getModels().forEach(model=>model.dispose());
      await refresh(); setStatus("Opened " + baseName(selected));
    } catch(e) { report(e); } finally { setBusy(false); }
  }
  async function openFile(path: string, line?: number) {
    setDiff(null); setPalette(null);
    setSelectedPath(path);setSelectedFolder(path.includes("/")?path.slice(0,path.lastIndexOf("/")):"");
    if (state.current.tabs.some(t=>t.path===path)) { setActive(path); }
    else {
      if (opening.current.has(path)) return;
      opening.current.add(path);
      const capturedRoot = state.current.root;
      try {
        const text = await invoke<string>("read_file",{path});
        if (capturedRoot!==state.current.root) return;
        setTabs(all=>all.some(t=>t.path===path)?all:[...all,{path,text,original:text}]); setActive(path);
      } catch(e) { report(e); } finally { opening.current.delete(path); }
    }
    if (line) setTimeout(()=>{editor.current?.revealLineInCenter(line);editor.current?.setPosition({lineNumber:line,column:1});editor.current?.focus();},160);
  }
  async function closeTab(path: string) {
    const tab = state.current.tabs.find(t=>t.path===path);
    if (!tab || !await allowDiscard("Close " + baseName(path) + "?",[tab])) return;
    setTabs(all=>{ const remaining=all.filter(t=>t.path!==path); if(state.current.active===path) setActive(remaining.at(-1)?.path || ""); return remaining; });
    setTimeout(()=>monaco.editor.getModel(monaco.Uri.file(state.current.root+"/"+path))?.dispose(),50);
  }
  async function toggleFolder(path: string) {
    setSelectedPath(path);setSelectedFolder(path);
    if (expanded.has(path)) setExpanded(previous=>{const next=new Set(previous);next.delete(path);return next;});
    else {
      try { const entries=await invoke<Entry[]>("list_directory",{path}); setTree(previous=>({...previous,[path]:entries}));setExpanded(previous=>new Set([...previous,path])); } catch(e) { report(e); }
    }
  }
  async function create(directory=false,parent=selectedFolder) {
    if(busy||creation||modal)return;
    if (!state.current.root){await chooseFolder();if(!state.current.root)return;parent="";}
    setCreation({directory,parent});
  }
  async function createAt(path:string) {
    if(!creation)return;
    const workspace=state.current.root;
    await invoke("create_entry",{path,directory:creation.directory});
    if(state.current.root!==workspace)return;
    const parent=path.includes("/")?path.slice(0,path.lastIndexOf("/")):"";
    await refresh(creation.directory?path:parent);
    setSelectedFolder(creation.directory?path:parent);setSelectedPath(path);
    if(!creation.directory)await openFile(path);
    setStatus("Created "+path);setError("");
  }
  async function renameEntry(entry:Entry) {
    setExplorerMenu(null);
    const affected=state.current.tabs.filter(tab=>tab.path===entry.path||(entry.directory&&tab.path.startsWith(entry.path+"/")));
    if(!await allowDiscard("Save before renaming?",affected))return;
    const label=entry.directory?"folder":"file";
    const next=await ask("Rename "+label,["Cancel","Rename"],"Enter a workspace-relative path. The destination must not already exist.",entry.path);
    if(!next || next===entry.path)return;
    try {
      await invoke("rename_file",{path:entry.path,next});
      affected.forEach(tab=>monaco.editor.getModel(monaco.Uri.file(state.current.root+"/"+tab.path))?.dispose());
      setTabs(all=>all.filter(tab=>!affected.some(item=>item.path===tab.path)));
      if(affected.some(tab=>tab.path===state.current.active))setActive("");
      setSelectedPath(next);setSelectedFolder(entry.directory?next:(next.includes("/")?next.slice(0,next.lastIndexOf("/")):""));
      await refresh(next.includes("/")?next.slice(0,next.lastIndexOf("/")):"");
      if(!entry.directory&&affected.length)await openFile(next);
      setStatus(`Renamed ${entry.name} to ${baseName(next)}`);
    }catch(e){report(e);}
  }
  async function rename(){if(file)await renameEntry({path:file.path,name:baseName(file.path),directory:false});}
  async function trashEntry(entry:Entry) {
    setExplorerMenu(null);
    const affected=state.current.tabs.filter(tab=>tab.path===entry.path||(entry.directory&&tab.path.startsWith(entry.path+"/")));
    if(!await allowDiscard("Save before moving to Trash?",affected))return;
    const result=await ask("Move "+entry.name+" to Trash?",["Cancel","Move to Trash"],`The ${entry.directory?'folder and everything inside it':'file'} can be recovered from Trash.`);
    if(result!=="Move to Trash")return;
    try {
      await invoke("trash_file",{path:entry.path});
      affected.forEach(tab=>monaco.editor.getModel(monaco.Uri.file(state.current.root+"/"+tab.path))?.dispose());
      setTabs(all=>all.filter(tab=>!affected.some(item=>item.path===tab.path)));
      if(affected.some(tab=>tab.path===state.current.active))setActive("");
      setSelectedPath("");setSelectedFolder(entry.path.includes("/")?entry.path.slice(0,entry.path.lastIndexOf("/")):"");
      await refresh();setStatus("Moved "+entry.name+" to Trash");
    }catch(e){report(e);}
  }
  async function trash(){if(file)await trashEntry({path:file.path,name:baseName(file.path),directory:false});}
  function copyToClipboard(entry:Entry,cut=false){setClipboard({entry,cut});setExplorerMenu(null);setStatus(`${cut?'Cut':'Copied'} ${entry.name}`);}
  async function pasteInto(parent:string){
    if(!clipboard)return;setExplorerMenu(null);
    const next=(parent?parent+"/":"")+clipboard.entry.name;
    if(next===clipboard.entry.path){report('Choose a different destination folder.');return;}
    try{
      if(clipboard.cut){
        const affected=state.current.tabs.filter(tab=>tab.path===clipboard.entry.path||(clipboard.entry.directory&&tab.path.startsWith(clipboard.entry.path+"/")));
        if(!await allowDiscard("Save before moving?",affected))return;
        await invoke('rename_file',{path:clipboard.entry.path,next});
        affected.forEach(tab=>monaco.editor.getModel(monaco.Uri.file(state.current.root+"/"+tab.path))?.dispose());
        setTabs(all=>all.filter(tab=>!affected.some(item=>item.path===tab.path)));if(affected.some(tab=>tab.path===state.current.active))setActive('');
        setClipboard(null);setStatus(`Moved ${clipboard.entry.name}`);
      }else{await invoke('copy_entry',{path:clipboard.entry.path,next});setStatus(`Pasted ${clipboard.entry.name}`);}
      await refresh(parent);setSelectedPath(next);setSelectedFolder(clipboard.entry.directory?next:parent);
    }catch(e){report(e);}
  }
  async function duplicateEntry(entry:Entry){setExplorerMenu(null);try{const next=await invoke<string>('duplicate_entry',{path:entry.path});await refresh(next.includes('/')?next.slice(0,next.lastIndexOf('/')):'');setSelectedPath(next);setStatus(`Duplicated ${entry.name}`);}catch(e){report(e);}}
  async function revealEntry(entry:Entry){setExplorerMenu(null);try{await invoke('reveal_in_finder',{path:entry.path});setStatus(`Revealed ${entry.name} in Finder`);}catch(e){report(e);}}
  async function reload() {
    if(!file || !await allowDiscard("Reload from disk?",[file]))return;
    try{const text=await invoke<string>("read_file",{path:file.path});setTabs(all=>all.map(t=>t.path===file.path?{...t,text,original:text,external:false}:t));}catch(e){report(e);}
  }
  async function showDiff() {if(!file)return;try{setDiff(await invoke<string>("git_diff",{path:file.path}));}catch(e){report(e);}}
  function openPalette(mode:"commands"|"files") { setPalette(mode);setPaletteQuery(""); }
  function showTerminal() {if(!root){setStatus("Open a workspace to start a terminal");return;}setTerminalStarted(true);setBottom("terminal");}
  const commands = [
    {name:'Toggle AI assistant',shortcut:'⌘L',run:()=>setAiOpen(v=>!v)},{name:'Edit selection with AI',shortcut:'⌘K',run:editWithAI},
    {name:"Open folder",shortcut:"⌘O",run:chooseFolder},{name:"New file",shortcut:"⌘N",run:()=>create()},
    {name:"Save file",shortcut:"⌘S",run:()=>saveTab()},{name:"Save all",shortcut:"⇧⌘S",run:saveAll},
    {name:"Find in file",shortcut:"⌘F",run:()=>editor.current?.getAction("actions.find")?.run()},
    {name:"Replace in file",shortcut:"⌥⌘F",run:()=>editor.current?.getAction("editor.action.startFindReplaceAction")?.run()},
    {name:"Format document",shortcut:"⇧⌥F",run:()=>editor.current?.getAction("editor.action.formatDocument")?.run()},
    {name:"Reload file from disk",shortcut:"",run:reload},{name:"Rename file",shortcut:"",run:rename},
    {name:"Move file to Trash",shortcut:"",run:trash},{name:"Open terminal",shortcut:"⌃`",run:showTerminal},
    {name:"Toggle split editor",shortcut:"",run:()=>setSplit(!split)},{name:"Settings",shortcut:"⌘,",run:()=>{setPanel("settings");setSidebar(true);}},
  ];
  const matches = palette==="files"?indexed.filter(p=>p.toLowerCase().includes(paletteQuery.toLowerCase())).slice(0,70):commands.filter(c=>c.name.toLowerCase().includes(paletteQuery.toLowerCase()));

  useEffect(()=>{localStorage.setItem("veyra.preferences",JSON.stringify(preferences));},[preferences]);
  useEffect(()=>{void invoke("set_dirty",{dirty:countDirty>0});},[countDirty]);
  useEffect(()=>{
    const unlisten=listen("confirm-quit",async()=>{if(modalRef.current)return;if(await allowDiscard("Quit Veyra?"))void invoke("quit");});
    return ()=>{void unlisten.then(f=>f());};
  },[]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(creation)return;
      if(e.key==="Escape"){setPalette(null);setDiff(null);setProposal(null);setExplorerMenu(null);return;}
      if(!(e.metaKey||e.ctrlKey))return;
      const k=e.key.toLowerCase();
      const explorerFocused=(e.target as Element|null)?.closest?.('.sidebar')&&selectedEntry;
      if(explorerFocused&&['c','x','v','d'].includes(k)){
        e.preventDefault();e.stopPropagation();
        if(k==='c')copyToClipboard(selectedEntry,false);if(k==='x')copyToClipboard(selectedEntry,true);
        if(k==='v')void pasteInto(selectedEntry.directory?selectedEntry.path:(selectedEntry.path.includes('/')?selectedEntry.path.slice(0,selectedEntry.path.lastIndexOf('/')):''));
        if(k==='d')void duplicateEntry(selectedEntry);return;
      }
      if(["s","o","p","n","b",",","w","l","k"].includes(k)){e.preventDefault();e.stopPropagation();}
      if(k==='l')setAiOpen(v=>!v);
      if(k==='k')editWithAI();
      if(k==="s")void (e.shiftKey?saveAll():saveTab());
      if(k==="o")void chooseFolder();
      if(k==="n")void create();
      if(k==="p")openPalette(e.shiftKey?"commands":"files");
      if(k==="b")setSidebar(v=>!v);
      if(k===","){setPanel("settings");setSidebar(true);}
      if(k==="w")void closeTab(state.current.active);
      if(k==="f"&&e.shiftKey){e.preventDefault();setPanel("search");setSidebar(true);}
    };
    window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);
  });
  useEffect(()=>{
    if(!root||!query.trim()){setHits([]);return;}
    let stale=false;
    const timeout=setTimeout(()=>{setSearching(true);invoke<Hit[]>("search_workspace",{query}).then(results=>{if(!stale)setHits(results);}).catch(report).finally(()=>{if(!stale)setSearching(false);});},350);
    return()=>{stale=true;clearTimeout(timeout);};
  },[query,root]);
  useEffect(()=>{
    const check=async()=>{
      if(diskCheckRunning.current||document.visibilityState!=="visible")return;
      const {tabs,root}=state.current;
      if(!root)return;
      diskCheckRunning.current=true;
      try{
        const results=await Promise.all(tabs.map(async tab=>{
          if(saving.current.has(tab.path))return null;
          try{return {path:tab.path,disk:await invoke<string>("read_file",{path:tab.path})};}
          catch{return null;}
        }));
        if(state.current.root!==root)return;
        const disks=new Map(results.filter((item):item is NonNullable<typeof item>=>item!==null).map(item=>[item.path,item.disk]));
        setTabs(all=>{
          let changed=false;
          const next=all.map(tab=>{
            const disk=disks.get(tab.path);if(disk===undefined||saving.current.has(tab.path))return tab;
            if(dirty(tab)){const external=disk!==tab.original;if(external===!!tab.external)return tab;changed=true;return {...tab,external};}
            if(disk===tab.original&&!tab.external)return tab;
            changed=true;return {...tab,text:disk,original:disk,external:false};
          });
          return changed?next:all;
        });
      }finally{diskCheckRunning.current=false;}
    };
    const timer=setInterval(check,8000);return()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    if(!file){setSymbols([]);return;}
    const text=file.text;
    const timer=window.setTimeout(()=>setSymbols(text.split("\n").flatMap((line,i)=>{
        const match=line.match(/(?:function|class|interface|type|def|fn|struct|enum)\s+(\w+)/) || line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=/);
        return match?[{name:match[1],line:i+1}]:[];
      }).slice(0,80)),250);
    return()=>clearTimeout(timer);
  },[file?.text]);
  const mounted: OnMount = (instance) => {
    editor.current=instance;
    instance.onDidChangeCursorPosition(e=>{clearTimeout(cursorTimer.current);cursorTimer.current=window.setTimeout(()=>setPosition(e.position),80);});
    instance.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS,()=>void saveTab());
    instance.addAction({id:'veyra.ai.edit',label:'Edit selection with Veyra AI',contextMenuGroupId:'navigation',contextMenuOrder:1,run:editWithAI});
    instance.focus();
  };
  function treeItems(parent="",depth=0): React.ReactNode {
    return (tree[parent]||[]).map(entry=><div key={entry.path}>
      <div className={"explorer-entry "+(selectedPath===entry.path?"selected":"")} onContextMenu={event=>{event.preventDefault();event.stopPropagation();setSelectedPath(entry.path);if(entry.directory)setSelectedFolder(entry.path);setExplorerMenu({x:event.clientX,y:event.clientY,entry});}}>
      <button className={"tree-row "+(active===entry.path?"active":"")} aria-pressed={selectedPath===entry.path} aria-expanded={entry.directory?expanded.has(entry.path):undefined} style={{paddingLeft:12+depth*14}} title={entry.path} onClick={()=>entry.directory?toggleFolder(entry.path):openFile(entry.path)}>
        {entry.directory?<>{expanded.has(entry.path)?<ChevronDown size={12}/>:<ChevronRight size={12}/>}<DimensionalIcon path={entry.path} directory open={expanded.has(entry.path)}/></>:<><span className="tree-indent"/><IconFile path={entry.path}/></>}
        <span>{entry.name}</span>{tabs.some(t=>t.path===entry.path&&dirty(t))&&<i className="dirty-dot"/>}
      </button>{entry.directory&&<div className="folder-actions"><button aria-label={"New file in "+entry.path} title="New file here" onClick={()=>create(false,entry.path)}><FilePlus2 size={13}/></button><button aria-label={"New folder in "+entry.path} title="New folder here" onClick={()=>create(true,entry.path)}><FolderPlus size={13}/></button></div>}</div>{entry.directory&&expanded.has(entry.path)&&<div className="tree-children">{treeItems(entry.path,depth+1)}{tree[entry.path]?.length===0&&<button className="empty-folder" style={{paddingLeft:35+depth*14}} onClick={()=>create(false,entry.path)}>Empty folder · create a file</button>}</div>}
    </div>);
  }
  const modelUri = file?monaco.Uri.file(root+"/"+file.path).toString():"";
  const editorOptions=useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(()=>({fontSize:preferences.fontSize,fontFamily:"Menlo, Monaco, monospace",fontLigatures:true,lineHeight:24,automaticLayout:true,minimap:{enabled:preferences.minimap},wordWrap:preferences.wrap?"on":"off",padding:{top:18},smoothScrolling:true,scrollBeyondLastLine:false,bracketPairColorization:{enabled:true},tabSize:2,renderLineHighlight:"all",stickyScroll:{enabled:true}}),[preferences.fontSize,preferences.minimap,preferences.wrap]);
  return <main style={workspaceTheme} className={"app "+((selectedTheme?themeLight:preferences.light)?"light":"")+(selectedTheme?' extension-themed':'')}>
    <header className="toolbar">
      <div className="identity"><span className="brand-gem"><img src="/veyra.png" alt="Veyra"/></span><span className="brand-copy"><strong>Veyra</strong><small>STUDIO</small></span><span className="separator">/</span><span className="workspace-name">{root?projectName:"Workspace"}</span></div>
      <button className="command-launch" onClick={()=>openPalette("commands")}><Search size={14}/><span>Search files and commands</span><kbd>⇧⌘P</kbd></button>
      <div className="toolbar-actions"><button className="icon-button" title="Toggle sidebar · ⌘B" onClick={()=>setSidebar(!sidebar)}><PanelLeft size={17}/></button><button className={"icon-button "+(bottom?"selected":"")} title="Toggle bottom panel" onClick={()=>bottom?setBottom(null):showTerminal()}><PanelBottom size={17}/></button><button className={"icon-button "+(split?"selected":"")} title="Split editor" onClick={()=>setSplit(!split)}><Columns2 size={17}/></button><button className={'ai-toggle '+(aiOpen?'selected':'')} title="Toggle AI assistant · ⌘L" aria-label="Toggle AI assistant" onClick={()=>setAiOpen(!aiOpen)}><Sparkles size={14}/>Veyra AI</button></div>
    </header>
    <div className="workbench">
      <nav className="activity" aria-label="Workspace panels">
        {([{id:"files",icon:Files,label:"Explorer",tone:'blue'},{id:"search",icon:Search,label:"Search workspace · ⇧⌘F",tone:'cyan'},{id:"git",icon:GitBranch,label:"Source control",tone:'coral'}] as const).map(({id,icon:Icon,label,tone})=><button title={label} aria-label={label} className={panel===id&&sidebar?"selected":""} key={id} onClick={()=>{setPanel(id);setSidebar(true);if(id==="git")void refreshGit();}}><PrismIcon tone={tone as PrismTone}><Icon size={17}/></PrismIcon></button>)}
        <button title="Extensions" aria-label="Extensions" className={panel==='extensions'&&sidebar?'selected':''} onClick={()=>{setPanel('extensions');setSidebar(true);}}><PrismIcon tone="violet"><Package size={17}/></PrismIcon></button>
        <div className="nav-spacer"/><button title="Open terminal" onClick={showTerminal}><PrismIcon tone="mint"><TerminalSquare size={17}/></PrismIcon></button><button title="Settings · ⌘," className={panel==="settings"&&sidebar?"selected":""} onClick={()=>{setPanel("settings");setSidebar(true);}}><PrismIcon tone="gold"><Settings2 size={17}/></PrismIcon></button><span className="nav-avatar"><img src="/veyra.png" alt=""/></span>
      </nav>
      {sidebar&&<><aside className="sidebar" style={{width:sidebarWidth}}>
        <div className="sidebar-heading"><span>{panel==='extensions'?'EXTENSIONS':panel==="files"?"EXPLORER":panel==="search"?"SEARCH":panel==="git"?"SOURCE CONTROL":"PREFERENCES"}</span><button className="icon-button" title="Open folder" onClick={chooseFolder}><FolderOpen size={15}/></button></div>
        {panel==='extensions'&&<ExtensionsPanel items={extensions} onChange={changeExtensions} theme={effectiveTheme} onTheme={changeExtensionTheme}/>}
        {panel==="files"&&<>
          <div className="workspace-section"><span><ChevronDown size={13}/>{root?projectName:"NO FOLDER OPEN"}</span><div><button title="New file · ⌘N" onClick={()=>create()}><FilePlus2 size={14}/></button><button title="New folder" onClick={()=>create(true)}><FolderPlus size={14}/></button><button title="Refresh files" onClick={refresh}><RefreshCw size={13}/></button></div></div>
          <div className="creation-target"><span>CREATE IN</span><strong title={selectedFolder||projectName}>{selectedFolder||"Project root"}</strong><button aria-label="Select workspace root" title="Create in project root" onClick={()=>{setSelectedFolder("");setSelectedPath("");}}><FolderOpen size={13}/></button></div><div className="tree">{root?treeItems():<div className="sidebar-empty"><PrismIcon tone="blue" size="large"><FolderOpen size={25}/></PrismIcon><p>Your files, together.</p><small>Open a folder to explore your project.</small><button className="primary" onClick={chooseFolder}>Open folder</button></div>}</div>
          <div className="outline"><div className="outline-heading"><ChevronDown size={12}/> OUTLINE <span>Detected symbols</span></div><div>{symbols.length?symbols.map(s=><button key={s.line} onClick={()=>{editor.current?.revealLineInCenter(s.line);editor.current?.setPosition({lineNumber:s.line,column:1});}}><Braces size={12}/>{s.name}<small>{s.line}</small></button>):<small className="hint">Open a code file to see symbols.</small>}</div></div>
        </>}
        {panel==="search"&&<div className="panel-body"><label className="search-input"><Search size={14}/><input autoFocus placeholder="Search in files…" value={query} onChange={e=>setQuery(e.target.value)}/></label><small className="hint">{searching?"Searching…":query?hits.length+" matches (up to 500)":"Case-insensitive text search"}</small><div className="search-results">{hits.map((hit,i)=><button key={i} onClick={()=>openFile(hit.path,hit.line)}><b><IconFile path={hit.path}/>{baseName(hit.path)}<small>:{hit.line}</small></b><p>{hit.text}</p><small>{hit.path}</small></button>)}</div><small className="hint">Search skips dependency/build folders. Index limit: 10,000 files.</small></div>}
        {panel==="git"&&<div className="panel-body"><div className="git-heading"><GitBranch size={16}/><b>{git.split("\n")[0]?.replace("## ","")||"No repository"}</b><button className="icon-button" title="Refresh Git" onClick={refreshGit}><RefreshCw size={14}/></button></div><p className="hint">Working tree status from Git</p><pre className="git-status">{git.split("\n").slice(1).join("\n")||(git?"Working tree clean":"Open a Git repository to view its changes.")}</pre><button className="secondary" disabled={!file} onClick={showDiff}>View active file diff</button><p className="hint">Use the integrated terminal for stage, commit, and other Git commands.</p></div>}
        {panel==="settings"&&<div className="panel-body settings"><h3>Make it yours</h3><p className="hint">Preferences are saved on this Mac.</p><label>Appearance<button className="secondary" onClick={()=>setPreferences(p=>({...p,light:!p.light}))}>{preferences.light?<Sun size={14}/>:<Moon size={14}/>} {preferences.light?"Light":"Midnight"}</button></label><label>Font size<input type="number" min={10} max={28} value={preferences.fontSize} onChange={e=>setPreferences(p=>({...p,fontSize:Math.max(10,Math.min(28,+e.target.value||14))}))}/></label><label>Word wrap<input type="checkbox" checked={preferences.wrap} onChange={e=>setPreferences(p=>({...p,wrap:e.target.checked}))}/></label><label>Minimap<input type="checkbox" checked={preferences.minimap} onChange={e=>setPreferences(p=>({...p,minimap:e.target.checked}))}/></label><hr/><h4>Keyboard shortcuts</h4>{commands.filter(c=>c.shortcut).map(c=><div className="shortcut" key={c.name}><span>{c.name}</span><kbd>{c.shortcut}</kbd></div>)}</div>}
      </aside><div className="resize-handle" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))setSidebarWidth(Math.max(190,Math.min(420,e.clientX-49)));}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/></>}
      <section className="content">
        <div className="tab-bar"><div className="tabs" role="tablist">{tabs.map(tab=><div className={"tab "+(tab.path===active?"active":"")} key={tab.path}><button role="tab" aria-selected={tab.path===active} onClick={()=>openFile(tab.path)}><IconFile path={tab.path}/><span>{baseName(tab.path)}</span></button><button className="close-tab" aria-label={"Close "+tab.path} onClick={()=>closeTab(tab.path)}>{dirty(tab)?<i className="dirty-dot"/>:<X size={12}/>}</button></div>)}{!tabs.length&&<div className="welcome-tab"><img src="/veyra.png" alt=""/>Welcome</div>}</div><button className="icon-button" title="Quick open · ⌘P" onClick={()=>openPalette("files")}><Plus size={16}/></button></div>
        {file&&<div className="breadcrumbs"><IconFile path={file.path}/><span>{file.path.split("/").join("  /  ")}</span><div/><button title="Save · ⌘S" onClick={()=>saveTab()} disabled={!dirty(file)}><Save size={14}/></button><button title="Rename" onClick={rename}><Pencil size={13}/></button><button title="Move to Trash" onClick={trash}><Trash2 size={13}/></button><button title="More commands" onClick={()=>openPalette("commands")}><MoreHorizontal size={16}/></button></div>}
        {file?.external&&<div className="warning"><CircleAlert size={15}/>This file changed on disk. Your unsaved edits are preserved.<button onClick={reload}>Review / reload</button></div>}
        <div className="editing-area">
          {diff!==null?<div className="diff-view"><div><GitBranch size={16}/><b>Changes · {active}</b><button onClick={()=>setDiff(null)}><X size={16}/></button></div><pre>{diff||"No changes against HEAD. Untracked files have no HEAD diff."}</pre></div>:file?<div className="editor-splits">{[0,...(split?[1]:[])].map(index=><div className="monaco-pane" key={index}><Editor path={modelUri} keepCurrentModel language={languageFor(file.path)} value={file.text} theme={effectiveTheme||(preferences.light?"vs":"veyra")} onMount={mounted} onValidate={()=>setProblems(monaco.editor.getModelMarkers({}))} onChange={text=>setTabs(all=>all.map(t=>t.path===file.path?{...t,text:text??""}:t))} options={editorOptions}/></div>)}</div>:<div className="welcome">
            <div className="welcome-top"><span className="eyebrow">A LITTLE SPACE. A LOT OF POSSIBILITY.</span><span className="version">Veyra · AI Studio</span></div>
            <div className="welcome-hero"><span className="hero-mark"><img src="/veyra.png" alt="Veyra"/><i/></span><div><h1 aria-label="Room to create.">Build beyond<br/><em>the ordinary.</em></h1><p>A cinematic workspace for focused code and local intelligence.<br/>Open a project and shape the next version.</p></div></div>
            <div className="welcome-grid"><div className="start-card"><div className="card-label">LAUNCHPAD</div><button onClick={chooseFolder}><PrismIcon tone="blue"><FolderOpen size={17}/></PrismIcon><span><b>Open a project</b><small>Bring your local workspace into Veyra</small></span><kbd>⌘O</kbd></button><button onClick={()=>create()}><PrismIcon tone="coral"><FilePlus2 size={17}/></PrismIcon><span><b>Create a file</b><small>A blank page for your next idea</small></span><kbd>⌘N</kbd></button><button onClick={()=>openPalette("commands")}><PrismIcon tone="violet"><Command size={17}/></PrismIcon><span><b>Find a command</b><small>Everything, a few keystrokes away</small></span><kbd>⇧⌘P</kbd></button></div><div className="workspace-card"><div className="card-orbit"/><div className="card-label">{root?"CURRENT WORKSPACE":"DESIGNED FOR FOCUS"}</div><div className="workspace-badge"><PrismIcon tone="mint" size="large"><Folder size={24}/></PrismIcon></div><h3>{root?projectName:"Stay in your flow."}</h3><p>{root?projectType+" · "+indexed.length+" indexed files":"Code, navigate, and explore without leaving your workspace."}</p><div className="feature-tags"><span><Check size={12}/> Local files</span><span><TerminalSquare size={12}/> Real terminal</span><span><Braces size={12}/> Code tools</span></div>{root&&<button className="text-button" onClick={()=>openPalette("files")}>Jump to a file <ArrowUpRight size={14}/></button>}</div></div>
            <div className="welcome-footer"><span><kbd>⌘P</kbd> Jump to file</span><span><kbd>⌘B</kbd> Focus your editor</span><span><kbd>⌘S</kbd> Save your work</span></div>
          </div>}
        </div>
        {bottom&&<div className="bottom-tabs"><button className={bottom==="terminal"?"active":""} onClick={showTerminal}><TerminalSquare size={13}/>Terminal</button><button className={bottom==="problems"?"active":""} onClick={()=>setBottom("problems")}><CircleAlert size={13}/>Problems <span>{problems.length}</span></button><div/><small>{bottom==="terminal"?"Shell runs in your workspace":"Diagnostics for open files"}</small><button title="Hide panel" onClick={()=>setBottom(null)}><X size={14}/></button></div>}
        {terminalStarted&&root&&<div className={"terminal-panel "+(bottom!=="terminal"?"hidden":"")}><Terminal key={root} root={root}/></div>}
        {bottom==="problems"&&<div className="problems-panel">{problems.length?problems.map((p,i)=><button key={i} onClick={()=>{const relative=p.resource.path.slice(root.length+1);void openFile(relative,p.startLineNumber);}}>{p.severity===8?<CircleX size={14}/>:<CircleAlert size={14}/>}<span>{p.message}</span><small>{baseName(p.resource.path)}:{p.startLineNumber}</small></button>):<div><CheckCheck size={18}/>No diagnostics reported for open files.</div>}</div>}
      </section>
      <AIStudio root={root} active={active} visible={aiOpen} onClose={()=>setAiOpen(false)} capture={captureAI} onReview={value=>{setProposal(value);setProposalError('');}} intent={aiIntent}/>
    </div>
    <footer className="statusbar"><button onClick={()=>{setPanel("git");setSidebar(true);void refreshGit();}}><GitBranch size={12}/>{git.split("\n")[0]?.replace("## ","").split("...")[0]||"Local workspace"}</button><button onClick={()=>setBottom("problems")}><CircleX size={12}/>{problems.filter(p=>p.severity===8).length}<CircleAlert size={12}/>{problems.filter(p=>p.severity!==8).length}</button><span className="status-text">{busy?"Opening workspace…":status}</span><span className="status-position">Ln {position.lineNumber}, Col {position.column}</span><span>UTF-8</span><button onClick={()=>setPreferences(p=>({...p,wrap:!p.wrap}))} title="Toggle word wrap"><WrapText size={13}/></button><span>{file?languageFor(file.path):"Veyra"}</span><span className="status-ready"><i/>{countDirty?countDirty+" unsaved":"All saved"}</span></footer>
    {error&&<div className="toast" role="alert"><CircleAlert size={18}/><span>{error}</span><button onClick={()=>setError("")}><X size={15}/></button></div>}
    {explorerMenu&&<><button className="context-menu-dismiss" aria-label="Close context menu" onClick={()=>setExplorerMenu(null)} onContextMenu={event=>{event.preventDefault();setExplorerMenu(null);}}/><div className="explorer-context-menu" role="menu" aria-label={explorerMenu.entry.name+" actions"} style={{left:Math.min(explorerMenu.x,window.innerWidth-220),top:Math.max(8,Math.min(explorerMenu.y,window.innerHeight-390))}}>
      <header><DimensionalIcon path={explorerMenu.entry.path} directory={explorerMenu.entry.directory}/><span><b>{explorerMenu.entry.name}</b><small>{explorerMenu.entry.directory?'Folder':'File'}</small></span></header>
      {explorerMenu.entry.directory&&<><button role="menuitem" onClick={()=>{const path=explorerMenu.entry.path;setExplorerMenu(null);void create(false,path);}}><FilePlus2 size={14}/>New File</button><button role="menuitem" onClick={()=>{const path=explorerMenu.entry.path;setExplorerMenu(null);void create(true,path);}}><FolderPlus size={14}/>New Folder</button><i/></>}
      <button role="menuitem" onClick={()=>copyToClipboard(explorerMenu.entry)}><Copy size={14}/>Copy <kbd>⌘C</kbd></button><button role="menuitem" onClick={()=>copyToClipboard(explorerMenu.entry,true)}><Scissors size={14}/>Cut <kbd>⌘X</kbd></button>{explorerMenu.entry.directory&&<button role="menuitem" disabled={!clipboard} onClick={()=>void pasteInto(explorerMenu.entry.path)}><ClipboardPaste size={14}/>Paste {clipboard&&<small>{clipboard.entry.name}</small>}</button>}<button role="menuitem" onClick={()=>void duplicateEntry(explorerMenu.entry)}><Copy size={14}/>Duplicate <kbd>⌘D</kbd></button><i/>
      <button role="menuitem" onClick={()=>void renameEntry(explorerMenu.entry)}><Pencil size={14}/>Rename <kbd>↵</kbd></button><button role="menuitem" onClick={()=>void revealEntry(explorerMenu.entry)}><ExternalLink size={14}/>Reveal in Finder</button><button role="menuitem" className="danger" onClick={()=>void trashEntry(explorerMenu.entry)}><Trash2 size={14}/>Move to Trash</button>
    </div></>}
    {palette&&<div className="overlay" onMouseDown={()=>setPalette(null)}><div className="palette" onMouseDown={e=>e.stopPropagation()}><div className="palette-search"><Search size={19}/><input autoFocus aria-label="Search commands or files" placeholder={palette==="files"?"Go to file…":"What would you like to do?"} value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&matches.length){const first=matches[0];setPalette(null);if(typeof first==="string")void openFile(first);else void first.run();}}}/><kbd>esc</kbd></div><div className="palette-label">{palette==="files"?"WORKSPACE FILES":"COMMANDS"}</div><div className="palette-results">{matches.map(item=>typeof item==="string"?<button key={item} onClick={()=>openFile(item)}><IconFile path={item}/><span>{item}</span><ArrowUpRight size={13}/></button>:<button key={item.name} onClick={()=>{setPalette(null);void item.run();}}><Command size={14}/><span>{item.name}</span><kbd>{item.shortcut}</kbd></button>)}{!matches.length&&<p>No results. {root?"Try another search.":"Open a workspace first."}</p>}</div><div className="palette-footer">Enter to select the first result · Esc to close</div></div></div>}
    {creation&&<CreateEntryDialog directory={creation.directory} parent={creation.parent} project={projectName} onCreate={createAt} onClose={()=>setCreation(null)}/>}
    {proposal&&<div className="overlay ai-diff-overlay"><section className="ai-diff-dialog" role="dialog" aria-modal="true" aria-label="Review AI edit"><header><div><h2>Review AI edit</h2><small>{proposal.snapshot.path} · {proposal.model}</small></div><button aria-label="Close AI review" onClick={()=>setProposal(null)}><X size={17}/></button></header><div className="ai-diff-body"><DiffEditor original={proposal.snapshot.original} modified={proposal.snapshot.original.slice(0,proposal.snapshot.start)+proposal.replacement+proposal.snapshot.original.slice(proposal.snapshot.end)} language={languageFor(proposal.snapshot.path)} theme={effectiveTheme||(preferences.light?'vs':'veyra')} options={{readOnly:true,renderSideBySide:true,automaticLayout:true,minimap:{enabled:false},scrollBeyondLastLine:false}}/></div>{proposalError&&<p role="alert">{proposalError}</p>}<footer><p>Applies to the editor buffer. ⌘Z to undo; ⌘S to save.</p><button className="secondary" onClick={()=>setProposal(null)}>Discard</button><button className="primary" onClick={applyProposal}>Apply edit</button></footer></section></div>}
    {modal&&<div className="overlay"><form className="dialog" onSubmit={e=>{e.preventDefault();answer(modal.input?input:modal.choices.at(-1)!);}}><h2>{modal.title}</h2><p>{modal.detail}</p>{modal.input&&<input aria-label={modal.title} autoFocus value={input} onChange={e=>setInput(e.target.value)}/>}<div>{modal.choices.map((choice,i)=><button key={choice} type="button" className={i===modal.choices.length-1?"primary":"secondary"} onClick={()=>answer(choice==="Cancel"?null:modal.input?input:choice)}>{choice}</button>)}</div></form></div>}
  </main>;
}
