import type {Metadata} from 'next';import {Suspense} from 'react';
import {AuthForm} from '@/components/AuthForm';import {AuthShell} from '@/components/AuthShell';import {authConfig} from '@/lib/auth';
export const metadata:Metadata={title:'Reset password'};
export const dynamic='force-dynamic';
export default function ForgotPassword(){return <AuthShell title="Reset your password." copy="Enter your account's email and we'll send you a link to choose a new password."><Suspense><AuthForm mode="forgot" configured={!!authConfig()}/></Suspense></AuthShell>}
