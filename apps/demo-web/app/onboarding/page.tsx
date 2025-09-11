'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function OnboardingPage() {
  const [organizationName, setOrganizationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!organizationName.trim()) {
      setError('Please enter your organization name');
      return;
    }

    setLoading(true);

    try {
      // Call the API route to create organization
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationName: organizationName.trim()
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Onboarding API error:', data);
        setError(data.error || 'Failed to create organization');
        return;
      }

      console.log('Organization created successfully:', data);

      // Redirect to home page
      router.push('/');
    } catch (err) {
      console.error('Onboarding error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Welcome to Contax!</h1>
          <p className="mt-2 text-muted-foreground">Let's set up your organization</p>
        </div>

        <div className="bg-card p-8 rounded-lg shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-foreground mb-2">
                What's your organization called?
              </label>
              <input
                id="organizationName"
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="w-full px-4 py-3 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
                placeholder="e.g., Acme Corp"
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground mt-2">
                This will be the name of your workspace in Contax
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !organizationName.trim()}
              className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Setting up...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}