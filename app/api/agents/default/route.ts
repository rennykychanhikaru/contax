import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// GET - Get the default agent for the user's organization
export async function GET() {
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

  try {
    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, organization:organizations(id, name)')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Get the default agent settings for the organization
    const { data: agent, error } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('organization_id', member.organization_id)
      .eq('name', 'default')
      .single();

    if (error || !agent) {
      console.error('Error fetching agent:', error);
      return NextResponse.json({ error: 'No agent configuration found' }, { status: 404 });
    }

    // Fix webhook URL if it has the wrong format
    if (agent.webhook_token && (!agent.webhook_url || !agent.webhook_url.endsWith('/trigger-call'))) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      agent.webhook_url = `${baseUrl}/api/webhook/agent/${agent.webhook_token}/trigger-call`;

      // Update the database with the corrected URL
      await supabase
        .from('agent_configurations')
        .update({ webhook_url: agent.webhook_url })
        .eq('id', agent.id);
    }

    return NextResponse.json({
      agent,
      organization: member.organization
    });
  } catch (error) {
    console.error('Error fetching default agent:', error);
    return NextResponse.json({ error: 'Failed to fetch default agent' }, { status: 500 });
  }
}

// POST - Save or update the default agent settings
export async function POST(_req: NextRequest) {
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

  try {
    const body = await req.json();
    const { display_name, prompt, greeting, voice, language, temperature, max_tokens, webhook_enabled } = body;

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // First, check if a default agent configuration exists
    const { data: existingAgent } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('organization_id', member.organization_id)
      .eq('name', 'default')
      .single();

    interface AgentData {
      organization_id: string;
      name: string;
      display_name: string;
      prompt: string;
      greeting: string;
      voice: string;
      language: string;
      temperature: number;
      max_tokens: number;
      webhook_enabled: boolean;
      updated_at: string;
      webhook_token?: string;
      webhook_url?: string;
    }

    const agentData: AgentData = {
      organization_id: member.organization_id,
      name: 'default',
      display_name: display_name || 'AI Assistant',
      prompt: prompt || 'You are a helpful scheduling assistant.',
      greeting: greeting || 'Hi! Thanks for calling. How can I help you today?',
      voice: voice || 'sage',
      language: language || 'en-US',
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 500,
      webhook_enabled: webhook_enabled || false,
      updated_at: new Date().toISOString()
    };
    
    // Generate webhook token if enabling webhook for the first time
    if (webhook_enabled && !existingAgent?.webhook_token) {
      const { data: tokenResult } = await supabase
        .rpc('generate_webhook_token');
      if (tokenResult) {
        agentData.webhook_token = tokenResult;
        // Generate the webhook URL with correct path
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
        agentData.webhook_url = `${baseUrl}/api/webhook/agent/${tokenResult}/trigger-call`;
      }
    } else if (existingAgent?.webhook_token && !existingAgent?.webhook_url) {
      // Fix webhook URL if token exists but URL is missing
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
      agentData.webhook_url = `${baseUrl}/api/webhook/agent/${existingAgent.webhook_token}/trigger-call`;
    }

    let result;
    
    if (existingAgent) {
      // Update existing configuration
      interface UpdateData {
        updated_at: string;
        display_name?: string;
        prompt?: string;
        greeting?: string;
        voice?: string;
        language?: string;
        temperature?: number;
        max_tokens?: number;
        webhook_enabled?: boolean;
        webhook_token?: string;
        webhook_url?: string;
      }

      const updateData: UpdateData = {
        updated_at: new Date().toISOString()
      };

      if (display_name !== undefined) updateData.display_name = display_name || 'AI Assistant';
      if (prompt !== undefined) updateData.prompt = prompt;
      if (greeting !== undefined) updateData.greeting = greeting;
      if (voice !== undefined) updateData.voice = voice || 'sage';
      if (language !== undefined) updateData.language = language || 'en-US';
      if (temperature !== undefined) updateData.temperature = temperature || 0.7;
      if (max_tokens !== undefined) updateData.max_tokens = max_tokens || 500;
      if (webhook_enabled !== undefined) updateData.webhook_enabled = webhook_enabled;
      
      // Generate webhook token if enabling webhook for the first time
      if (webhook_enabled && !existingAgent.webhook_token) {
        const { data: tokenResult } = await supabase
          .rpc('generate_webhook_token');
        if (tokenResult) {
          updateData.webhook_token = tokenResult;
          // Generate the webhook URL with correct path
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
          updateData.webhook_url = `${baseUrl}/api/webhook/agent/${tokenResult}/trigger-call`;
        }
      } else if (webhook_enabled && existingAgent.webhook_token && !existingAgent.webhook_url) {
        // Fix webhook URL if token exists but URL is missing
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
        updateData.webhook_url = `${baseUrl}/api/webhook/agent/${existingAgent.webhook_token}/trigger-call`;
      }
      
      result = await supabase
        .from('agent_configurations')
        .update(updateData)
        .eq('organization_id', member.organization_id)
        .eq('name', 'default')
        .select()
        .single();
    } else {
      // Create new configuration
      result = await supabase
        .from('agent_configurations')
        .insert(agentData)
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({ 
      success: true,
      agent: result.data
    });
  } catch (error) {
    console.error('Error saving agent settings:', error);
    return NextResponse.json({ error: 'Failed to save agent settings' }, { status: 500 });
  }
}