import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { storeAgentCalendarTokens, validateAgentAccess, storeAgentCalendars } from '@/lib/agent-calendar';
import { listCalendars } from '@/lib/google';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function GET() {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');
    const error = req.nextUrl.searchParams.get('error');
    
    // Handle OAuth errors
    if (error) {
      const errorUrl = new URL('/settings', req.nextUrl.origin);
      errorUrl.searchParams.set('error', `OAuth error: ${error}`);
      return NextResponse.redirect(errorUrl.toString());
    }
    
    if (!code || !state) {
      const errorUrl = new URL('/settings', req.nextUrl.origin);
      errorUrl.searchParams.set('error', 'Missing authorization code or state');
      return NextResponse.redirect(errorUrl.toString());
    }
    
    // Decode state to get agent_id and redirect URL
    let stateData: { agent_id: string; redirect_url: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      const errorUrl = new URL('/settings', req.nextUrl.origin);
      errorUrl.searchParams.set('error', 'Invalid state parameter');
      return NextResponse.redirect(errorUrl.toString());
    }
    
    // Authenticate user
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
      const errorUrl = new URL('/auth/sign-in', req.nextUrl.origin);
      errorUrl.searchParams.set('redirect', req.url);
      return NextResponse.redirect(errorUrl.toString());
    }
    
    // Validate agent access using agent_id from state
    const agentAccess = await validateAgentAccess(stateData.agent_id, user.id);
    if (!agentAccess) {
      const errorUrl = new URL('/settings', req.nextUrl.origin);
      errorUrl.searchParams.set('error', 'Agent not found or access denied');
      return NextResponse.redirect(errorUrl.toString());
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    
    if (!clientId || !clientSecret) {
      const errorUrl = new URL('/settings', req.nextUrl.origin);
      errorUrl.searchParams.set('error', 'Google Calendar integration not configured');
      return NextResponse.redirect(errorUrl.toString());
    }
    
    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/calendar/oauth/agent-callback`,
        grant_type: 'authorization_code',
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      const errorUrl = new URL(stateData.redirect_url, req.nextUrl.origin);
      errorUrl.searchParams.set('error', 'Failed to exchange authorization code');
      return NextResponse.redirect(errorUrl.toString());
    }
    
    const tokenData = await tokenResponse.json();
    
    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    
    let userEmail = null;
    let primaryCalendarId = null;
    
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      userEmail = userInfo.email;
      primaryCalendarId = userInfo.email; // Primary calendar is usually the email
    }
    
    // Store tokens in database for the agent
    const stored = await storeAgentCalendarTokens(
      stateData.agent_id,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.expires_in,
      userEmail,
      primaryCalendarId
    );
    
    if (!stored) {
      const errorUrl = new URL(stateData.redirect_url, req.nextUrl.origin);
      errorUrl.searchParams.set('error', 'Failed to store calendar tokens');
      return NextResponse.redirect(errorUrl.toString());
    }
    
    // Fetch and store calendar list
    try {
      const calendars = await listCalendars(tokenData.access_token);
      if (calendars && calendars.length > 0) {
        await storeAgentCalendars(stateData.agent_id, calendars);
      }
    } catch (error) {
      console.error('Failed to fetch calendar list:', error);
    }
    
    // Redirect to settings with success message
    const successUrl = new URL(stateData.redirect_url, req.nextUrl.origin);
    successUrl.searchParams.set('success', 'Calendar connected successfully');
    successUrl.searchParams.set('agent_id', stateData.agent_id);
    return NextResponse.redirect(successUrl.toString());
  } catch (error) {
    console.error('OAuth callback error:', error);
    const errorUrl = new URL('/settings', req.nextUrl.origin);
    errorUrl.searchParams.set('error', error instanceof Error ? error.message : 'OAuth callback failed');
    return NextResponse.redirect(errorUrl.toString());
  }
}