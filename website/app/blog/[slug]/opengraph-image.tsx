import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ImageResponse} from 'next/og';
import {allPosts,formatDate,getPost} from '@/lib/blog';

// Each article's share card: its own title, so links in search, X, LinkedIn and Slack say what the post is about.
export const alt='Veyra blog article';
export const size={width:1200,height:630};
export const contentType='image/png';
export function generateStaticParams(){return allPosts().map(post=>({slug:post.slug}));}

export default async function PostImage({params}:{params:Promise<{slug:string}>}){
  const post=getPost((await params).slug);
  const logo=`data:image/png;base64,${(await readFile(join(process.cwd(),'public','logo-512.png'))).toString('base64')}`;
  const title=post?.title||'Veyra blog';
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',background:'radial-gradient(circle at 85% 15%, #12304a 0%, #06080d 60%)',color:'#edf5f5',padding:'60px 72px',fontFamily:'sans-serif'}}>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <img src={logo} width={60} height={60} alt=""/>
        <span style={{fontSize:30,fontWeight:800}}>Veyra</span>
        <span style={{fontSize:18,letterSpacing:5,color:'#68f4d1',marginLeft:6}}>BLOG</span>
        {post&&<span style={{marginLeft:'auto',fontSize:18,color:'#68f4d1',border:'1px solid #68f4d155',borderRadius:20,padding:'6px 16px'}}>{post.category}</span>}
      </div>
      <span style={{fontSize:title.length>60?56:66,fontWeight:800,lineHeight:1.08,letterSpacing:-1.5,maxWidth:1000}}>{title}</span>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:22,color:'#9aa7b4'}}>
        <span>{post?`${formatDate(post.date)} · ${post.readingTime} min read`:''}</span>
        <span style={{color:'#68f4d1'}}>veyraeditor.com/blog</span>
      </div>
    </div>,
    size,
  );
}
