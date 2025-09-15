import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// GET - List all agents for the user's organization
export async function GET() {
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
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Get all agents for the organization
    const { data: agents, error } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('organization_id', member.organization_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

// POST - Create a new agent
export async function POST(_req: NextRequest) {
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
    const { name, description, system_prompt, greeting_message, voice_settings, is_default } = body;

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Check permission
    const { data: hasPermission } = await supabase
      .rpc('has_permission', {
        p_user_id: user.id,
        p_org_id: member.organization_id,
        p_permission: 'agents.create'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // If setting as default, unset other defaults
    if (is_default) {
      await supabase
        .from('agent_configurations')
        .update({ is_default: false })
        .eq('organization_id', member.organization_id);
    }

    // Create the agent
    const { data: agent, error } = await supabase
      .from('agent_configurations')
      .insert({
        organization_id: member.organization_id,
        name,
        description,
        system_prompt,
        greeting_message,
        voice_settings: voice_settings || { language: 'en-US', voice: 'default' },
        is_default: is_default || false,
        created_by: user.id,
        updated_by: user.id
      })
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: member.organization_id,
        user_id: user.id,
        action: 'create',
        resource_type: 'agent',
        resource_id: agent.id,
        changes: { created: agent }
      });

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}

// PUT - Update an agent
export async function PUT(_req: NextRequest) {
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
    const { id, name, description, system_prompt, greeting_message, voice_settings, is_default, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Check permission
    const { data: hasPermission } = await supabase
      .rpc('has_permission', {
        p_user_id: user.id,
        p_org_id: member.organization_id,
        p_permission: 'agents.update'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the old agent data for audit log
    const { data: oldAgent } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single();

    if (!oldAgent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults
    if (is_default && !oldAgent.is_default) {
      await supabase
        .from('agent_configurations')
        .update({ is_default: false })
        .eq('organization_id', member.organization_id)
        .neq('id', id);
    }

    // Update the agent
    interface UpdateData {
      updated_by: string;
      updated_at: string;
      name?: string;
      description?: string;
      system_prompt?: string;
      greeting_message?: string;
      voice_settings?: Record<string, unknown>;
      is_default?: boolean;
      is_active?: boolean;
    }

    const updateData: UpdateData = {
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
    if (greeting_message !== undefined) updateData.greeting_message = greeting_message;
    if (voice_settings !== undefined) updateData.voice_settings = voice_settings;
    if (is_default !== undefined) updateData.is_default = is_default;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: agent, error } = await supabase
      .from('agent_configurations')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: member.organization_id,
        user_id: user.id,
        action: 'update',
        resource_type: 'agent',
        resource_id: agent.id,
        changes: { before: oldAgent, after: agent }
      });

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}

// DELETE - Delete an agent
export async function DELETE(_req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('id');

  if (!agentId) {
    return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
  }

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
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Check permission
    const { data: hasPermission } = await supabase
      .rpc('has_permission', {
        p_user_id: user.id,
        p_org_id: member.organization_id,
        p_permission: 'agents.delete'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the agent data for audit log
    const { data: agent } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('id', agentId)
      .eq('organization_id', member.organization_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Don't delete the default agent if it's the only one
    if (agent.is_default) {
      const { count } = await supabase
        .from('agent_configurations')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', member.organization_id);

      if (count === 1) {
        return NextResponse.json({ error: 'Cannot delete the only agent' }, { status: 400 });
      }
    }

    // Delete the agent
    const { error } = await supabase
      .from('agent_configurations')
      .delete()
      .eq('id', agentId)
      .eq('organization_id', member.organization_id);

    if (error) throw error;

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: member.organization_id,
        user_id: user.id,
        action: 'delete',
        resource_type: 'agent',
        resource_id: agentId,
        changes: { deleted: agent }
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
  }
}