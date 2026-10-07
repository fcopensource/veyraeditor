import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowUpRight,Download} from 'lucide-react';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';import {Markdown} from '@/components/Markdown';
import {releaseNotes,RELEASES_URL} from '@/lib/releases';

export const metadata:Metadata={title:'Changelog',description:'What is new in each Veyra Studio release.'};
export const revalidate=300;

/** The notes part of a release body, without the download instructions appended by the release workflow. */
const notesOf=(body:string)=>body.replace(/\r/g,'').split(/\n---\n|^## Download|\n## Download/m)[0].trim()||'Initial release of this version. See the release files for downloads.';

export default async function Changelog(){
  const releases=await releaseNotes();
  return <><Nav/><main className="page-shell">
    <div className="page-head"><span>CHANGELOG</span><h1>What's new.</h1><p>Every Veyra release, newest first. Installed copies update themselves, so you'll always have the latest.</p></div>
    <div className="changelog">
      {releases.map((release,index)=><article key={release.version} id={'v'+release.version}>
        <aside><b>v{release.version}</b><time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'})}</time>{index===0&&<em>Latest</em>}</aside>
        <div><Markdown source={notesOf(release.body)}/><a className="text-link" href={release.url}>Release files <ArrowUpRight size={13}/></a></div>
      </article>)}
      {!releases.length&&<p className="empty-note">Release notes are temporarily unavailable. See them on <a href={RELEASES_URL}>GitHub</a>.</p>}
    </div>
    <div className="page-cta"><Link className="primary" href="/download"><Download size={16}/>Download the latest version</Link></div>
  </main><Footer/></>;
}
