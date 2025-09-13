import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { validateAgentAccess } from '@/lib/agent-calendar';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email'
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agent_id: string }> }
) {
  try {
    const { agent_id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch (error) {
              console.error('Error setting cookies:', error);
            }
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Validate agent access
    const agentAccess = await validateAgentAccess(agent_id, user.id);
    if (!agentAccess) {
      return NextResponse.json({ error: 'Agent not found or access denied' }, { status: 404 });
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'Google Calendar integration not configured' },
        { status: 500 }
      );
    }
    
    // Create state parameter with agent_id
    const state = Buffer.from(JSON.stringify({
      agent_id: agent_id,
      redirect_url: req.nextUrl.searchParams.get('redirect') || '/settings'
    })).toString('base64');
    
    // Build OAuth URL
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', `${baseUrl}/api/calendar/oauth/agent-callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    
    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('Error starting OAuth flow:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start OAuth flow' },
      { status: 500 }
    );
  }
}