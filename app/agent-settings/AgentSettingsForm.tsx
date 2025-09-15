'use client';

import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Loader2, Save, RotateCcw, Info, Volume2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import CalendarIntegration from './CalendarIntegration';
import WebhookSettings from './WebhookSettings';
import { useAgentSettings } from '../../lib/hooks/useAgentSettings';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';

// Available OpenAI voices for the Realtime API
const VOICE_OPTIONS = [
  { value: 'alloy', label: 'Alloy - Female (Balanced, neutral)' },
  { value: 'shimmer', label: 'Shimmer - Female (Warm, friendly)' },
  { value: 'echo', label: 'Echo - Male (Smooth, confident)' },
  { value: 'sage', label: 'Sage - Male (Clear, authoritative)' },
  { value: 'verse', label: 'Verse - Male (Energetic, expressive)' },
];

export default function AgentSettingsForm() {
  const {
    agentId,
    displayName, setDisplayName,
    prompt, setPrompt,
    greeting, setGreeting,
    voice, setVoice,
    webhookEnabled, setWebhookEnabled,
    webhookUrl,
    isLoading,
    isSaving,
    message,
    handleSave,
    handleReset,
  } = useAgentSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-4">
      <div>
        <Label htmlFor="agent-name">Agent Name</Label>
        <p className="text-sm text-gray-500 mb-2">
          Give your agent a memorable name.
        </p>
        <input
          id="agent-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter agent name..."
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isSaving}
        />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Label htmlFor="agent-prompt">Agent Prompt</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-gray-400 hover:text-gray-300 transition-colors">
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-2 text-sm">
                <p className="font-medium">Tips for writing prompts:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Be clear about what the agent can and cannot do</li>
                  <li>Include your business name and context</li>
                  <li>Specify the tone (professional, friendly, formal, etc.)</li>
                  <li>List the main tasks the agent should handle</li>
                  <li>Add any specific instructions or limitations</li>
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm text-gray-500 mb-2">
          Define how your agent should behave and what it can help callers with.
        </p>
        <Textarea
          id="agent-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter the system prompt for your voice agent..."
          className="min-h-[200px] font-mono text-sm"
          disabled={isSaving}
        />
      </div>

      <div>
        <Label htmlFor="agent-greeting">Greeting Message</Label>
        <p className="text-sm text-gray-500 mb-2">
          The initial greeting your agent will say when answering calls.
        </p>
        <Textarea
          id="agent-greeting"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Enter the greeting message for your voice agent..."
          className="min-h-[100px] font-mono text-sm"
          disabled={isSaving}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="agent-voice">Agent Voice</Label>
          <Volume2 className="h-4 w-4 text-gray-400" />
        </div>
        <p className="text-sm text-gray-500">
          Choose the voice personality for your agent.
        </p>
        <Select value={voice} onValueChange={setVoice} disabled={isSaving}>
          <SelectTrigger id="agent-voice" className="w-full">
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
          <SelectContent>
            {VOICE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <WebhookSettings 
        webhookEnabled={webhookEnabled} 
        setWebhookEnabled={setWebhookEnabled} 
        webhookUrl={webhookUrl} 
        isSaving={isSaving} 
      />

      <CalendarIntegration agentId={agentId} />

      {message && (
        <Alert className={message.type === 'success' ? 'border-green-600' : 'border-red-600'}>
          <AlertDescription className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Configuration
            </>
          )}
        </Button>

        <Button
          onClick={handleReset}
          variant="outline"
          disabled={isSaving}
          className="flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Default
        </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}
