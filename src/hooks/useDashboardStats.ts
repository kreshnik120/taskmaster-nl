import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, isBefore, isAfter, addDays, startOfDay } from "date-fns";

export interface AssigneeStats {
  userId: string;
  userName: string;
  total: number;
  completed: number;
  open: number;
  overdue: number;
}

export interface SourceStats {
  sourceId: string | null;
  sourceName: string;
  total: number;
  completed: number;
  open: number;
}

export interface OverdueTask {
  id: string;
  title: string;
  assignee: string | null;
  assigneeId: string | null;
  dueDate: string;
  daysOverdue: number;
  sourceName: string | null;
}

export interface UpcomingTask {
  id: string;
  title: string;
  assignee: string | null;
  assigneeId: string | null;
  dueDate: string;
  daysUntil: number;
}

export interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  overdueTasks: number;
  byStatus: {
    todo: number;
    in_progress: number;
    done: number;
    cancelled: number;
  };
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byAssignee: AssigneeStats[];
  bySource: SourceStats[];
  overdueTasksList: OverdueTask[];
  upcomingTasks: UpcomingTask[];
}

interface TaskRow {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  due_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  source_meeting_minute_id: string | null;
  profiles: { name: string | null } | null;
  meeting_minutes: { 
    id: string;
    tasks: { title: string } | null;
  } | null;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      // Fetch all non-deleted tasks with profiles and meeting minutes
      // Use explicit FK hint for profiles to avoid ambiguity
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
          id, title, priority, status, due_at, completed_at, assignee_id,
          source_meeting_minute_id,
          profiles!tasks_assignee_id_fkey(name),
          meeting_minutes!tasks_source_meeting_minute_id_fkey(
            id,
            tasks!meeting_minutes_task_id_fkey(title)
          )
        `)
        .is('deleted_at', null)
        .neq('category', 'meeting'); // Exclude meeting tasks (notulen)

      if (error) {
        console.error('Dashboard stats query error:', error);
        throw error;
      }

      const now = startOfDay(new Date());
      const sevenDaysFromNow = addDays(now, 7);

      // Initialize stats
      const stats: DashboardStats = {
        totalTasks: 0,
        completedTasks: 0,
        openTasks: 0,
        overdueTasks: 0,
        byStatus: { todo: 0, in_progress: 0, done: 0, cancelled: 0 },
        byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
        byAssignee: [],
        bySource: [],
        overdueTasksList: [],
        upcomingTasks: [],
      };

      if (!tasks || tasks.length === 0) return stats;

      // Aggregation maps
      const assigneeMap = new Map<string, AssigneeStats>();
      const sourceMap = new Map<string | null, SourceStats>();

      for (const task of tasks as TaskRow[]) {
        stats.totalTasks++;

        // Status counting
        const isCompleted = !!task.completed_at;
        if (isCompleted) {
          stats.completedTasks++;
          stats.byStatus.done++;
        } else {
          stats.openTasks++;
          const status = task.status || 'todo';
          if (status === 'todo') stats.byStatus.todo++;
          else if (status === 'in_progress') stats.byStatus.in_progress++;
          else if (status === 'cancelled') stats.byStatus.cancelled++;
        }

        // Priority counting
        const priority = (task.priority || 'medium').toLowerCase();
        if (priority === 'critical') stats.byPriority.critical++;
        else if (priority === 'high') stats.byPriority.high++;
        else if (priority === 'medium') stats.byPriority.medium++;
        else if (priority === 'low') stats.byPriority.low++;

        // Overdue check
        const dueDate = task.due_at ? new Date(task.due_at) : null;
        const isOverdue = dueDate && !isCompleted && isBefore(dueDate, now);
        if (isOverdue) {
          stats.overdueTasks++;
          const daysOverdue = differenceInDays(now, dueDate);
          
          // Get source name from meeting minutes
          let sourceName: string | null = null;
          if (task.meeting_minutes) {
            sourceName = task.meeting_minutes.tasks?.title || 'Notule';
          }

          stats.overdueTasksList.push({
            id: task.id,
            title: task.title,
            assignee: task.profiles?.name || null,
            assigneeId: task.assignee_id,
            dueDate: task.due_at!,
            daysOverdue,
            sourceName,
          });
        }

        // Upcoming tasks (next 7 days, not completed, not overdue)
        if (dueDate && !isCompleted && !isOverdue && isBefore(dueDate, sevenDaysFromNow)) {
          const daysUntil = differenceInDays(dueDate, now);
          stats.upcomingTasks.push({
            id: task.id,
            title: task.title,
            assignee: task.profiles?.name || null,
            assigneeId: task.assignee_id,
            dueDate: task.due_at!,
            daysUntil,
          });
        }

        // Assignee aggregation
        const assigneeId = task.assignee_id || 'unassigned';
        const assigneeName = task.profiles?.name || 'Niet toegewezen';
        
        if (!assigneeMap.has(assigneeId)) {
          assigneeMap.set(assigneeId, {
            userId: assigneeId,
            userName: assigneeName,
            total: 0,
            completed: 0,
            open: 0,
            overdue: 0,
          });
        }
        const assigneeStats = assigneeMap.get(assigneeId)!;
        assigneeStats.total++;
        if (isCompleted) assigneeStats.completed++;
        else assigneeStats.open++;
        if (isOverdue) assigneeStats.overdue++;

        // Source aggregation
        const sourceId = task.source_meeting_minute_id;
        let sourceName = 'Handmatig aangemaakt';
        if (task.meeting_minutes) {
          sourceName = task.meeting_minutes.tasks?.title || 'Notule';
        }

        if (!sourceMap.has(sourceId)) {
          sourceMap.set(sourceId, {
            sourceId,
            sourceName,
            total: 0,
            completed: 0,
            open: 0,
          });
        }
        const sourceStats = sourceMap.get(sourceId)!;
        sourceStats.total++;
        if (isCompleted) sourceStats.completed++;
        else sourceStats.open++;
      }

      // Convert maps to arrays and sort
      stats.byAssignee = Array.from(assigneeMap.values())
        .sort((a, b) => b.total - a.total);
      
      stats.bySource = Array.from(sourceMap.values())
        .sort((a, b) => b.total - a.total);

      // Sort overdue by most overdue first
      stats.overdueTasksList.sort((a, b) => b.daysOverdue - a.daysOverdue);

      // Sort upcoming by soonest first
      stats.upcomingTasks.sort((a, b) => a.daysUntil - b.daysUntil);

      return stats;
    },
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
