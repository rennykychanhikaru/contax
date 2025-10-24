'use client';

import { useState, useEffect } from 'react';

const DEFAULT_PROMPT = `You are a helpful scheduling assistant for Renny's office. 
You can help callers:
- Check calendar availability
- Schedule meetings
- Provide information about available time slots

Be professional, friendly, and efficient in your responses.`;

const DEFAULT_GREETING = `Hi! Thanks for calling. I'm your AI assistant. How can I help you today?`;

const DEFAULT_NAME = 'AI Assistant';
const DEFAULT_VOICE = 'sage';
const DEFAULT_PROVIDER = 'openai';

export function useAgentSettings(agentId: string | null) {
  const [displayName, setDisplayName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [greeting, setGreeting] = useState('');
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [voiceProvider, setVoiceProvider] = useState<'openai' | 'elevenlabs'>(DEFAULT_PROVIDER);
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState<string | null>(null);
  const [elevenlabsVoiceSettings, setElevenlabsVoiceSettings] = useState<Record<string, unknown> | null>(null);
  const [voiceFallbackEnabled, setVoiceFallbackEnabled] = useState(true);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('');

  useEffect(() => {
    if (!agentId) return;
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const [agentRes, twilioRes] = await Promise.all([
          fetch(`/api/agents/${agentId}`),
          fetch(`/api/agents/${agentId}/twilio`)
        ]);

        const agentData = await agentRes.json();
        if (agentRes.ok && agentData.agent) {
          setDisplayName(agentData.agent.display_name || DEFAULT_NAME);
          setPrompt(agentData.agent.prompt || DEFAULT_PROMPT);
          setGreeting(agentData.agent.greeting || DEFAULT_GREETING);
          setVoice(agentData.agent.voice || DEFAULT_VOICE);
          setVoiceProvider((agentData.agent.voice_provider as 'openai' | 'elevenlabs') || DEFAULT_PROVIDER);
          setElevenlabsVoiceId(agentData.agent.elevenlabs_voice_id || null);
          setElevenlabsVoiceSettings(agentData.agent.elevenlabs_voice_settings || null);
          setVoiceFallbackEnabled(
            agentData.agent.voice_fallback_enabled === undefined
              ? true
              : Boolean(agentData.agent.voice_fallback_enabled),
          );
          setWebhookEnabled(agentData.agent.webhook_enabled || false);
          setWebhookUrl(agentData.agent.webhook_url || '');
          setOrganizationId(agentData.organization?.id || agentData.agent.organization_id || null);
        }

        const twilioData = await twilioRes.json();
        if (twilioRes.ok) {
          setTwilioAccountSid(twilioData.accountSid || '');
          setTwilioAuthToken(twilioData.authToken || '');
          setTwilioPhoneNumber(twilioData.phoneNumber || '');
          setTwilioConfigured(!!(twilioData.accountSid && twilioData.authToken && twilioData.phoneNumber));
        }
      } catch (error) {
        console.error('Error fetching agent settings:', error);
        setDisplayName(DEFAULT_NAME);
        setPrompt(DEFAULT_PROMPT);
        setGreeting(DEFAULT_GREETING);
        setVoice(DEFAULT_VOICE);
        setTwilioConfigured(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [agentId]);

  const handleSave = async () => {
    if (!agentId) return;
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          prompt,
          greeting,
          voice,
          voice_provider: voiceProvider,
          elevenlabs_voice_id: elevenlabsVoiceId,
          elevenlabs_voice_settings: elevenlabsVoiceSettings,
          voice_fallback_enabled: voiceFallbackEnabled,
          webhook_enabled: webhookEnabled,
        }),
      });

      if (response.ok) {
        // Reflect server-calculated values immediately (e.g., webhook_url after token generation)
        type SaveAgentResponse = { agent?: { webhook_enabled?: boolean; webhook_url?: string } };
        let data: SaveAgentResponse | null = null;
        try { data = (await response.json()) as SaveAgentResponse; } catch { /* ignore */ }
        const agent = data?.agent;
        if (agent) {
          setWebhookEnabled(!!agent.webhook_enabled);
          setWebhookUrl(agent.webhook_url || '');
        }
        setMessage({ type: 'success', text: 'Agent settings saved successfully!' });
      } else {
        let errorText = 'Failed to save agent settings';
        try {
          const error = await response.json();
          errorText = error.message || error.error || errorText;
        } catch { /* ignore */ }
        setMessage({ type: 'error', text: errorText });
      }
    } catch (error) {
      console.error('Error saving agent settings:', error);
      setMessage({ type: 'error', text: 'Failed to save agent settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTwilio = async () => {
    if (!agentId) return;
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/twilio`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountSid: twilioAccountSid,
            authToken: twilioAuthToken,
            phoneNumber: twilioPhoneNumber
          }),
        });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Twilio settings saved successfully!' });
        setTwilioConfigured(true);
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.message || 'Failed to save Twilio settings' });
      }
    } catch (error) {
      console.error('Error saving Twilio settings:', error);
      setMessage({ type: 'error', text: 'Failed to save Twilio settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDisplayName(DEFAULT_NAME);
    setPrompt(DEFAULT_PROMPT);
    setGreeting(DEFAULT_GREETING);
    setVoice(DEFAULT_VOICE);
    setVoiceProvider(DEFAULT_PROVIDER);
    setElevenlabsVoiceId(null);
    setElevenlabsVoiceSettings(null);
    setVoiceFallbackEnabled(true);
    setMessage(null);
  };

  return {
    agentId,
    organizationId,
    displayName, setDisplayName,
    prompt, setPrompt,
    greeting, setGreeting,
    voice, setVoice,
    voiceProvider, setVoiceProvider,
    elevenlabsVoiceId, setElevenlabsVoiceId,
    elevenlabsVoiceSettings, setElevenlabsVoiceSettings,
    voiceFallbackEnabled, setVoiceFallbackEnabled,
    webhookEnabled, setWebhookEnabled,
    webhookUrl,
    twilioConfigured,
    twilioAccountSid, setTwilioAccountSid,
    twilioAuthToken, setTwilioAuthToken,
    twilioPhoneNumber, setTwilioPhoneNumber,
    isLoading,
    isSaving,
    message,
    handleSave,
    handleSaveTwilio,
    handleReset,
  };

}
