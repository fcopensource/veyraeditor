import type {Metadata} from 'next';import {AuthForm} from '@/components/AuthForm';import {AuthShell} from '@/components/AuthShell';
export const metadata:Metadata={title:'Log in'};export default function Login(){return <AuthShell title="Welcome back." copy="Continue to your Veyra account and preview downloads."><AuthForm mode="login"/></AuthShell>}
