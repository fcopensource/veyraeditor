'use client';
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ChevronDown,Download,Menu,UserRound,X} from 'lucide-react';

const links=[
  {href:'/features',label:'Features'},
  {href:'/extensions',label:'Extensions'},
  {href:'/docs',label:'Docs'},
  {href:'/blog',label:'Blog'},
  {href:'/download',label:'Download'},
  {href:'/changelog',label:'Changelog'},
  {href:'https://github.com/fcopensource/veyraeditor',label:'GitHub',external:true},
];

/** Everything Veyra makes, for the Products menu. */
const PRODUCTS:{group:string;items:{href:string;icon:string;name:string;copy:string;tag?:string}[]}[]=[
  {group:'Apps',items:[
    {href:'/download',icon:'/veyra-96.png',name:'Veyra Studio',copy:'The fast, free AI code editor'},
    {href:'/pdf',icon:'/veyra-96.png',name:'Veyra PDF',copy:'Edit, sign and merge PDFs offline',tag:'New'},
    {href:'/salesforce-studio',icon:'/salesforce-studio-icon.png',name:'Salesforce Studio',copy:'LWC, Apex and Aura in your browser'},
  ]},
  {group:'For VS Code',items:[
    {href:'/mongodb',icon:'/mongodb-icon.png',name:'Query Lens for MongoDB',copy:'Slow queries and the index that fixes them',tag:'New'},
    {href:'/env',icon:'/env-icon.png',name:'Env',copy:'.env checks, hidden secrets, in sync',tag:'New'},
    {href:'/docker',icon:'/docker-icon.png',name:'Container Studio',copy:'Docker containers, Compose and logs',tag:'New'},
    {href:'/mcp-studio',icon:'/mcp-studio-icon.png',name:'MCP Studio',copy:'Manage and test MCP servers',tag:'New'},
    {href:'/api-client',icon:'/api-client-icon.png',name:'API Client',copy:'Test any API without leaving VS Code',tag:'New'},
    {href:'/path-intellisense',icon:'/path-intellisense-icon.png',name:'Path IntelliSense',copy:'File paths, completed as you type',tag:'New'},
    {href:'/npm-intellisense',icon:'/npm-intellisense-icon.png',name:'npm IntelliSense',copy:'Autocomplete and check npm imports',tag:'New'},
    {href:'/port-manager',icon:'/port-manager-icon.png',name:'Port Manager',copy:'Free a busy port in one click'},
    {href:'/live-server',icon:'/live-server-icon-296.png',name:'Live Server',copy:'Live reload as you save'},
  ]},
];
const productPaths=PRODUCTS.flatMap(group=>group.items.map(item=>item.href));

export function Nav(){
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  const [products,setProducts]=useState(false);
  const [signedIn,setSignedIn]=useState(false);
  const productsRef=useRef<HTMLDivElement>(null);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>{setSignedIn(document.cookie.split('; ').includes('veyra-signed-in=1'));},[pathname]);
  useEffect(()=>{setOpen(false);setProducts(false);},[pathname]);
  useEffect(()=>{
    if(!open)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('keydown',close);document.body.classList.add('menu-open');
    return()=>{document.removeEventListener('keydown',close);document.body.classList.remove('menu-open');};
  },[open]);
  useEffect(()=>{
    if(!products)return;
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setProducts(false);};
    const click=(event:MouseEvent)=>{if(!productsRef.current?.contains(event.target as Node))setProducts(false);};
    document.addEventListener('keydown',key);document.addEventListener('mousedown',click);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('mousedown',click);};
  },[products]);
  // Hover opens the menu on desktop; a short delay lets the pointer cross the gap to the panel.
  const hoverOpen=()=>{clearTimeout(closeTimer.current);setProducts(true);};
  const hoverClose=()=>{clearTimeout(closeTimer.current);closeTimer.current=setTimeout(()=>setProducts(false),150);};
  const current=(href:string)=>!href.includes('#')&&!href.startsWith('http')&&pathname===href;

  return <header className={'nav'+(open?' open':'')}>
    <Link className="brand" href="/" aria-label="Veyra Studio home"><span><Image src="/veyra-96.png" width={34} height={34} alt=""/></span><b>Veyra</b><i>STUDIO</i></Link>
    <nav aria-label="Main">
      <div className={'nav-products'+(products?' open':'')} ref={productsRef} onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
        <button type="button" aria-expanded={products} aria-controls="products-menu" aria-current={productPaths.includes(pathname)?'page':undefined} onClick={()=>setProducts(value=>!value)}>Products<ChevronDown size={13}/></button>
        <div id="products-menu" className="products-panel" hidden={!products}>
          {PRODUCTS.map(group=><div key={group.group} className="products-group">
            <small>{group.group}</small>
            {group.items.map(item=><Link key={item.href+item.name} href={item.href} className="product-link" aria-current={pathname===item.href?'page':undefined}>
              <Image src={item.icon} width={36} height={36} alt=""/>
              <span><b>{item.name}{item.tag?<em>{item.tag}</em>:null}</b><small>{item.copy}</small></span>
            </Link>)}
          </div>)}
        </div>
      </div>
      {links.map(link=>link.external
        ?<a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
        :<Link key={link.href} href={link.href} aria-current={current(link.href)?'page':undefined}>{link.label}</Link>)}
    </nav>
    <div className="nav-actions">
      {signedIn
        ?<Link className="pill" href="/dashboard"><UserRound size={14}/>Account</Link>
        :<><Link className="ghost" href="/login">Log in</Link><Link className="pill" href="/register">Join the preview</Link></>}
    </div>
    <button className="nav-toggle" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={()=>setOpen(value=>!value)}>{open?<X size={20}/>:<Menu size={20}/>}</button>
    <div id="mobile-menu" className="mobile-menu" hidden={!open}>
      <div className="mobile-products">
        {PRODUCTS.map(group=><div key={group.group}>
          <small>{group.group}</small>
          {group.items.map(item=><Link key={item.href+item.name} href={item.href} onClick={()=>setOpen(false)}><Image src={item.icon} width={26} height={26} alt=""/>{item.name}{item.tag?<em>{item.tag}</em>:null}</Link>)}
        </div>)}
      </div>
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
