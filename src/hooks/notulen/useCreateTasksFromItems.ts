import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ActionItem, MeetingMinute } from "@/hooks/useMeetingMinutes";

interface CreateTasksResult {
  created: number;
  failed: number;
  taskIds: string[];
  warnings: Array<{ index: number; warning: string }>;
}

interface AssigneeMatch {
  userId: string | null;
  matched: boolean;
  warning?: string;
}

// Fase 7D: Assignee matching met profiles
async function matchAssignee(
  naam: string | null,
  orgId: string
): Promise<AssigneeMatch> {
  if (!naam) return { userId: null, matched: false };
  
  // "team" kan niet gekoppeld worden
  if (naam.toLowerCase() === 'team') {
    return {
      userId: null,
      matched: false,
      warning: '"Team" kan niet als assignee gekoppeld worden. Wijs toe aan een specifieke medewerker.'
    };
  }
  
  try {
    // Zoek alle users van deze org
    const { data: orgUsers } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('org_id', orgId);
      
    const userIds = (orgUsers || [])
      .map(u => u.user_id)
      .filter((id): id is string => Boolean(id));
    
    if (userIds.length === 0) {
      return {
        userId: null,
        matched: false,
        warning: `Geen teamleden gevonden in organisatie`
      };
    }
    
    // Zoek matching profile
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds)
      .ilike('name', `%${naam}%`);
    
    if (!profiles?.length) {
      return {
        userId: null,
        matched: false,
        warning: `"${naam}" niet gevonden in het systeem. Mogelijk een externe partij (ZZP'er/klant).`
      };
    }
    
    if (profiles.length === 1) {
      return { userId: profiles[0].id, matched: true };
    }
    
    // Meerdere matches - return eerste, maar met warning
    return {
      userId: profiles[0].id,
      matched: true,
      warning: `Meerdere matches voor "${naam}". Controleer of de juiste persoon is geselecteerd.`
    };
  } catch (error) {
    console.error('Assignee matching error:', error);
    return {
      userId: null,
      matched: false,
      warning: `Kon "${naam}" niet opzoeken`
    };
  }
}

