import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

export const FEATURE_FLAG_TO_ADDON = {
  elevenlabs_voices: 'elevenlabs_voices',
  advanced_analytics: 'advanced_analytics',
  custom_webhooks: 'custom_webhooks',
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAG_TO_ADDON;

export type FeatureFlagResult = {
  enabled: boolean;
  reason: 'global' | 'organization' | 'disabled';
  metadata?: Record<string, unknown>;
};

export type FeatureGateResult = {
  allowed: boolean;
  reason: string;
  requiresUpgrade: boolean;
  metadata?: Record<string, unknown>;
};

function normalizeMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as Record<string, unknown>;
}

async function getClient(): Promise<SupabaseClient<Database>> {
  return createClient();
}

export class FeatureFlagService {
  static async isEnabled(
    organizationId: string,
    featureName: FeatureFlag,
    client?: SupabaseClient<Database>,
  ): Promise<FeatureFlagResult> {
    const supabase = client ?? (await getClient());

    const { data: flag, error: flagError } = await supabase
      .from('feature_flags')
      .select('id, is_enabled')
      .eq('flag_key', featureName)
      .maybeSingle();

    if (flagError) {
      throw new Error(
        `Failed to load feature flag "${featureName}": ${flagError.message}`,
      );
    }

    if (!flag) {
      return { enabled: false, reason: 'disabled' };
    }

    const { data: override, error: overrideError } = await supabase
      .from('organization_feature_flags')
      .select('enabled, metadata')
      .eq('organization_id', organizationId)
      .eq('feature_flag_id', flag.id)
      .maybeSingle();

    if (overrideError) {
      throw new Error(
        `Failed to load organization feature flag override: ${overrideError.message}`,
      );
    }

    if (override) {
      return {
        enabled: override.enabled,
        reason: 'organization',
        metadata: normalizeMetadata(override.metadata),
      };
    }

    return {
      enabled: Boolean(flag.is_enabled),
      reason: 'global',
    };
  }

  static async hasActiveSubscription(
    organizationId: string,
    addonType: string,
    client?: SupabaseClient<Database>,
  ): Promise<boolean> {
    const supabase = client ?? (await getClient());

    const { data, error } = await supabase
      .from('subscription_addons')
      .select('billing_status, trial_ends_at')
      .eq('organization_id', organizationId)
      .eq('addon_type', addonType)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to load subscription addon "${addonType}": ${error.message}`,
      );
    }

    if (!data) return false;

    if (data.billing_status === 'trial') {
      if (!data.trial_ends_at) return true;
      return new Date(data.trial_ends_at).getTime() > Date.now();
    }

    if (data.billing_status === 'paid') {
      return true;
    }

    return false;
  }

  static async canUseFeature(
    organizationId: string,
    featureName: FeatureFlag,
    client?: SupabaseClient<Database>,
  ): Promise<FeatureGateResult> {
    const supabase = client ?? (await getClient());
    const flagResult = await this.isEnabled(organizationId, featureName, supabase);

    if (!flagResult.enabled) {
      return {
        allowed: false,
        reason: 'Feature not available',
        requiresUpgrade: false,
        metadata: flagResult.metadata,
      };
    }

    const addonType = FEATURE_FLAG_TO_ADDON[featureName];

    if (!addonType) {
      return {
        allowed: true,
        reason: 'Enabled',
        requiresUpgrade: false,
        metadata: flagResult.metadata,
      };
    }

    const hasSubscription = await this.hasActiveSubscription(
      organizationId,
      addonType,
      supabase,
    );

    if (!hasSubscription) {
      return {
        allowed: false,
        reason: 'Subscription required',
        requiresUpgrade: true,
        metadata: flagResult.metadata,
      };
    }

    return {
      allowed: true,
      reason: 'Active subscription',
      requiresUpgrade: false,
      metadata: flagResult.metadata,
    };
  }
}
