-- Ensure pgcrypto is available
create extension if not exists "pgcrypto";

-- Robust encryption using agent_id-derived key and fixed salt
create or replace function encrypt_google_token(
  token text,
  agent_id uuid
) returns text as $$
declare
  encryption_key text;
begin
  if token is null then
    return null;
  end if;
  -- Derive a stable key from agent_id and a fixed salt (do not rely on app.jwt_secret)
  encryption_key := encode(digest(agent_id::text || 'contax-calendar-encryption-salt-2024', 'sha256'), 'hex');
  return encode(pgp_sym_encrypt(token, encryption_key)::bytea, 'base64');
exception when others then
  raise warning 'encrypt_google_token failed: %', SQLERRM;
  return null;
end;
$$ language plpgsql security definer;

create or replace function decrypt_google_token(
  encrypted_token text,
  agent_id uuid
) returns text as $$
declare
  encryption_key text;
begin
  if encrypted_token is null then
    return null;
  end if;
  encryption_key := encode(digest(agent_id::text || 'contax-calendar-encryption-salt-2024', 'sha256'), 'hex');
  return pgp_sym_decrypt(decode(encrypted_token, 'base64')::bytea, encryption_key);
exception when others then
  raise warning 'decrypt_google_token failed: %', SQLERRM;
  return null;
end;
$$ language plpgsql security definer;

-- Replace the store function to be tolerant and return a clear boolean
create or replace function store_agent_google_tokens(
  p_agent_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer,
  p_email text default null,
  p_calendar_id text default null
) returns boolean as $$
declare
  v_expiry bigint;
  v_encrypted_access text;
  v_encrypted_refresh text;
begin
  v_expiry := extract(epoch from now()) + coalesce(p_expires_in, 3600);
  v_encrypted_access := encrypt_google_token(p_access_token, p_agent_id);
  v_encrypted_refresh := encrypt_google_token(p_refresh_token, p_agent_id);

  update public.agent_configurations
  set
    google_calendar_access_token_encrypted = v_encrypted_access,
    google_calendar_refresh_token_encrypted = v_encrypted_refresh,
    google_calendar_token_expiry = v_expiry,
    google_calendar_email = p_email,
    google_calendar_id = coalesce(p_calendar_id, p_email),
    google_calendar_connected = true,
    google_calendar_connected_at = now(),
    updated_at = now()
  where id = p_agent_id;

  return found;
exception when others then
  raise warning 'store_agent_google_tokens failed: %', SQLERRM;
  return false;
end;
$$ language plpgsql security definer;

-- Keep get_agent_google_tokens as-is; it calls decrypt_google_token which we replaced above.

-- Reapply grants (idempotent if already present)
grant execute on function encrypt_google_token(text, uuid) to authenticated;
grant execute on function decrypt_google_token(text, uuid) to authenticated;
grant execute on function store_agent_google_tokens(uuid, text, text, integer, text, text) to authenticated;
grant execute on function encrypt_google_token(text, uuid) to service_role;
grant execute on function decrypt_google_token(text, uuid) to service_role;
grant execute on function store_agent_google_tokens(uuid, text, text, integer, text, text) to service_role;

