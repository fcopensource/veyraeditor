import type {Metadata} from 'next';import {Suspense} from 'react';
import {AuthForm} from '@/components/AuthForm';import {AuthShell} from '@/components/AuthShell';import {authConfigured} from '@/lib/auth';import {mailConfigured} from '@/lib/mail';
export const metadata:Metadata={title:'Reset password'};
export const dynamic='force-dynamic';
export default function ForgotPassword(){
  return <AuthShell title="Reset your password." copy="Enter your account's email and we'll send you a link to choose a new password.">
    {authConfigured()&&!mailConfigured()
      ?<p className="form-notice" role="status">Password reset by email is being set up. Until then, please <a href="https://github.com/fcopensource/veyraeditor/issues">contact us</a> and we'll help you get back in.</p>
      :<Suspense><AuthForm mode="forgot" configured={authConfigured()}/></Suspense>}
  </AuthShell>;
}
