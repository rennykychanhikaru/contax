import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase.from('organizations').select('id, name').limit(1)
  if (error || !data?.length) {
    return new Response(JSON.stringify({ error: 'No organizations found' }), { status: 404 })
  }
  return new Response(JSON.stringify({ organization: data[0] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

