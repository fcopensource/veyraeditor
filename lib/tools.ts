/* Veyra's built-in tools: what installing a popular VS Code extension gives you in Veyra. The Extensions page gallery and its counts read from here. */
import {Braces,Bug,Code2,FileCode2,Paintbrush,ScanSearch,Sparkles,TerminalSquare,Wind} from 'lucide-react';

export type Category='web'|'python'|'debug'|'ai'|'preview';
export type Tool={name:string;by:string;category:Category[];copy:string;replaces:string;needs:string;tone:string;icon?:typeof Code2;image?:string;badge?:string};

export const TOOLS:Tool[]=[
  {name:'Veyra Live Server',by:'Veyra',category:['preview','web'],copy:'Go Live serves your folder at 127.0.0.1:5500. Save and the browser reloads; CSS applies without a reload.',replaces:'ritwickdey.LiveServer',needs:'Nothing',tone:'veyra',image:'/live-server-icon.png',badge:'Veyra original'},
  {name:'TypeScript & JavaScript',by:'typescript-language-server',category:['web'],copy:'Errors as you type, auto-imports, hover docs, go to definition, rename and quick fixes from your tsconfig.',replaces:'vscode.typescript-language-features',needs:'Node.js 18+',tone:'blue',icon:Braces},
  {name:'ESLint',by:'Microsoft vscode-eslint',category:['web'],copy:'Your project’s lint rules as you type, with quick fixes and “fix all”.',replaces:'dbaeumer.vscode-eslint',needs:'Node.js 18+',tone:'violet',icon:ScanSearch},
  {name:'Prettier',by:'Prettier',category:['web'],copy:'Format Document or format on save, with your project’s Prettier version and config.',replaces:'esbenp.prettier-vscode',needs:'Node.js 18+',tone:'pink',icon:Paintbrush},
  {name:'Tailwind CSS IntelliSense',by:'Tailwind Labs',category:['web'],copy:'Class completion, hover previews of the generated CSS, colour swatches and linting.',replaces:'bradlc.vscode-tailwindcss',needs:'Node.js 18+',tone:'cyan',icon:Wind},
  {name:'Emmet',by:'olrtg/emmet-language-server',category:['web'],copy:'Type ul>li*3 or div.card and expand it into full markup and styles.',replaces:'vscode.emmet',needs:'Node.js 18+',tone:'green',icon:Sparkles},
  {name:'Svelte',by:'Svelte',category:['web'],copy:'Diagnostics, completions and go to definition for .svelte components.',replaces:'svelte.svelte-vscode',needs:'Node.js 18+',tone:'orange',icon:FileCode2},
  {name:'Vue (Volar)',by:'Vue',category:['web'],copy:'Template, script and style support for .vue single-file components.',replaces:'vue.volar',needs:'Node.js 18+',tone:'green',icon:FileCode2,badge:'Beta'},
  {name:'Python (Pyright)',by:'Microsoft Pyright',category:['python'],copy:'Type checking, errors as you type, completions and go to definition, using your virtual environment.',replaces:'ms-python.vscode-pylance',needs:'Node.js 18+',tone:'yellow',icon:Code2},
  {name:'Python Debugger',by:'Microsoft debugpy',category:['python','debug'],copy:'Breakpoints, stepping, variables, watch, call stack and a Debug Console. Press F5.',replaces:'ms-python.debugpy',needs:'Python 3.8+',tone:'red',icon:Bug},
  {name:'Claude Code',by:'Anthropic',category:['ai'],copy:'Anthropic’s coding agent, installed with its official installer and opened in your project’s terminal.',replaces:'anthropic.claude-code',needs:'Claude account',tone:'coral',icon:TerminalSquare},
];
export const FILTERS:[Category|'all',string][]=[['all','All'],['web','Web development'],['python','Python'],['debug','Debugging'],['ai','AI & terminal'],['preview','Live preview']];

