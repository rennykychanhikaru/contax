import { NextRequest, NextResponse } from 'next/server';
import {
  FeatureFlagService,
  FEATURE_FLAG_TO_ADDON,
  type FeatureFlag,
} from '@/lib/feature-flags/service';
import { createClient } from '@/lib/supabase/server';
import { resolveSupabaseUser } from '@/lib/supabase/session';

type RequestBody = {
  organizationId?: string;
  feature?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const organizationId =
    typeof body.organizationId === 'string' ? body.organizationId : undefined;
  const feature = typeof body.feature === 'string' ? body.feature : undefined;

  if (!organizationId || !feature) {
    return NextResponse.json(
      { error: 'organizationId and feature are required' },
      { status: 400 },
    );
  }

  if (!(feature in FEATURE_FLAG_TO_ADDON)) {
    return NextResponse.json({ error: 'Invalid feature' }, { status: 400 });
  }

  const supabase = await createClient();
  const resolvedUser = await resolveSupabaseUser(req, supabase);

  if (!resolvedUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', resolvedUser.id)
    .eq('organization_id', organizationId)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
  }

  const featureKey = feature as FeatureFlag;

  try {
    const result = await FeatureFlagService.canUseFeature(
      organizationId,
      featureKey,
      supabase,
    );

    return NextResponse.json({
      allowed: result.allowed,
      requiresUpgrade: result.requiresUpgrade,
      reason: result.reason,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('Feature flag check failed', error);
    return NextResponse.json(
      { error: 'Feature flag evaluation failed' },
      { status: 500 },
    );
  }
}
