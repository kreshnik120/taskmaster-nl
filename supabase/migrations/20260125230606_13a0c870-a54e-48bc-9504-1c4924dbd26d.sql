-- Migration: user_widget_preferences table
-- Created: 2026-01-25
-- Purpose: Store per-user dashboard widget visibility and order preferences

-- ===========================
-- 1. CREATE TABLE
-- ===========================
CREATE TABLE public.user_widget_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_key TEXT NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, widget_key)
);

-- ===========================
-- 2. CREATE INDEXES
-- ===========================
CREATE INDEX idx_user_widget_preferences_user
  ON public.user_widget_preferences(user_id);

CREATE INDEX idx_user_widget_preferences_widget
  ON public.user_widget_preferences(widget_key);

-- ===========================
-- 3. ENABLE RLS
-- ===========================
ALTER TABLE public.user_widget_preferences ENABLE ROW LEVEL SECURITY;

-- ===========================
-- 4. CREATE RLS POLICIES
-- ===========================
CREATE POLICY "Users can view own widget preferences"
  ON public.user_widget_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own widget preferences"
  ON public.user_widget_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own widget preferences"
  ON public.user_widget_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own widget preferences"
  ON public.user_widget_preferences
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ===========================
-- 5. CREATE UPDATED_AT TRIGGER
-- ===========================
CREATE TRIGGER update_user_widget_preferences_updated_at
  BEFORE UPDATE ON public.user_widget_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();