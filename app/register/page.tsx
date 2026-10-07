import type {Metadata} from 'next';import {Suspense} from 'react';
import {AuthForm} from '@/components/AuthForm';import {AuthShell} from '@/components/AuthShell';import {authConfig} from '@/lib/auth';
export const metadata:Metadata={title:'Create account'};
export const dynamic='force-dynamic';
export default function Register(){return <AuthShell title="Join the preview." copy="Create your Veyra account. We never sell your data or upload your source code."><Suspense><AuthForm mode="register" configured={!!authConfig()}/></Suspense></AuthShell>}
