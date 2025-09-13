import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import Header from '../../components/Header';
import AgentSettingsForm from './AgentSettingsForm';
import AgentResponseTypeForm from './AgentResponseTypeForm';

export default async function AgentSettingsPage() {
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
            <h2 className="text-2xl font-bold mb-2 text-white">Agent Settings</h2>
            <p className="text-gray-400">Configure your AI voice agent's behavior and responses</p>
          </div>

          <div className="space-y-6">
            <section className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
              <h3 className="text-lg font-semibold mb-4 text-white">Agent Configuration</h3>
              <p className="text-sm text-gray-400 mb-4">
                Customize how your voice agent responds to callers and handles scheduling requests.
              </p>
              <AgentSettingsForm userId={user.id} />
            </section>

            <section className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
              <h3 className="text-lg font-semibold mb-4 text-white">Agent Response Type</h3>
              <p className="text-sm text-gray-400 mb-4">
                Configure which communication channels your agent can use to respond to inquiries.
              </p>
              <AgentResponseTypeForm userId={user.id} />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}