import type {Metadata} from 'next';import {Suspense} from 'react';
import {AuthForm} from '@/components/AuthForm';import {AuthShell} from '@/components/AuthShell';import {authConfigured} from '@/lib/auth';
export const metadata:Metadata={title:'Log in'};
export const dynamic='force-dynamic';
export default function Login(){return <AuthShell title="Welcome back." copy="Log in to your Veyra account."><Suspense><AuthForm mode="login" configured={authConfigured()}/></Suspense></AuthShell>}
