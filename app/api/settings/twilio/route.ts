import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// GET - Retrieve Twilio configuration
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
            // Handle error
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
        p_permission: 'twilio.read'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Check if organization has Twilio settings in the database
    const { data, error } = await supabase
      .from('twilio_settings')
      .select('account_sid, phone_number, auth_token')
      .eq('organization_id', member.organization_id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }

    if (!data) {
      return NextResponse.json({ 
        accountSid: '',
        phoneNumber: '',
        authToken: ''
      });
    }

    // Mask the auth token for security
    const maskedAuthToken = data.auth_token ? '********************************' : '';

    return NextResponse.json({
      accountSid: data.account_sid || '',
      phoneNumber: data.phone_number || '',
      authToken: maskedAuthToken
    });
  } catch (error) {
    console.error('Error fetching Twilio settings:', error);
    return NextResponse.json({ error: 'Failed to fetch Twilio settings' }, { status: 500 });
  }
}

// POST - Save or update Twilio configuration
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
            // Handle error
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
    const { accountSid, authToken, phoneNumber } = body;

    if (!accountSid || !authToken || !phoneNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate Twilio Account SID format
    if (!accountSid.startsWith('AC') || accountSid.length !== 34) {
      return NextResponse.json({ error: 'Invalid Account SID format' }, { status: 400 });
    }

    // Validate phone number format (basic check)
    if (!phoneNumber.startsWith('+')) {
      return NextResponse.json({ error: 'Phone number must include country code (e.g., +1234567890)' }, { status: 400 });
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
        p_permission: 'twilio.write'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Check if settings already exist for this organization
    const { data: existing } = await supabase
      .from('twilio_settings')
      .select('id')
      .eq('organization_id', member.organization_id)
      .single();

    let result;
    
    if (existing) {
      // Update existing settings
      interface UpdateData {
      updated_at: string;
      phone_number?: string;
      account_sid?: string;
      auth_token?: string;
      webhook_url?: string;
      webhook_method?: string;
      status_callback_url?: string;
      voice_url?: string;
      sms_url?: string;
      is_active?: boolean;
    }

    const updateData: UpdateData = {
        account_sid: accountSid,
        phone_number: phoneNumber,
        updated_at: new Date().toISOString()
      };
      
      // Only update auth_token if it's not the masked value
      if (authToken !== '********************************') {
        updateData.auth_token = authToken;
      }
      
      result = await supabase
        .from('twilio_settings')
        .update(updateData)
        .eq('organization_id', member.organization_id);
    } else {
      // Insert new settings
      result = await supabase
        .from('twilio_settings')
        .insert({
          organization_id: member.organization_id,
          user_id: user.id,
          account_sid: accountSid,
          auth_token: authToken,
          phone_number: phoneNumber
        });
    }

    if (result.error) {
      throw result.error;
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: member.organization_id,
        user_id: user.id,
        action: existing ? 'update' : 'create',
        resource_type: 'twilio_settings',
        resource_id: existing?.id,
        changes: { 
          account_sid: accountSid,
          phone_number: phoneNumber,
          auth_token_updated: authToken !== '********************************'
        }
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving Twilio settings:', error);
    return NextResponse.json({ error: 'Failed to save Twilio settings' }, { status: 500 });
  }
}

// DELETE - Remove Twilio configuration
export async function DELETE() {
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
            // Handle error
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
        p_permission: 'twilio.write'
      });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { error } = await supabase
      .from('twilio_settings')
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
        resource_type: 'twilio_settings',
        changes: { deleted: true }
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting Twilio settings:', error);
    return NextResponse.json({ error: 'Failed to delete Twilio settings' }, { status: 500 });
  }
}