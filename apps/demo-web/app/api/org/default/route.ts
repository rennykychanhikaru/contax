import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            console.error('Error setting cookies:', error)
          }
        },
      },
    }
  )

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get user's default organization through the membership table
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(id, name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (memberError || !membership) {
      // If no organization exists, this shouldn't happen after migration
      // but we'll handle it gracefully
      return NextResponse.json({ 
        error: 'No organization found for user. Please contact support.' 
      }, { status: 404 })
    }

    // Return the organization
    return NextResponse.json({ 
      organization: membership.organizations 
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error fetching user organization:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch organization' 
    }, { status: 500 })
  }
}

