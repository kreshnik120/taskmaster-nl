import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ===========================
// TYPE DEFINITIONS
// ===========================
export interface WidgetConfig {
  key: string;
  name: string;
  description: string;
  isVisible: boolean;
  order: number;
  isDefault: boolean;
}

interface UserWidgetPreference {
  id: string;
  user_id: string;
  widget_key: string;
  is_visible: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ===========================
// DEFAULT CONFIGURATION
// ===========================
export const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    key: 'recruitment-kpis',
    name: 'Recruitment KPI\'s',
    description: 'Overzicht van wervingsstatistieken en voortgang',
    isVisible: true,
    order: 0,
    isDefault: true,
  },
  {
    key: 'urgency-actions',
    name: 'Urgentie Acties',
    description: 'Kandidaten die aandacht vereisen',
    isVisible: true,
    order: 1,
    isDefault: true,
  },
  {
    key: 'today-focus',
    name: 'Focus van Vandaag',
    description: 'Belangrijkste taken voor vandaag',
    isVisible: true,
    order: 2,
    isDefault: true,
  },
  {
    key: 'upcoming-reminders',
    name: 'Aankomende Herinneringen',
    description: 'Geplande notificaties en deadlines',
    isVisible: true,
    order: 3,
    isDefault: true,
  },
  {
    key: 'task-list',
    name: 'Nu Doen',
    description: 'Actieve taken lijst',
    isVisible: true,
    order: 4,
    isDefault: true,
  },
];

// ===========================
// HELPER FUNCTIONS
// ===========================
function mergeWithDefaults(userPrefs: UserWidgetPreference[]): WidgetConfig[] {
  const prefsMap = new Map(
    userPrefs.map(p => [p.widget_key, p])
  );

  return DEFAULT_WIDGETS
    .map(widget => {
      const pref = prefsMap.get(widget.key);
      return pref ? {
        ...widget,
        isVisible: pref.is_visible,
        order: pref.display_order,
      } : widget;
    })
    .sort((a, b) => a.order - b.order);
}

// ===========================
// CUSTOM HOOK
// ===========================
export function useWidgetPreferences() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // ===========================
  // LOAD PREFERENCES FROM DATABASE
  // ===========================
  const loadPreferences = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        setWidgets(DEFAULT_WIDGETS);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from('user_widget_preferences')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order');

      if (error) throw error;

      const merged = mergeWithDefaults((data as UserWidgetPreference[]) || []);
      setWidgets(merged);

    } catch (error) {
      console.error('[useWidgetPreferences] Load failed:', error);
      toast.error("Kon widget voorkeuren niet laden");
      setWidgets(DEFAULT_WIDGETS);
    } finally {
      setLoading(false);
    }
  }, []);

  // ===========================
  // UPDATE SINGLE PREFERENCE (UPSERT)
  // ===========================
  const updatePreference = useCallback(async (
    widgetKey: string,
    updates: { isVisible?: boolean; order?: number }
  ) => {
    setSaving(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      const currentWidget = widgets.find(w => w.key === widgetKey);
      if (!currentWidget) throw new Error(`Widget ${widgetKey} not found`);

      const { error } = await supabase
        .from('user_widget_preferences')
        .upsert({
          user_id: user.id,
          widget_key: widgetKey,
          is_visible: updates.isVisible ?? currentWidget.isVisible,
          display_order: updates.order ?? currentWidget.order,
        }, {
          onConflict: 'user_id,widget_key'
        });

      if (error) throw error;

      // Update local state
      setWidgets(prev => prev.map(w =>
        w.key === widgetKey ? {
          ...w,
          isVisible: updates.isVisible ?? w.isVisible,
          order: updates.order ?? w.order,
        } : w
      ));

    } catch (error) {
      console.error('[useWidgetPreferences] Update failed:', error);
      toast.error("Kon voorkeuren niet opslaan");
    } finally {
      setSaving(false);
    }
  }, [widgets]);

  // ===========================
  // REORDER ALL WIDGETS
  // ===========================
  const reorderWidgets = useCallback(async (newOrder: WidgetConfig[]) => {
    setSaving(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      const updates = newOrder.map((widget, index) => ({
        user_id: user.id,
        widget_key: widget.key,
        is_visible: widget.isVisible,
        display_order: index,
      }));

      const { error } = await supabase
        .from('user_widget_preferences')
        .upsert(updates, {
          onConflict: 'user_id,widget_key'
        });

      if (error) throw error;

      setWidgets(newOrder.map((w, i) => ({ ...w, order: i })));

      toast.success("Widget volgorde bijgewerkt");

    } catch (error) {
      console.error('[useWidgetPreferences] Reorder failed:', error);
      toast.error("Kon volgorde niet opslaan");
    } finally {
      setSaving(false);
    }
  }, []);

  // ===========================
  // RESET TO DEFAULTS
  // ===========================
  const resetToDefaults = useCallback(async () => {
    setSaving(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_widget_preferences')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setWidgets(DEFAULT_WIDGETS);

      toast.success("Widget voorkeuren teruggezet naar standaard");

    } catch (error) {
      console.error('[useWidgetPreferences] Reset failed:', error);
      toast.error("Kon voorkeuren niet herstellen");
    } finally {
      setSaving(false);
    }
  }, []);

  // ===========================
  // INITIAL LOAD + REALTIME SYNC
  // ===========================
  useEffect(() => {
    loadPreferences();

    const channel = supabase
      .channel('user-widget-preferences-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_widget_preferences',
        filter: userId ? `user_id=eq.${userId}` : undefined,
      }, () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          loadPreferences();
        }, 200);
      })
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [loadPreferences, userId]);

  return {
    widgets,
    loading,
    saving,
    updatePreference,
    reorderWidgets,
    resetToDefaults,
  };
}
