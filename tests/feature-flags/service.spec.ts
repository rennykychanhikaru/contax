import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Database } from '@/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { FeatureFlagService } from '@/lib/feature-flags/service';

type MaybeSingleResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type QueryResponse<T> = {
  select: Mock;
  eq: Mock;
  maybeSingle: Mock<[void], Promise<MaybeSingleResult<T>>>;
};

type SupabaseOverrides = {
  featureFlag?: MaybeSingleResult<{ id: string; is_enabled: boolean }>;
  organizationFeature?: MaybeSingleResult<{ enabled: boolean; metadata?: Record<string, unknown> | null }>;
  addon?: MaybeSingleResult<{ billing_status: string | null; trial_ends_at: string | null }>;
};

function createQueryMock<T>(result: MaybeSingleResult<T>): QueryResponse<T> {
  const query: Partial<QueryResponse<T>> = {};

  query.select = vi.fn().mockReturnValue(query);
  query.eq = vi.fn().mockReturnValue(query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);

  return query as QueryResponse<T>;
}

function createSupabaseMock(overrides: SupabaseOverrides = {}) {
  const featureFlagQuery = createQueryMock(
    overrides.featureFlag ?? { data: null, error: null },
  );
  const organizationFeatureQuery = createQueryMock(
    overrides.organizationFeature ?? { data: null, error: null },
  );
  const subscriptionAddonQuery = createQueryMock(
    overrides.addon ?? { data: null, error: null },
  );

  const supabase = {
    from: vi.fn((table: string) => {
      switch (table) {
        case 'feature_flags':
          return featureFlagQuery;
        case 'organization_feature_flags':
          return organizationFeatureQuery;
        case 'subscription_addons':
          return subscriptionAddonQuery;
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    }),
  };

  return supabase as unknown as SupabaseClient<Database>;
}

const mockCreateClient = createClient as unknown as Mock;

describe('FeatureFlagService', () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  describe('isEnabled', () => {
    it('returns disabled when flag not present', async () => {
      const supabase = createSupabaseMock();

      const result = await FeatureFlagService.isEnabled(
        'org-1',
        'elevenlabs_voices',
        supabase,
      );

      expect(result).toEqual({ enabled: false, reason: 'disabled' });
    });

    it('returns organization override when present', async () => {
      const supabase = createSupabaseMock({
        featureFlag: { data: { id: 'flag-1', is_enabled: false }, error: null },
        organizationFeature: {
          data: {
            enabled: true,
            metadata: { tier: 'pro' },
          },
          error: null,
        },
      });

      const result = await FeatureFlagService.isEnabled(
        'org-2',
        'elevenlabs_voices',
        supabase,
      );

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('organization');
      expect(result.metadata).toEqual({ tier: 'pro' });
    });

    it('falls back to global flag when no override', async () => {
      const supabase = createSupabaseMock({
        featureFlag: { data: { id: 'flag-2', is_enabled: true }, error: null },
      });

      const result = await FeatureFlagService.isEnabled(
        'org-3',
        'elevenlabs_voices',
        supabase,
      );

      expect(result).toEqual({ enabled: true, reason: 'global' });
    });

    it('returns metadata only when object-like', async () => {
      const supabase = createSupabaseMock({
        featureFlag: { data: { id: 'flag-3', is_enabled: false }, error: null },
        organizationFeature: {
          data: {
            enabled: true,
            metadata: 'not-json',
          } as unknown as { enabled: boolean; metadata?: Record<string, unknown> | null },
          error: null,
        },
      });

      const result = await FeatureFlagService.isEnabled(
        'org-4',
        'elevenlabs_voices',
        supabase,
      );

      expect(result.metadata).toBeUndefined();
    });
  });

  describe('hasActiveSubscription', () => {
    it('returns true for paid subscription', async () => {
      const supabase = createSupabaseMock({
        addon: {
          data: { billing_status: 'paid', trial_ends_at: null },
          error: null,
        },
      });

      const result = await FeatureFlagService.hasActiveSubscription(
        'org-5',
        'elevenlabs_voices',
        supabase,
      );

      expect(result).toBe(true);
    });

    it('returns true for active trial that has not expired', async () => {
      const inFuture = new Date(Date.now() + 60_000).toISOString();
      const supabase = createSupabaseMock({
        addon: {
          data: { billing_status: 'trial', trial_ends_at: inFuture },
          error: null,
        },
      });

      const result = await FeatureFlagService.hasActiveSubscription(
        'org-6',
        'elevenlabs_voices',
        supabase,
      );

      expect(result).toBe(true);
    });

    it('returns false for expired trial', async () => {
      const supabase = createSupabaseMock({
        addon: {
          data: {
            billing_status: 'trial',
            trial_ends_at: new Date(Date.now() - 60_000).toISOString(),
          },
          error: null,
        },
      });

      const result = await FeatureFlagService.hasActiveSubscription(
        'org-7',
        'elevenlabs_voices',
        supabase,
      );

      expect(result).toBe(false);
    });

    it('returns false when subscription missing or overdue', async () => {
      const supabase = createSupabaseMock({
        addon: {
          data: { billing_status: 'overdue', trial_ends_at: null },
          error: null,
        },
      });

      const overdueResult = await FeatureFlagService.hasActiveSubscription(
        'org-8',
        'elevenlabs_voices',
        supabase,
      );

      const missingSubscription = await FeatureFlagService.hasActiveSubscription(
        'org-8',
        'elevenlabs_voices',
        createSupabaseMock(),
      );

      expect(overdueResult).toBe(false);
      expect(missingSubscription).toBe(false);
    });
  });

  describe('canUseFeature', () => {
    it('denies access when feature disabled', async () => {
      mockCreateClient.mockResolvedValueOnce(
        createSupabaseMock({
          featureFlag: { data: null, error: null },
        }),
      );

      const result = await FeatureFlagService.canUseFeature(
        'org-9',
        'elevenlabs_voices',
      );

      expect(result.allowed).toBe(false);
      expect(result.requiresUpgrade).toBe(false);
      expect(result.reason).toBe('Feature not available');
    });

    it('requires subscription when feature enabled but addon inactive', async () => {
      mockCreateClient.mockResolvedValueOnce(
        createSupabaseMock({
          featureFlag: { data: { id: 'flag-4', is_enabled: true }, error: null },
        }),
      );

      const result = await FeatureFlagService.canUseFeature(
        'org-10',
        'elevenlabs_voices',
      );

      expect(result.allowed).toBe(false);
      expect(result.requiresUpgrade).toBe(true);
      expect(result.reason).toBe('Subscription required');
    });

    it('allows usage when flag and subscription active', async () => {
      mockCreateClient.mockResolvedValueOnce(
        createSupabaseMock({
          featureFlag: { data: { id: 'flag-5', is_enabled: true }, error: null },
          addon: {
            data: { billing_status: 'paid', trial_ends_at: null },
            error: null,
          },
        }),
      );

      const result = await FeatureFlagService.canUseFeature(
        'org-11',
        'elevenlabs_voices',
      );

      expect(result.allowed).toBe(true);
      expect(result.requiresUpgrade).toBe(false);
      expect(result.reason).toBe('Active subscription');
    });

    it('passes metadata through from override', async () => {
      mockCreateClient.mockResolvedValueOnce(
        createSupabaseMock({
          featureFlag: { data: { id: 'flag-6', is_enabled: true }, error: null },
          organizationFeature: {
            data: { enabled: true, metadata: { tier: 'enterprise' } },
            error: null,
          },
          addon: {
            data: { billing_status: 'paid', trial_ends_at: null },
            error: null,
          },
        }),
      );

      const result = await FeatureFlagService.canUseFeature(
        'org-12',
        'elevenlabs_voices',
      );

      expect(result.metadata).toEqual({ tier: 'enterprise' });
    });
  });
});