// Fase 7D: Rijke beschrijving generator
function generateTaskDescription(
  item: ActionItem, 
  meetingMinute: MeetingMinute | null
): string {
  const lines: string[] = [];

  // Opdracht sectie
  lines.push('📋 OPDRACHT');
  lines.push('─'.repeat(40));
  lines.push(item.achtergrond || item.action);
  lines.push('');
  
  // Details
  if (item.onderwerp) lines.push(`ONDERWERP: ${item.onderwerp}`);
  if (item.doelgroep) lines.push(`DOELGROEP: ${item.doelgroep}`);
  if (item.actie_type) lines.push(`ACTIE TYPE: ${item.actie_type}`);
  if (item.onderwerp || item.doelgroep || item.actie_type) lines.push('');
  
  // Betrokkenen
  if (item.betrokkenen && item.betrokkenen.length > 0) {
    lines.push('👥 BETROKKENEN');
    lines.push('─'.repeat(40));
    item.betrokkenen.forEach(b => {
      const rolStr = b.rol ? ` (${b.rol})` : '';
      const relatieStr = b.relatie === 'uitleg_ontvanger' ? ' - ontvangt uitleg' : 
                        b.relatie === 'stakeholder' ? ' - stakeholder' : '';
      lines.push(`• ${b.naam}${rolStr}${relatieStr}`);
    });
    lines.push('');
  }
  
  // Externe partij
  if (item.externe_partij) {
    lines.push(`🏢 BETREFT: ${item.externe_partij.naam} (${item.externe_partij.type})`);
    lines.push('');
  }
  
  // Actieplan
  if (item.actieplan && item.actieplan.length > 0) {
    lines.push('🎯 VOORGESTELD ACTIEPLAN');
    lines.push('─'.repeat(40));
    item.actieplan.forEach((stap, i) => {
      lines.push(`${i + 1}. ☐ ${stap}`);
    });
    lines.push('');
  }
  
  // Suggestie
  if (item.suggestie) {
    lines.push('💡 SUGGESTIE');
    lines.push('─'.repeat(40));
    lines.push(`"${item.suggestie}"`);
    lines.push('');
  }
  
  // Bron
  lines.push('📄 BRON');
  lines.push('─'.repeat(40));
  if (meetingMinute?.tasks?.title) {
    lines.push(`Notule: ${meetingMinute.tasks.title}`);
  }
  if (meetingMinute?.tasks?.start_at) {
    lines.push(`Datum: ${new Date(meetingMinute.tasks.start_at).toLocaleDateString('nl-NL')}`);
  }
  if (item.source_quote) {
    lines.push(`Citaat: "${item.source_quote}"`);
  }
  lines.push('');
  
  // AI Metadata
  lines.push('🤖 AI INFO');
  lines.push('─'.repeat(40));
  lines.push(`Confidence: ${Math.round((item.confidence || 0) * 100)}%`);
  lines.push(`Classificatie: ${item.classification || 'TAAK'}`);
  
  return lines.join('\n');
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
      return { created: 0, failed: 0, taskIds: [], warnings: [] };
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

      // Fase 7D: Haal meeting minute op voor context
      const { data: meetingMinute } = await supabase
        .from('meeting_minutes')
        .select('*, tasks!meeting_minutes_task_id_fkey(id, title, start_at)')
        .eq('id', meetingMinuteId)
        .maybeSingle();

      // Map urgency naar database priority
      const mapPriority = (urgency?: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' => {
        switch (urgency) {
          case 'critical': return 'CRITICAL';
          case 'high': return 'HIGH';
          case 'medium': return 'MEDIUM';
          case 'low': return 'LOW';
          default: return 'MEDIUM';
        }
      };

      // Fase 7D: Process items met assignee matching
      const processedItems = await Promise.all(items.map(async (item) => {
        const assigneeMatch = await matchAssignee(item.assignee, userOrg.org_id);
        return { item, assigneeMatch };
      }));

      // Collect warnings
      const warnings: Array<{ index: number; warning: string }> = [];
      processedItems.forEach(({ assigneeMatch }, index) => {
        if (assigneeMatch.warning) {
          warnings.push({ index, warning: assigneeMatch.warning });
        }
      });

      // Transform meeting minute for description generation (partial type)
      const meetingMinuteForDesc: MeetingMinute | null = meetingMinute ? {
        id: meetingMinute.id,
        task_id: meetingMinute.task_id,
        org_id: meetingMinute.org_id,
        meeting_type: meetingMinute.meeting_type as MeetingMinute['meeting_type'],
        location: meetingMinute.location,
        meeting_link: meetingMinute.meeting_link,
        agenda_items: [],
        decisions: [],
        action_items: [],
        content: meetingMinute.content,
        status: meetingMinute.status as MeetingMinute['status'],
        approved_by: meetingMinute.approved_by,
        approved_at: meetingMinute.approved_at,
        next_meeting_date: meetingMinute.next_meeting_date,
        created_at: meetingMinute.created_at,
        updated_at: meetingMinute.updated_at,
        tasks: meetingMinute.tasks ? {
          id: meetingMinute.tasks.id,
          title: meetingMinute.tasks.title,
          start_at: meetingMinute.tasks.start_at,
          due_at: null
        } : null,
        meeting_attendees: []
      } : null;

      // Build tasks met rijke context (Fase 7D)
      // Serialize ai_context to plain JSON objects for Supabase
      const tasksToInsert = processedItems.map(({ item, assigneeMatch }) => ({
        org_id: userOrg.org_id,
        title: item.action.substring(0, 100),
        description: generateTaskDescription(item, meetingMinuteForDesc),
        priority: mapPriority(item.urgency) as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        due_at: item.deadline ? new Date(item.deadline).toISOString() : null,
        assignee_id: assigneeMatch.userId,
        category: 'action_item' as const,
        source_meeting_minute_id: meetingMinuteId,
        ai_context: JSON.parse(JSON.stringify({
          onderwerp: item.onderwerp || null,
          doelgroep: item.doelgroep || null,
          actie_type: item.actie_type || null,
          betrokkenen: item.betrokkenen || [],
          externe_partij: item.externe_partij || null,
          actieplan: item.actieplan || [],
          suggestie: item.suggestie || null,
          bron: {
            notule_titel: meetingMinute?.tasks?.title || null,
            notule_datum: meetingMinute?.tasks?.start_at || null,
            citaat: item.source_quote || null,
            meeting_minute_id: meetingMinuteId
          },
          ai_metadata: {
            confidence: item.confidence || 0,
            classificatie: item.classification || 'TAAK',
            extraction_version: '7D'
          }
        }))
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
        if (warnings.length > 0) {
          toast.success(`${createdCount} ${createdCount === 1 ? 'taak' : 'taken'} aangemaakt`, {
            description: `${warnings.length} waarschuwing(en) - controleer assignees`
          });
        } else {
          toast.success(`${createdCount} ${createdCount === 1 ? 'taak' : 'taken'} aangemaakt`);
        }
      }

      return {
        created: createdCount,
        failed: failedCount,
        taskIds,
        warnings,
      };
    } catch (error) {
      console.error('Create tasks error:', error);
      toast.error(error instanceof Error ? error.message : 'Kon taken niet aanmaken');
      return { created: 0, failed: items.length, taskIds: [], warnings: [] };
    } finally {
      setIsCreating(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return { createTasks, isCreating, progress };
}
