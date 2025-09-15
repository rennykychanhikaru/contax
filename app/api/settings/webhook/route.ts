import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function POST(_req: NextRequest) {
  try {
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
        p_permission: 'webhooks.create'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Generate a unique webhook token
    const webhookToken = crypto.randomBytes(32).toString('hex');
    
    // Store the webhook token in the database
    const { error: dbError } = await supabase
      .from('webhook_tokens')
      .upsert({
        organization_id: member.organization_id,
        user_id: user.id,
        token: webhookToken,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: member.organization_id,
        user_id: user.id,
        action: 'create',
        resource_type: 'webhook_token',
        changes: { token_regenerated: true }
      });

    // Generate the webhook URL
    // Use WEBHOOK_BASE_URL for development with tunneling services (e.g., ngrok)
    // Falls back to NEXT_PUBLIC_APP_URL, then to the current host
    const baseUrl = process.env.WEBHOOK_BASE_URL || 
                    process.env.NEXT_PUBLIC_APP_URL || 
                    `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}`;
    const webhookUrl = `${baseUrl}/api/webhook/${member.organization_id}/${webhookToken}`;

    return NextResponse.json({ webhookUrl });
  } catch (error) {
    console.error('Error generating webhook URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate webhook URL' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
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
        p_permission: 'webhooks.read'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Fetch existing webhook token if it exists
    const { data, error } = await supabase
      .from('webhook_tokens')
      .select('token')
      .eq('organization_id', member.organization_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ webhookUrl: null });
    }

    const baseUrl = process.env.WEBHOOK_BASE_URL || 
                    process.env.NEXT_PUBLIC_APP_URL || 
                    `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}`;
    const webhookUrl = `${baseUrl}/api/webhook/${member.organization_id}/${data.token}`;

    return NextResponse.json({ webhookUrl });
  } catch (error) {
    console.error('Error fetching webhook URL:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhook URL' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
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
        p_permission: 'webhooks.delete'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Delete the webhook token
    const { error } = await supabase
      .from('webhook_tokens')
      .delete()
      .eq('organization_id', member.organization_id);

    if (error) {
      throw error;
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: member.organization_id,
        user_id: user.id,
        action: 'delete',
        resource_type: 'webhook_token',
        changes: { deleted: true }
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting webhook token:', error);
    return NextResponse.json(
      { error: 'Failed to delete webhook token' },
      { status: 500 }
    );
  }
}