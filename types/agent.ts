// Agent and OpenAI Realtime API Types

import type { TimeSlot } from './google';

// OpenAI Realtime Event Types
export interface OpenAIRealtimeEvent {
  type: string;
  [key: string]: unknown;
}

// Session Configuration
export interface RealtimeSessionConfig {
  model?: string;
  instructions?: string;
  voice?: string;
  input_audio_format?: string;
  output_audio_format?: string;
  input_audio_transcription?: {
    model: string;
  };
  turn_detection?: {
    type: string;
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  temperature?: number;
  max_response_output_tokens?: number;
}

// Tool Definition Types
export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  required?: string[];
  items?: ToolParameter;
}

export interface Tool {
  type: 'function';
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

// Function Call Types
export interface FunctionCall {
  call_id: string;
  type: 'function';
  name: string;
  arguments: string;
}

export interface FunctionCallResult {
  call_id: string;
  output: string;
}

// Tool Event Types
export type ToolEvent =
  | { kind: 'event'; type: string; text?: string }
  | { kind: 'call'; name: string; args: string }
  | { kind: 'result'; name: string; result: unknown };

// Agent Connection Options
export interface AgentConnectionOptions {
  organizationId?: string;
  agentId?: string;
  calendarId?: string;
  greeting?: string;
  language?: string;
  timeZone?: string;
}

// Agent Constructor Options
export interface AgentOptions {
  onTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string, final: boolean) => void;
  onToolEvent?: (event: ToolEvent) => void;
  onSlots?: (slots: TimeSlot[], timeZone?: string) => void;
}

// Agent Adapter Interface
export interface AgentAdapter {
  connect(systemPrompt: string, options?: AgentConnectionOptions): Promise<void>;
  disconnect(): Promise<void>;
  setCalendarIds(ids: string[] | undefined): void;
}

// Tool Arguments Types
export interface CheckAvailabilityArgs {
  organizationId?: string;
  start: string;
  end: string;
  calendarId?: string;
}

export interface BookAppointmentArgs {
  organizationId?: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  start: string;
  end: string;
  notes?: string;
  calendarId?: string;
}

export interface GetAvailableSlotsArgs {
  organizationId?: string;
  date: string;
  slotMinutes?: number;
  businessHours?: {
    start: string;
    end: string;
  };
}

// OpenAI Realtime API Message Types
export interface RealtimeMessage {
  type: string;
  [key: string]: unknown;
}

export interface TranscriptMessage extends RealtimeMessage {
  type: 'transcript';
  text: string;
}

export interface ResponseStartedMessage extends RealtimeMessage {
  type: 'response.started';
}

export interface ResponseDeltaMessage extends RealtimeMessage {
  type: 'response.audio_transcript.delta' | 'response.text.delta';
  delta: string;
}

export interface ResponseDoneMessage extends RealtimeMessage {
  type: 'response.audio_transcript.done' | 'response.text.done';
  transcript?: string;
  text?: string;
}

export interface FunctionCallCreatedMessage extends RealtimeMessage {
  type: 'response.function_call.created';
  call_id?: string;
  id?: string;
  name: string;
}

export interface FunctionCallArgumentsDeltaMessage extends RealtimeMessage {
  type: 'response.function_call.arguments.delta' | 'response.function_call_arguments.delta';
  call_id?: string;
  id?: string;
  name?: string;
  delta: string;
}

export interface FunctionCallArgumentsDoneMessage extends RealtimeMessage {
  type: 'response.function_call.arguments.done' | 'response.function_call_arguments.done';
  call_id?: string;
  id?: string;
}

export interface FunctionCallCompletedMessage extends RealtimeMessage {
  type: 'response.function_call.completed';
  call_id?: string;
  id?: string;
  name: string;
  arguments: string;
}

// Response Configuration Types
export interface ResponseConfig {
  instructions?: string;
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  modalities?: ('audio' | 'text')[];
  temperature?: number;
  max_output_tokens?: number;
}

export interface CreateResponseMessage extends RealtimeMessage {
  type: 'response.create';
  response: ResponseConfig;
}

export interface CancelResponseMessage extends RealtimeMessage {
  type: 'response.cancel';
}

// Conversation Item Types
export interface ConversationItem {
  type: 'message' | 'function_call' | 'function_call_output';
  id?: string;
}

export interface MessageItem extends ConversationItem {
  type: 'message';
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'audio';
    text?: string;
    audio?: string;
  }>;
}

export interface FunctionCallOutputItem extends ConversationItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export interface CreateConversationItemMessage extends RealtimeMessage {
  type: 'conversation.item.create';
  item: ConversationItem;
}

// Audio and Media Types
export interface AudioConstraints {
  audio: boolean | MediaTrackConstraints;
}

export interface WebRTCConfiguration {
  iceServers?: RTCIceServer[];
}

// Agent State Types
export interface AgentState {
  connected: boolean;
  currentTranscript: string;
  toolArgsBuffers: Map<string, { name: string; args: string }>;
  awaitingTool: boolean;
  defaultOrgId?: string;
  defaultCalendarId?: string;
  defaultAgentId?: string;
  calendarIds?: string[];
  timezone?: string;
}

// Tool Buffer Type
export interface ToolBuffer {
  name: string;
  args: string;
}

// Timer Handles (for cleanup)
export type TimerHandle = ReturnType<typeof setTimeout> | null;