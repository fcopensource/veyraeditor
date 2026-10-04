import type {Metadata} from 'next';import {AuthForm} from '@/components/AuthForm';import {AuthShell} from '@/components/AuthShell';
export const metadata:Metadata={title:'Create account'};export default function Register(){return <AuthShell title="Join the preview." copy="Create your Veyra account. We will never sell your data or upload your source code."><AuthForm mode="register"/></AuthShell>}
