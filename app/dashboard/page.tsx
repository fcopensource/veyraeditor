import type {Metadata} from 'next';
import {Suspense} from 'react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {DashboardClient} from '@/components/DashboardClient';
import {installers,latestRelease} from '@/lib/releases';

export const metadata:Metadata={title:'Your account',robots:{index:false,follow:true}};
export const revalidate=300;

export default async function Dashboard(){
  const release=await latestRelease();
  const files=installers(release);
  const downloads=[
    {os:'Windows',label:'Installer (.exe)',href:files.windows?.browser_download_url},
    {os:'macOS',label:'Apple silicon (.dmg)',href:files.macArm?.browser_download_url},
    {os:'macOS',label:'Intel (.dmg)',href:files.macIntel?.browser_download_url},
    {os:'Linux',label:'AppImage',href:files.appImage?.browser_download_url},
  ].filter((item):item is {os:string;label:string;href:string}=>!!item.href);
  return <><Nav/><main className="page-shell"><Suspense><DashboardClient version={release?.version||''} downloads={downloads}/></Suspense></main><Footer/></>;
}
