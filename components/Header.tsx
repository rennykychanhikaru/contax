import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import UserDropdownMenu from '../app/(home)/UserDropdownMenu';
import Link from 'next/link';

export default async function Header() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // Handle error
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  
  let organizationName = null;
  if (user) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(name)')
      .eq('user_id', user.id)
      .single();
    
    organizationName = (membership?.organizations as { name: string })?.name || null;
  }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center">
          <Link 
            href="/" 
            className="text-2xl font-bold text-white hover:text-gray-200 transition-colors"
          >
            Contax
          </Link>
        </div>
        {user && (
          <UserDropdownMenu email={user.email!} organizationName={organizationName} />
        )}
      </div>
    </header>
  );
}