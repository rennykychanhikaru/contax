-- Create webhook_tokens table to store user webhook tokens
CREATE TABLE IF NOT EXISTS public.webhook_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create webhook_logs table to store webhook events
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.webhook_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for webhook_tokens
CREATE POLICY "Users can view their own webhook tokens"
    ON public.webhook_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own webhook tokens"
    ON public.webhook_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own webhook tokens"
    ON public.webhook_tokens
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own webhook tokens"
    ON public.webhook_tokens
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create policies for webhook_logs
CREATE POLICY "Users can view their own webhook logs"
    ON public.webhook_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert logs (webhooks are processed server-side)
CREATE POLICY "Service role can insert webhook logs"
    ON public.webhook_logs
    FOR INSERT
    WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_webhook_tokens_user_id ON public.webhook_tokens(user_id);
CREATE INDEX idx_webhook_tokens_token ON public.webhook_tokens(token);
CREATE INDEX idx_webhook_logs_user_id ON public.webhook_logs(user_id);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);