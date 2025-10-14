import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/database.types';

type CacheValue = {
  value: boolean;
  expiresAt: number;
};

type CacheStore = Map<string, CacheValue>;

type FeatureFlagOptions = {
  accountId?: string | null;
  userId?: string | null;
};

const DEFAULT_TTL =
  Number(process.env.FEATURE_FLAG_CACHE_TTL_MS ?? '5000');

function cacheKey(flagKey: string, opts: FeatureFlagOptions) {
  return `${flagKey}::${opts.accountId ?? ''}::${opts.userId ?? ''}`;
}

function getCache(): CacheStore {
  const globalScope = globalThis as typeof globalThis & {
    __featureFlagCache?: CacheStore;
  };

  if (!globalScope.__featureFlagCache) {
    globalScope.__featureFlagCache = new Map();
  }

  return globalScope.__featureFlagCache;
}

export async function isFeatureEnabledCached(
  supabase: SupabaseClient<Database>,
  flagKey: string,
  options: FeatureFlagOptions = {}
) {
  const cache = getCache();
  const key = cacheKey(flagKey, options);
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const { data, error } = await supabase.rpc('is_feature_enabled', {
    flag_key: flagKey,
    check_account_id: options.accountId ?? null,
    check_user_id: options.userId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const value = Boolean(data);
  cache.set(key, { value, expiresAt: now + DEFAULT_TTL });
  return value;
}

export function clearFeatureFlagCache() {
  getCache().clear();
}
