import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import CalendarSettings from './CalendarSettings';
import TeamManagement from './TeamManagement';
import Header from '../../components/Header';

export default async function SettingsPage() {
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

  if (!user) {
    redirect('/auth/sign-in');
  }

  // Fetch current user's role in their organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .single();

  // Only owners/admins can access the settings page
  const role = membership?.role ?? null;
  const isAdmin = role === 'owner' || role === 'admin';
  if (!isAdmin) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2 text-white">Account Settings</h2>
            <p className="text-gray-400">Manage your account preferences and integrations</p>
          </div>

          <div className="space-y-6">
            <CalendarSettings userId={user.id} />

            {/* Twilio integration moved to per-agent settings. */}
            <section className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
              <h3 className="text-lg font-semibold mb-4 text-white">Team Management</h3>
              <TeamManagement />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
