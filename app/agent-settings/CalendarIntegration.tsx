'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Loader2, RefreshCw, Unlink, CheckCircle, Calendar } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface CalendarStatus {
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  calendars: Array<{ id: string; summary: string; primary?: boolean }>;
  error: string | null;
  lastSync?: string;
  connectedAt?: string;
}

interface CalendarIntegrationProps {
  agentId: string | null;
}

export default function CalendarIntegration({ agentId }: CalendarIntegrationProps) {
  const searchParams = useSearchParams();
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [checkingCalendar, setCheckingCalendar] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (agentId) {
      checkCalendarStatus();
    }
  }, [agentId]);

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const returnedAgentId = searchParams.get('agent_id');
    
    if (success) {
      if (returnedAgentId || agentId) {
        setTimeout(() => {
          checkCalendarStatus();
        }, 500);
      }
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      setMessage({ type: 'error', text: error });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, agentId]);

  const checkCalendarStatus = async () => {
    if (!agentId) return;
    
    setCheckingCalendar(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/calendar/status`);
      if (res.ok) {
        const status = await res.json();
        setCalendarStatus(status);
      }
    } catch (error) {
      console.error('Failed to check calendar status:', error);
    } finally {
      setCheckingCalendar(false);
    }
  };

  const handleConnectCalendar = () => {
    if (!agentId) return;
    window.location.href = `/api/agents/${agentId}/calendar/oauth/start?redirect=${encodeURIComponent('/agent-settings')}`;
  };

  const handleDisconnectCalendar = async () => {
    if (!agentId || !confirm('Are you sure you want to disconnect your Google Calendar?')) return;
    
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('disconnect_agent_google_calendar', {
        p_agent_id: agentId
      });
      
      if (error) throw error;
      
      setCalendarStatus(null);
      await checkCalendarStatus();
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect calendar' });
    }
  };

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Calendar className="h-5 w-5" />
          Google Calendar Integration
        </CardTitle>
        <CardDescription className="text-gray-400">
          Connect your Google Calendar to enable scheduling and availability checking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert className={message.type === 'success' ? 'border-green-600' : 'border-red-600'}>
            <AlertDescription className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}
        {checkingCalendar ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking calendar status...
          </div>
        ) : calendarStatus?.connected ? (
          <>
            <div className="flex items-center justify-between p-4 bg-green-900/20 rounded-lg border border-green-700">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <div>
                  <p className="font-medium text-green-400">Calendar Connected</p>
                  <p className="text-sm text-gray-300">{calendarStatus.email}</p>
                  {calendarStatus.connectedAt && (
                    <p className="text-xs text-gray-400">
                      Connected {new Date(calendarStatus.connectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={checkCalendarStatus}
                  className="text-gray-300 border-gray-600 hover:bg-gray-700"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectCalendar}
                  className="text-red-400 hover:text-red-300 border-red-900 hover:bg-red-950"
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
              </div>
            </div>

            {calendarStatus.calendars && calendarStatus.calendars.length > 0 && (
              <div className="space-y-2">
                <Label className="text-gray-300">Available Calendars</Label>
                <div className="space-y-1">
                  {calendarStatus.calendars.map((cal) => (
                    <div key={cal.id} className="flex items-center gap-2 text-sm text-gray-400">
                      <span>{cal.summary}</span>
                      {cal.primary && (
                        <Badge variant="secondary" className="text-xs">Primary</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-500" />
              <div>
                <p className="font-medium text-white">No Calendar Connected</p>
                <p className="text-sm text-gray-400">Connect your Google Calendar to enable scheduling</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleConnectCalendar}
              disabled={!agentId}
            >
              Connect Calendar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
