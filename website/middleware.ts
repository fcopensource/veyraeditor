import {NextResponse,type NextRequest} from 'next/server';

/* Cross-site request forgery protection for account APIs (defence in depth on top of SameSite=Lax cookies):
   a state-changing request that comes from a browser page on another site is refused.
   Requests without an Origin header (the Veyra app, curl) carry no browser cookies to abuse and pass through. */
const UNSAFE=new Set(['POST','PUT','PATCH','DELETE']);

export function middleware(request:NextRequest){
  if(!UNSAFE.has(request.method))return NextResponse.next();
  const origin=request.headers.get('origin');
  if(!origin)return NextResponse.next();
  let originHost='';
  try{originHost=new URL(origin).host;}catch{/* "null" or malformed */}
  const host=request.headers.get('x-forwarded-host')||request.headers.get('host')||'';
  if(originHost&&originHost===host)return NextResponse.next();
  return NextResponse.json({error:'Cross-site requests are not allowed.'},{status:403});
}

export const config={matcher:['/api/auth/:path*','/api/account/:path*']};
