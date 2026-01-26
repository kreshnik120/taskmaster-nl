import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY, AgendaItem } from "@/hooks/useMeetingMinutes";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export function useManageAgendaItems() {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchCurrentItems = async (minuteId: string): Promise<AgendaItem[]> => {
    const { data, error } = await supabase
      .from('meeting_minutes')
      .select('agenda_items')
      .eq('id', minuteId)
      .single();

    if (error) throw error;
    return (data?.agenda_items as unknown as AgendaItem[]) || [];
  };

  const updateItems = async (minuteId: string, items: AgendaItem[]): Promise<void> => {
    const { error } = await supabase
      .from('meeting_minutes')
      .update({ agenda_items: items as unknown as Json })
      .eq('id', minuteId);

    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
  };

  const addAgendaItem = async (
    minuteId: string,
    item: Omit<AgendaItem, 'id' | 'order'>
  ): Promise<void> => {
    setIsUpdating(true);
    try {
      const currentItems = await fetchCurrentItems(minuteId);

      const newItem: AgendaItem = {
        ...item,
        id: crypto.randomUUID(),
        order: currentItems.length + 1,
      };

      await updateItems(minuteId, [...currentItems, newItem]);
      toast.success("Agenda item toegevoegd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon agenda item niet toevoegen", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const updateAgendaItem = async (
    minuteId: string,
    itemId: string,
    updates: Partial<AgendaItem>
  ): Promise<void> => {
    setIsUpdating(true);
    try {
      const currentItems = await fetchCurrentItems(minuteId);
      const updatedItems = currentItems.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      );

      await updateItems(minuteId, updatedItems);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon agenda item niet bijwerken", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const removeAgendaItem = async (minuteId: string, itemId: string): Promise<void> => {
    setIsUpdating(true);
    try {
      const currentItems = await fetchCurrentItems(minuteId);
      const filteredItems = currentItems
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, order: index + 1 }));

      await updateItems(minuteId, filteredItems);
      toast.success("Agenda item verwijderd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon agenda item niet verwijderen", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleDiscussed = async (minuteId: string, itemId: string): Promise<void> => {
    setIsUpdating(true);
    try {
      const currentItems = await fetchCurrentItems(minuteId);
      const item = currentItems.find((i) => i.id === itemId);
      if (!item) throw new Error("Item niet gevonden");

      const updatedItems = currentItems.map((i) =>
        i.id === itemId ? { ...i, discussed: !i.discussed } : i
      );

      await updateItems(minuteId, updatedItems);
      toast.success(item.discussed ? "Item als niet-besproken gemarkeerd" : "Item als besproken gemarkeerd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon status niet bijwerken", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    addAgendaItem,
    updateAgendaItem,
    removeAgendaItem,
    toggleDiscussed,
    isUpdating,
  };
}
