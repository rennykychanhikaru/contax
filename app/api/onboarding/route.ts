import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const { organizationName } = await request.json();
  
  if (!organizationName?.trim()) {
    return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
  }

  // Admin client for trusted server-side writes (service role)
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!adminKey) {
    return NextResponse.json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, adminKey);

  // Get authenticated user (from Authorization header access token)
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : undefined;

  const supabaseAnon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  let userId: string | null = null;
  if (token) {
    const userResp = await supabaseAnon.auth.getUser(token);
    userId = userResp.data?.user?.id ?? null;
  }
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if user already has an organization
    const { data: existingMembership } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .single();

    if (existingMembership) {
      return NextResponse.json({ success: true, message: 'Organization already exists' });
    }

    // Create organization
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({
        name: organizationName.trim(),
        timezone: 'America/New_York',
        business_hours: {
          monday: { start: '09:00', end: '17:00', enabled: true },
          tuesday: { start: '09:00', end: '17:00', enabled: true },
          wednesday: { start: '09:00', end: '17:00', enabled: true },
          thursday: { start: '09:00', end: '17:00', enabled: true },
          friday: { start: '09:00', end: '17:00', enabled: true },
          saturday: { start: '09:00', end: '17:00', enabled: false },
          sunday: { start: '09:00', end: '17:00', enabled: false }
        },
        settings: {
          allowBooking: true,
          bufferTime: 15,
          maxAdvanceBooking: 30
        }
      })
      .select()
      .single();

    if (orgError) {
      console.error('Error creating organization:', orgError);
      return NextResponse.json({ error: `Failed to create organization: ${orgError.message}` }, { status: 500 });
    }

    // Add user as owner
    const { error: memberError } = await admin
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: userId,
        role: 'owner'
      });

    if (memberError) {
      console.error('Error adding user to organization:', memberError);
      return NextResponse.json({ error: `Failed to add user to organization: ${memberError.message}` }, { status: 500 });
    }

    // Mark user as onboarded
    await admin
      .from('users')
      .update({ onboarded: true })
      .eq('id', userId);

    return NextResponse.json({ success: true, organization: org });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
