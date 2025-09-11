-- Create Twilio settings table
CREATE TABLE IF NOT EXISTS public.twilio_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL, -- In production, consider encrypting this
  phone_number TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.twilio_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to manage their own Twilio settings
CREATE POLICY "Users can view their own Twilio settings"
  ON public.twilio_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Twilio settings"
  ON public.twilio_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Twilio settings"
  ON public.twilio_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Twilio settings"
  ON public.twilio_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_twilio_settings_user_id ON public.twilio_settings(user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_twilio_settings_updated_at
  BEFORE UPDATE ON public.twilio_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();