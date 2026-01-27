import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ActionItem } from "@/hooks/useMeetingMinutes";

interface CreateTasksResult {
  created: number;
  failed: number;
  taskIds: string[];
}

export function useCreateTasksFromItems() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const createTasks = async (
    items: ActionItem[],
    meetingMinuteId: string
  ): Promise<CreateTasksResult> => {
    if (items.length === 0) {
      return { created: 0, failed: 0, taskIds: [] };
    }

    setIsCreating(true);
    setProgress({ current: 0, total: items.length });

    try {
      // Haal org_id op
      const { data: userOrg, error: orgError } = await supabase
        .from("user_organizations")
        .select("org_id")
        .limit(1)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!userOrg?.org_id) throw new Error("Geen organisatie gevonden");

      // Map urgency naar database priority (typed as literal union)
      const mapPriority = (urgency?: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' => {
        switch (urgency) {
          case 'critical': return 'CRITICAL';
          case 'high': return 'HIGH';
          case 'medium': return 'MEDIUM';
          case 'low': return 'LOW';
          default: return 'MEDIUM';
        }
      };

      // Bulk insert alle taken
      const tasksToInsert = items.map(item => ({
        org_id: userOrg.org_id,
        title: item.action.substring(0, 100),
        description: item.source_quote 
          ? `Actiepunt uit notulen\n\nBron citaat:\n"${item.source_quote}"\n\nClassificatie: ${item.classification || 'Onbekend'}`
          : `Actiepunt uit notulen\n\nClassificatie: ${item.classification || 'Onbekend'}`,
        priority: mapPriority(item.urgency) as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        due_at: item.deadline ? new Date(item.deadline).toISOString() : null,
        category: 'action_item' as const,
        source_meeting_minute_id: meetingMinuteId,
      }));

      const { data: createdTasks, error: insertError } = await supabase
        .from('tasks')
        .insert(tasksToInsert)
        .select('id');

      if (insertError) {
        console.error('Bulk insert error:', insertError);
        throw new Error('Kon taken niet aanmaken: ' + insertError.message);
      }

      const taskIds = createdTasks?.map(t => t.id) || [];
      const createdCount = taskIds.length;
      const failedCount = items.length - createdCount;

      // Invalidate query cache
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      if (createdCount > 0) {
        toast.success(`${createdCount} ${createdCount === 1 ? 'taak' : 'taken'} aangemaakt`);
      }

      return {
        created: createdCount,
        failed: failedCount,
        taskIds,
      };
    } catch (error) {
      console.error('Create tasks error:', error);
      toast.error(error instanceof Error ? error.message : 'Kon taken niet aanmaken');
      return { created: 0, failed: items.length, taskIds: [] };
    } finally {
      setIsCreating(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return { createTasks, isCreating, progress };
}
