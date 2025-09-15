import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import TwilioIntegrationForm from './TwilioIntegrationForm';
import CalendarSettings from './CalendarSettings';
import Header from '../../components/Header';
import OutgoingCallTrigger from '../../components/OutgoingCallTrigger';

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

            <section className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
              <h3 className="text-lg font-semibold mb-4 text-white">Twilio Integration</h3>
              <p className="text-sm text-gray-400 mb-4">
                Connect your Twilio account to enable SMS and voice call features for appointment reminders and notifications.
              </p>
              
              <TwilioIntegrationForm userId={user.id} />
              
              <div className="mt-8 pt-6 border-t border-gray-700">
                <h4 className="text-base font-medium mb-3 text-white">Test Outgoing Calls</h4>
                <p className="text-sm text-gray-400 mb-4">
                  Test your Twilio integration by making an outgoing call that connects to your voice agent.
                </p>
                <OutgoingCallTrigger />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
