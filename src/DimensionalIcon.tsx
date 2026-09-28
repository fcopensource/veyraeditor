import {useId} from 'react';
import {languageFor} from './editor';
const palettes:Record<string,[string,string,string]>={typescript:['#85c9ff','#2861d1','TS'],javascript:['#ffe79a','#ba8e23','JS'],json:['#ffdc9d','#bd792b','{}'],python:['#9fd3ff','#3573aa','Py'],rust:['#ffb495','#a55331','Rs'],css:['#d7b9ff','#8456c9','#'],scss:['#ffb3df','#b24c8a','#'],html:['#ffb69e','#c4623e','<>'],markdown:['#c6d4ed','#5a7297','M'],go:['#97eee8','#25848f','Go']};
export function DimensionalIcon({path,directory=false,open=false}:{path:string;directory?:boolean;open?:boolean}){
  const id=useId().replace(/:/g,'');const language=languageFor(path);const [light,dark,label]=palettes[language]||['#c6cddd','#647189','·'];
  const tint=directory?(path.includes('component')?['#d2b3ff','#7654b8']:path.includes('src')||path==='app'?['#b3d9ff','#4779be']:['#ffe1a4','#b98439']):[light,dark];
  return <span className={'dimensional-icon '+(directory?'is-folder':'is-file')+(open?' is-open':'')}>
    <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false"><defs><linearGradient id={id+'face'} x1="0" y1="0" x2=".85" y2="1"><stop stopColor={tint[0]}/><stop offset="1" stopColor={tint[1]}/></linearGradient><linearGradient id={id+'edge'} x1="0" y1="0" x2="1" y2="1"><stop stopColor={tint[1]}/><stop offset="1" stopColor="#182033"/></linearGradient></defs>
    {directory?<><path d="M3 7 7 4h7l2 3h6v14l-3 2H3Z" fill={'url(#'+id+'edge)'}/><path d="M3 8V5h8l3 3h7v13H3Z" fill={tint[1]}/><path d={open?'M2 11h22l-4 11H3Z':'M3 10h19v12H3Z'} fill={'url(#'+id+'face)'} stroke={tint[0]} strokeWidth=".5"/><path d="M5 12h13" stroke="white" strokeOpacity=".4"/><path d="M5 20h13" stroke="#fff" strokeOpacity=".14"/></>:<><path d="M7 3h10l5 5v14l-3 2H5V5Z" fill={'url(#'+id+'edge)'}/><path d="M5 3h10l5 5v14H5Z" fill={'url(#'+id+'face)'} stroke={light} strokeWidth=".5"/><path d="M15 3v6h5Z" fill="#fff" fillOpacity=".4"/><path d="M7 5h6M7 20h10" stroke="#fff" strokeOpacity=".35"/><text x="12.5" y="17" fill="#102137" fontFamily="Arial,sans-serif" fontSize={label.length>1?'7':'9'} fontWeight="800" textAnchor="middle">{label}</text></>}
    </svg>{!directory&&['typescript','javascript'].includes(language)&&<span className="sr-only">{label}</span>}
  </span>;
}
