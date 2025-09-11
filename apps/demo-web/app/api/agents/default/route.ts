import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// GET - Get the default agent for the user's organization
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
      .select('organization_id, organization:organizations(id, name, slug)')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Get the default agent settings for the organization
    let { data: agent, error } = await supabase
      .from('agent_settings')
      .select('*')
      .eq('organization_id', member.organization_id)
      .eq('name', 'default')
      .single();

    // If no agent settings exist, return default values
    if (!agent) {
      agent = {
        name: 'default',
        display_name: 'AI Assistant',
        prompt: 'You are a helpful scheduling assistant for Renny\'s office. You can help callers check calendar availability, schedule meetings, and provide information about available time slots. Be professional, friendly, and efficient in your responses.',
        greeting: 'Hi! Thanks for calling. I\'m your AI assistant. How can I help you today?',
        language: 'en',
        temperature: 0.7,
        max_tokens: 150
      };
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
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
    const { display_name, prompt, greeting, language, temperature, max_tokens, phone_call_enabled, email_enabled, sms_enabled } = body;

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Check if agent settings already exist
    const { data: existing } = await supabase
      .from('agent_settings')
      .select('id')
      .eq('organization_id', member.organization_id)
      .eq('name', 'default')
      .single();

    let result;
    
    if (existing) {
      // Build update object with only provided fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      
      if (display_name !== undefined) updateData.display_name = display_name || 'AI Assistant';
      if (prompt !== undefined) updateData.prompt = prompt;
      if (greeting !== undefined) updateData.greeting = greeting || null;
      if (language !== undefined) updateData.language = language || 'en';
      if (temperature !== undefined) updateData.temperature = temperature || 0.7;
      if (max_tokens !== undefined) updateData.max_tokens = max_tokens || 150;
      if (phone_call_enabled !== undefined) updateData.phone_call_enabled = phone_call_enabled;
      if (email_enabled !== undefined) updateData.email_enabled = email_enabled;
      if (sms_enabled !== undefined) updateData.sms_enabled = sms_enabled;
      
      // Update existing settings
      result = await supabase
        .from('agent_settings')
        .update(updateData)
        .eq('organization_id', member.organization_id)
        .eq('name', 'default')
        .select()
        .single();
    } else {
      // Insert new settings - prompt is required for new records
      if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required for new agent settings' }, { status: 400 });
      }
      
      result = await supabase
        .from('agent_settings')
        .insert({
          organization_id: member.organization_id,
          name: 'default',
          display_name: display_name || 'AI Assistant',
          prompt,
          greeting: greeting || null,
          language: language || 'en',
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 150,
          phone_call_enabled: phone_call_enabled !== undefined ? phone_call_enabled : true,
          email_enabled: email_enabled !== undefined ? email_enabled : false,
          sms_enabled: sms_enabled !== undefined ? sms_enabled : false,
          created_by: user.id
        })
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