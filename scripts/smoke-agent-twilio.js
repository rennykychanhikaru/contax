/*
 Minimal DB-only smoke for agent-level Twilio.
 - Loads .env.local
 - Finds default agent id
 - Inserts an agent_twilio_settings row with encrypted dummy token
 - Verifies encryption format, then cleans up
 */

const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(file) {
  const txt = fs.readFileSync(file, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (!m) continue;
    const [, k, vraw] = m;
    let v = vraw;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

function encrypt(token, hexKey) {
  if (!hexKey || hexKey.length !== 64) throw new Error('Invalid WEBHOOK_ENCRYPTION_KEY');
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(token, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
}

async function main() {
  loadEnvFile('.env.local');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encKey = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!url || !key) throw new Error('Missing Supabase envs');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  let { data: agent, error: agentErr } = await sb
    .from('agent_configurations')
    .select('id, organization_id')
    .eq('name', 'default')
    .single();
  if (agentErr || !agent) {
    const any = await sb
      .from('agent_configurations')
      .select('id, organization_id')
      .limit(1)
      .single();
    if (any.error || !any.data) throw new Error('No agent found in agent_configurations');
    agent = any.data;
  }
  console.log('Agent:', agent.id, 'Org:', agent.organization_id);

  const accountSid = 'AC' + '1'.repeat(32);
  const phone = '+15555550123';
  const token = 'test-token-' + Date.now();
  const enc = encrypt(token, encKey);
  console.log('Encrypted token sample:', enc.split(':')[0], '...');

  // Upsert test row
  await sb.from('agent_twilio_settings').delete().eq('agent_id', agent.id);
  const ins = await sb.from('agent_twilio_settings').insert({
    organization_id: agent.organization_id,
    agent_id: agent.id,
    account_sid: accountSid,
    auth_token_encrypted: enc,
    phone_number: phone,
  }).select('account_sid, auth_token_encrypted, phone_number').single();
  if (ins.error) throw ins.error;
  const row = ins.data;
  console.log('Inserted row:', {
    account_sid: row.account_sid,
    phone_number: row.phone_number,
    encrypted_has_colons: row.auth_token_encrypted.includes(':'),
    encrypted_len: row.auth_token_encrypted.length,
  });

  // Clean up test row
  await sb.from('agent_twilio_settings').delete().eq('agent_id', agent.id);
  console.log('Cleanup complete.');
}

main().catch((e) => {
  console.error('Smoke failed:', e.message);
  process.exit(1);
});
