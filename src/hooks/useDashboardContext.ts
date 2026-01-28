import { useMemo } from "react";
import { useDashboardStats, DashboardStats } from "./useDashboardStats";

interface DashboardFilters {
  sourceId?: string;
  assigneeId?: string;
  includeCompleted?: boolean;
}

interface DashboardContextResult {
  stats: DashboardStats | undefined;
  filteredStats: DashboardStats | undefined;
  isLoading: boolean;
  error: Error | null;
  filters: DashboardFilters;
}

export function useDashboardContext(filters?: DashboardFilters): DashboardContextResult {
  const { data: stats, isLoading, error } = useDashboardStats();

  const filteredStats = useMemo(() => {
    if (!stats) return undefined;
    if (!filters || Object.keys(filters).length === 0) return stats;

    const { sourceId, assigneeId, includeCompleted = true } = filters;

    // Start with full stats as base
    let result: DashboardStats = { ...stats };

    // Filter by source
    if (sourceId) {
      result = {
        ...result,
        bySource: result.bySource.filter(s => s.sourceId === sourceId),
        overdueTasksList: result.overdueTasksList.filter(t => {
          // Would need source info on overdue tasks - simplified for now
          return true;
        }),
      };
    }

    // Filter by assignee
    if (assigneeId) {
      const assigneeStats = result.byAssignee.find(a => a.userId === assigneeId);
      
      if (assigneeStats) {
        result = {
          ...result,
          totalTasks: assigneeStats.total,
          completedTasks: assigneeStats.completed,
          openTasks: assigneeStats.open,
          overdueTasks: assigneeStats.overdue,
          byAssignee: [assigneeStats],
          overdueTasksList: result.overdueTasksList.filter(t => t.assigneeId === assigneeId),
          upcomingTasks: result.upcomingTasks.filter(t => t.assigneeId === assigneeId),
        };
      }
    }

    // Filter out completed if requested
    if (!includeCompleted) {
      result = {
        ...result,
        completedTasks: 0,
        byStatus: { ...result.byStatus, done: 0 },
      };
    }

    return result;
  }, [stats, filters]);

  return {
    stats,
    filteredStats: filteredStats || stats,
    isLoading,
    error: error as Error | null,
    filters: filters || {},
  };
}
