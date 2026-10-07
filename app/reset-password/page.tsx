import type {Metadata} from 'next';import {Suspense} from 'react';
import {AuthShell} from '@/components/AuthShell';import {ResetPasswordForm} from '@/components/ResetPasswordForm';
export const metadata:Metadata={title:'Choose a new password',robots:{index:false}};
export default function ResetPassword(){return <AuthShell title="Choose a new password." copy="Pick something you haven't used for Veyra before."><Suspense><ResetPasswordForm/></Suspense></AuthShell>}
