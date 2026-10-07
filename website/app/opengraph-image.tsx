import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ImageResponse} from 'next/og';

// The card shown when veyraeditor.com is shared on X, LinkedIn, Slack, WhatsApp and in some search results.
export const alt='Veyra: the fast, local-first AI code editor for Windows, macOS and Linux';
export const size={width:1200,height:630};
export const contentType='image/png';

export default async function OpenGraphImage(){
  const logo=`data:image/png;base64,${(await readFile(join(process.cwd(),'public','logo-512.png'))).toString('base64')}`;
  const code=['async function ship(idea) {','  const plan = await veyra.ai.plan(idea);','  const patch = await plan.write({ review: true });','  return deploy(patch); // 42 tests passed','}'];
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',background:'radial-gradient(circle at 80% 20%, #12304a 0%, #06080d 55%)',color:'#edf5f5',padding:'64px 72px',fontFamily:'sans-serif'}}>
      <div style={{display:'flex',flexDirection:'column',justifyContent:'space-between',width:'58%'}}>
        <div style={{display:'flex',alignItems:'center',gap:18}}>
          <img src={logo} width={76} height={76} alt=""/>
          <div style={{display:'flex',flexDirection:'column'}}><span style={{fontSize:40,fontWeight:800}}>Veyra</span><span style={{fontSize:18,letterSpacing:6,color:'#68f4d1'}}>STUDIO</span></div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <span style={{fontSize:64,fontWeight:800,lineHeight:1.02,letterSpacing:-2}}>The fast, local-first AI code editor</span>
          <span style={{fontSize:26,color:'#9aa7b4'}}>Free & open source · Windows · macOS · Linux</span>
        </div>
        <span style={{fontSize:22,color:'#68f4d1'}}>veyraeditor.com</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',marginLeft:'auto',alignSelf:'center',width:420,borderRadius:18,border:'1px solid #68f4d155',background:'#0d131cee',boxShadow:'0 30px 80px #000'}}>
        <div style={{display:'flex',gap:8,padding:'14px 18px',borderBottom:'1px solid #ffffff14'}}>
          <div style={{width:12,height:12,borderRadius:6,background:'#ff5f57'}}/><div style={{width:12,height:12,borderRadius:6,background:'#febc2e'}}/><div style={{width:12,height:12,borderRadius:6,background:'#28c840'}}/>
        </div>
        <div style={{display:'flex',flexDirection:'column',padding:'18px 20px',gap:8,fontSize:17,fontFamily:'monospace'}}>
          {code.map((line,i)=><span key={i} style={{color:i===0||i===4?'#c6a3f4':i===3?'#a6d9af':'#d8e4ee',whiteSpace:'pre'}}>{line}</span>)}
        </div>
      </div>
    </div>,
    size,
  );
}
