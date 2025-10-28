-- Add missing unique constraints for feature_flag_overrides table
-- Required for ON CONFLICT upsert operations

-- Add unique constraint for account-level overrides
CREATE UNIQUE INDEX IF NOT EXISTS feature_flag_overrides_account_unique
  ON public.feature_flag_overrides (feature_flag_id, account_id)
  WHERE account_id IS NOT NULL;

-- Add unique constraint for user-level overrides
CREATE UNIQUE INDEX IF NOT EXISTS feature_flag_overrides_user_unique
  ON public.feature_flag_overrides (feature_flag_id, user_id)
  WHERE user_id IS NOT NULL;
