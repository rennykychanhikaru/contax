import { NextResponse } from 'next/server';

function isHex64(v: string | undefined) {
  return !!v && /^[0-9a-fA-F]{64}$/.test(v);
}

export async function GET() {
  const env = process.env;
  return NextResponse.json({
    env: env.NODE_ENV || 'development',
    appUrl: env.NEXT_PUBLIC_APP_URL || '(not set)',
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || '(not set)',
    supabaseAnon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Not set',
    supabaseServiceRole: env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set',
    openaiKey: env.OPENAI_API_KEY ? 'Set' : 'Not set',
    twilioWsUrl: env.TWILIO_STREAM_WSS_URL ? 'Set' : 'Not set',
    encryptionKey: env.WEBHOOK_ENCRYPTION_KEY ? (isHex64(env.WEBHOOK_ENCRYPTION_KEY) ? 'Set (valid hex64)' : 'Set (invalid format)') : 'Not set',
    commit: env.VERCEL_GIT_COMMIT_SHA || '(unknown)'
  });
}

