import {withDatabase} from '@/lib/db';
import {NextResponse} from 'next/server';
import {endSession} from '@/lib/auth';

export const POST=withDatabase(async()=>{await endSession();return NextResponse.json({ok:true});});
