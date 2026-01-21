-- Tabel voor persoonlijke kolom voorkeuren per gebruiker
CREATE TABLE public.user_column_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  column_id UUID NOT NULL REFERENCES public.columns(id) ON DELETE CASCADE,
  custom_name TEXT NOT NULL,
  is_collapsed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, column_id)
);

-- Index voor snelle lookups
CREATE INDEX idx_user_column_preferences_user ON public.user_column_preferences(user_id);
CREATE INDEX idx_user_column_preferences_column ON public.user_column_preferences(column_id);

-- RLS inschakelen
ALTER TABLE public.user_column_preferences ENABLE ROW LEVEL SECURITY;

-- Gebruikers kunnen alleen hun eigen voorkeuren beheren
CREATE POLICY "Users can view own column preferences"
  ON public.user_column_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own column preferences"
  ON public.user_column_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own column preferences"
  ON public.user_column_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own column preferences"
  ON public.user_column_preferences
  FOR DELETE
  USING (auth.uid() = user_id);