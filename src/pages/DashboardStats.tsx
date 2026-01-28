import { useDashboardStats } from "@/hooks/useDashboardStats";
import {
  DashboardHeader,
  StatCards,
  AssigneeProgress,
  SourceProgress,
  OverdueTasksList,
  UpcomingTasksList,
} from "@/components/dashboard-stats";

export default function DashboardStats() {
  const { data: stats, isLoading, error } = useDashboardStats();

  if (error) {
    return (
      <div className="p-6">
        <DashboardHeader isLoading={false} />
        <div className="mt-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          Er is een fout opgetreden bij het laden van de statistieken.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <DashboardHeader isLoading={isLoading} />

      {/* KPI Stat Cards */}
      <StatCards
        totalTasks={stats?.totalTasks ?? 0}
        openTasks={stats?.openTasks ?? 0}
        completedTasks={stats?.completedTasks ?? 0}
        overdueTasks={stats?.overdueTasks ?? 0}
        isLoading={isLoading}
      />

      {/* Two Column Layout for Progress Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AssigneeProgress
          assignees={stats?.byAssignee ?? []}
          isLoading={isLoading}
        />
        <SourceProgress
          sources={stats?.bySource ?? []}
          isLoading={isLoading}
        />
      </div>

      {/* Overdue and Upcoming Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OverdueTasksList
          tasks={stats?.overdueTasksList ?? []}
          isLoading={isLoading}
        />
        <UpcomingTasksList
          tasks={stats?.upcomingTasks ?? []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
