import type {Metadata} from 'next';
import {Suspense} from 'react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {DashboardClient} from '@/components/DashboardClient';
import {installers,latestRelease,releaseNotes} from '@/lib/releases';

export const metadata:Metadata={title:'Your account',robots:{index:false,follow:true}};
export const revalidate=300;

/** The notes part of a release body, without the download instructions the release workflow appends. */
const notesOf=(body:string)=>body.replace(/\r/g,'').split(/\n---\n|^## Download|\n## Download/m)[0].trim();

export default async function Dashboard(){
  const [release,notes]=await Promise.all([latestRelease(),releaseNotes(1)]);
  const files=installers(release);
  const downloads=[
    {os:'windows',label:'Windows',detail:'Installer (.exe)',href:files.windows?.browser_download_url},
    {os:'mac-arm',label:'macOS · Apple silicon',detail:'M1 and later (.dmg)',href:files.macArm?.browser_download_url},
    {os:'mac-intel',label:'macOS · Intel',detail:'Intel Macs (.dmg)',href:files.macIntel?.browser_download_url},
    {os:'linux',label:'Linux',detail:'AppImage',href:files.appImage?.browser_download_url},
  ].filter((item):item is {os:string;label:string;detail:string;href:string}=>!!item.href);
  const latest=notes[0];
  return <><Nav/><main className="page-shell account-shell"><Suspense>
    <DashboardClient version={release?.version||''} publishedAt={release?.publishedAt||''} downloads={downloads} notes={latest?notesOf(latest.body):''}/>
  </Suspense></main><Footer/></>;
}
