import { useEffect, useState, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, User, Users, Briefcase, List, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

// Tab 1: Mijn Werk - Components
import { TodayFocusCard } from "@/components/dashboard/TodayFocusCard";
import { UpcomingRemindersWidget } from "@/components/UpcomingRemindersWidget";
import { MyTasksFlowSection } from "@/components/dashboard/MyTasksFlowSection";
import { TaskDetailModal } from "@/components/TaskDetailModal";

// Tab 2: Team Overzicht - Components
import { useDashboardStats } from "@/hooks/useDashboardStats";
import {
  DashboardHeader,
  StatCards,
  AssigneeProgress,
  SourceProgress,
  OverdueTasksList,
  UpcomingTasksList,
} from "@/components/dashboard-stats";

// Tab 3: Recruitment - Components
import { RecruitmentKPIs } from "@/components/dashboard/RecruitmentKPIs";
import { UrgencyActionPanel } from "@/components/recruitment/UrgencyActionPanel";

// Lazy load embedded views for performance
const EmbeddedListView = lazy(() => import("@/components/dashboard/EmbeddedListView"));
const EmbeddedCalendarView = lazy(() => import("@/components/dashboard/EmbeddedCalendarView"));
const EmbeddedOpvolgingView = lazy(() => import("@/components/dashboard/EmbeddedOpvolgingView"));

// Loading fallback component
const TabLoadingFallback = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

interface Application {
  id: string;
  pipeline_stage: string;
  created_at: string;
  updated_at: string | null;
}

export default function UnifiedDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, isManager } = useUserRole();
  
  // Tab 2: Team Overzicht data
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  
  // Tab 3: Recruitment data - inline fetch for UrgencyActionPanel
  const [urgencyApplications, setUrgencyApplications] = useState<Application[]>([]);
  
  // Task deeplink handling
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Determine default tab based on user role
  const getDefaultTab = (): string => {
    if (isAdmin() || isManager()) return 'team';
    return 'mijn-werk';
  };

  // Get active tab from URL or use default
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam || getDefaultTab();

  // Handle tab change - update URL
  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  // Load urgency applications for Recruitment tab
  const loadUrgencyApplications = async () => {
    try {
      const { data } = await supabase
        .from("professional_applications")
        .select("id, pipeline_stage, created_at, updated_at")
        .is("deleted_at", null)
        .in("pipeline_stage", ["nieuw", "screening", "interview", "goedgekeurd"]);
      setUrgencyApplications(data || []);
    } catch (error) {
      console.error("Error loading urgency applications:", error);
    }
  };

  useEffect(() => {
    loadUrgencyApplications();
  }, []);

  // Handle taskId from URL (for deeplinks)
  useEffect(() => {
    const taskId = searchParams.get('taskId');
    if (taskId) {
      setSelectedTaskId(taskId);
      setTaskModalOpen(true);
      // Switch to mijn-werk tab if not already there
      if (activeTab !== 'mijn-werk') {
        setSearchParams({ tab: 'mijn-werk', taskId });
      }
    }
  }, [searchParams]);

  // Callback when modal closes - remove taskId from URL
  const handleTaskModalClose = (open: boolean) => {
    setTaskModalOpen(open);
    if (!open) {
      setSelectedTaskId(null);
      // Remove taskId from URL, keep tab
      setSearchParams({ tab: activeTab });
    }
  };

  // Callback when task is updated
  const handleTaskUpdated = () => {
    // Refresh happens via real-time subscription
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <LayoutDashboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Overzicht van taken, team en recruitment
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="mijn-werk" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Mijn Werk</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="recruitment" className="gap-2">
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Recruitment</span>
          </TabsTrigger>
          <TabsTrigger value="lijst" className="gap-2">
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Lijst</span>
          </TabsTrigger>
          <TabsTrigger value="kalender" className="gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Kalender</span>
          </TabsTrigger>
          <TabsTrigger value="opvolging" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Opvolging</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Mijn Werk */}
        <TabsContent value="mijn-werk" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <TodayFocusCard />
            <UpcomingRemindersWidget />
          </div>
          
          {/* Mijn Taken Kanban Flow */}
          <MyTasksFlowSection />
        </TabsContent>

        {/* Tab 2: Team Overzicht */}
        <TabsContent value="team" className="space-y-6 mt-6">
          <DashboardHeader isLoading={statsLoading} />
          
          {statsError ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              Er is een fout opgetreden bij het laden van de statistieken.
            </div>
          ) : (
            <>
              <StatCards 
                totalTasks={stats?.totalTasks ?? 0}
                openTasks={stats?.openTasks ?? 0}
                completedTasks={stats?.completedTasks ?? 0}
                overdueTasks={stats?.overdueTasks ?? 0}
                isLoading={statsLoading} 
              />
              
              <div className="grid gap-6 md:grid-cols-2">
                <AssigneeProgress 
                  assignees={stats?.byAssignee ?? []} 
                  isLoading={statsLoading} 
                />
                <SourceProgress 
                  sources={stats?.bySource ?? []} 
                  isLoading={statsLoading} 
                />
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <OverdueTasksList 
                  tasks={stats?.overdueTasksList ?? []} 
                  isLoading={statsLoading} 
                />
                <UpcomingTasksList 
                  tasks={stats?.upcomingTasks ?? []} 
                  isLoading={statsLoading} 
                />
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab 3: Recruitment */}
        <TabsContent value="recruitment" className="space-y-6 mt-6">
          <RecruitmentKPIs />
          {urgencyApplications.length > 0 && (
            <UrgencyActionPanel applications={urgencyApplications} />
          )}
        </TabsContent>

        {/* Tab 4: Lijst */}
        <TabsContent value="lijst" className="space-y-6 mt-6">
          <Suspense fallback={<TabLoadingFallback />}>
            <EmbeddedListView />
          </Suspense>
        </TabsContent>

        {/* Tab 5: Kalender */}
        <TabsContent value="kalender" className="space-y-6 mt-6">
          <Suspense fallback={<TabLoadingFallback />}>
            <EmbeddedCalendarView />
          </Suspense>
        </TabsContent>

        {/* Tab 6: Opvolging */}
        <TabsContent value="opvolging" className="space-y-6 mt-6">
          <Suspense fallback={<TabLoadingFallback />}>
            <EmbeddedOpvolgingView />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* Task Detail Modal for deeplinks */}
      {selectedTaskId && (
        <TaskDetailModal
          task={{ id: selectedTaskId } as any}
          open={taskModalOpen}
          onOpenChange={handleTaskModalClose}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </div>
  );
}
