import type {Metadata} from 'next';
import {AuthShell} from '@/components/AuthShell';import {AuthCallback} from '@/components/AuthCallback';
export const metadata:Metadata={title:'Signing you in'};
export default function Callback(){return <AuthShell title="One moment…" copy="Finishing up with the link from your email."><AuthCallback/></AuthShell>}
