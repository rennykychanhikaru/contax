import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { refreshGoogleAccessToken } from './google';

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

export interface AgentCalendarIntegration {
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: bigint | null;
  is_expired: boolean | null;
  calendar_email: string | null;
  calendar_id: string | null;
  connected: boolean | null;
}

/**
 * Get calendar tokens for a specific agent
 */
export async function getAgentCalendarTokens(agentId: string): Promise<AgentCalendarIntegration | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('get_agent_google_tokens', { p_agent_id: agentId })
    .single();

  if (error || !data) {
    console.error('Error getting agent calendar tokens:', error);
    return null;
  }

  // Check if token needs refresh
  const tokenData = data as AgentCalendarIntegration;
  if (tokenData.is_expired && tokenData.refresh_token) {
    return await refreshAgentToken(agentId, tokenData);
  }
  
  return tokenData;
}

/**
 * Refresh expired agent calendar token
 */
export async function refreshAgentToken(
  agentId: string, 
  integration: AgentCalendarIntegration
): Promise<AgentCalendarIntegration | null> {
  if (!integration.refresh_token) {
    console.error('No refresh token available for agent:', agentId);
    return null;
  }
  
  const newTokenData = await refreshGoogleAccessToken(
    integration.refresh_token,
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );
  
  if (!newTokenData) {
    console.error('Failed to refresh token for agent:', agentId);
    return null;
  }
  
  // Store updated tokens in database
  const supabase = await createClient();
  const { error } = await supabase.rpc('store_agent_google_tokens', {
    p_agent_id: agentId,
    p_access_token: newTokenData.access_token,
    p_refresh_token: (newTokenData as { refresh_token?: string }).refresh_token || integration.refresh_token,
    p_expires_in: newTokenData.expires_in,
    p_email: integration.calendar_email,
    p_calendar_id: integration.calendar_id
  });
  
  if (error) {
    console.error('Error storing refreshed tokens:', error);
    return null;
  }
  
  // Return updated tokens
  return await getAgentCalendarTokens(agentId);
}

/**
 * Store new calendar tokens for an agent
 */
export async function storeAgentCalendarTokens(
  agentId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number,
  email?: string,
  calendarId?: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('store_agent_google_tokens', {
    p_agent_id: agentId,
    p_access_token: accessToken,
    p_refresh_token: refreshToken || null,
    p_expires_in: expiresIn,
    p_email: email || null,
    p_calendar_id: calendarId || null
  });
  
  if (error) {
    console.error('Error storing agent calendar tokens:', error);
    return false;
  }
  
  return !!data;
}

/**
 * Disconnect calendar integration for an agent
 */
export async function disconnectAgentCalendar(agentId: string): Promise<boolean> {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc('disconnect_agent_google_calendar', {
    p_agent_id: agentId
  });
  
  if (error) {
    console.error('Error disconnecting agent calendar:', error);
    return false;
  }
  
  return !!data;
}

/**
 * Validate agent access for a user
 */
export async function validateAgentAccess(
  agentId: string,
  userId: string
): Promise<{ agent: unknown; organization: unknown } | null> {
  const supabase = await createClient();
  
  const { data: agent, error } = await supabase
    .from('agent_configurations')
    .select(`
      *,
      organizations!inner (
        id,
        name,
        organization_members!inner (
          user_id,
          role
        )
      )
    `)
    .eq('id', agentId)
    .eq('organizations.organization_members.user_id', userId)
    .single();
    
  if (error || !agent) {
    return null;
  }
  
  return {
    agent,
    organization: agent.organizations
  };
}

/**
 * Get agent configuration with calendar status
 */
export async function getAgentWithCalendarStatus(agentId: string) {
  const supabase = await createClient();
  
  const { data: agent, error } = await supabase
    .from('agent_configurations')
    .select(`
      id,
      name,
      google_calendar_connected,
      google_calendar_email,
      google_calendar_id,
      google_calendar_connected_at,
      google_calendar_last_sync
    `)
    .eq('id', agentId)
    .single();
    
  if (error || !agent) {
    return null;
  }
  
  return agent;
}

/**
 * List calendars for an agent
 */
export async function getAgentCalendars(agentId: string) {
  const supabase = await createClient();
  
  const { data: calendars, error } = await supabase
    .from('agent_calendars')
    .select('*')
    .eq('agent_id', agentId)
    .order('is_primary', { ascending: false })
    .order('calendar_name');
    
  if (error) {
    console.error('Error getting agent calendars:', error);
    return [];
  }
  
  return calendars || [];
}

/**
 * Store calendar list for an agent
 */
export async function storeAgentCalendars(
  agentId: string,
  calendars: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    accessRole?: string;
    backgroundColor?: string;
    foregroundColor?: string;
  }>
) {
  const supabase = await createClient();
  
  // First, delete existing calendars for this agent
  await supabase
    .from('agent_calendars')
    .delete()
    .eq('agent_id', agentId);
  
  // Insert new calendars
  const calendarRecords = calendars.map(cal => ({
    agent_id: agentId,
    calendar_id: cal.id,
    calendar_name: cal.summary,
    calendar_email: cal.id,
    is_primary: cal.primary || false,
    access_role: cal.accessRole || 'owner',
    background_color: cal.backgroundColor,
    foreground_color: cal.foregroundColor
  }));
  
  const { error } = await supabase
    .from('agent_calendars')
    .insert(calendarRecords);
    
  if (error) {
    console.error('Error storing agent calendars:', error);
    return false;
  }
  
  return true;
}
