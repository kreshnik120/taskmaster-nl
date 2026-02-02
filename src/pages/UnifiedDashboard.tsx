import { useEffect, useState, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, User, Users, Briefcase, List, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getTabColors } from "@/lib/constants/designTokens";

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
      {/* Page Header - Dynamic Color */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg transition-all duration-300 ease-out-expo",
            getTabColors(activeTab).iconBg
          )}>
            <LayoutDashboard className={cn(
              "h-6 w-6 transition-colors duration-300",
              getTabColors(activeTab).accent
            )} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className={cn(
              "text-sm transition-colors duration-300",
              getTabColors(activeTab).accent,
              "opacity-80"
            )}>
              {getTabColors(activeTab).name}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full glass-layer-1 p-1.5 gap-1">
          {/* Mijn Werk */}
          <TabsTrigger 
            value="mijn-werk" 
            className={cn(
              "gap-2 relative transition-all duration-300 ease-out-expo",
              activeTab === "mijn-werk" && [
                "bg-tab-mijn-werk-100 dark:bg-tab-mijn-werk-900/50",
                "text-tab-mijn-werk-700 dark:text-tab-mijn-werk-300",
                "shadow-tab-mijn-werk"
              ]
            )}
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Mijn Werk</span>
            {activeTab === "mijn-werk" && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-mijn-werk-500" />
            )}
          </TabsTrigger>
          
          {/* Kalender */}
          <TabsTrigger 
            value="kalender" 
            className={cn(
              "gap-2 relative transition-all duration-300 ease-out-expo",
              activeTab === "kalender" && [
                "bg-tab-kalender-100 dark:bg-tab-kalender-900/50",
                "text-tab-kalender-700 dark:text-tab-kalender-300",
                "shadow-tab-kalender"
              ]
            )}
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Kalender</span>
            {activeTab === "kalender" && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-kalender-500" />
            )}
          </TabsTrigger>
          
          {/* Lijst */}
          <TabsTrigger 
            value="lijst" 
            className={cn(
              "gap-2 relative transition-all duration-300 ease-out-expo",
              activeTab === "lijst" && [
                "bg-tab-lijst-100 dark:bg-tab-lijst-900/50",
                "text-tab-lijst-700 dark:text-tab-lijst-300",
                "shadow-tab-lijst"
              ]
            )}
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Lijst</span>
            {activeTab === "lijst" && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-lijst-500" />
            )}
          </TabsTrigger>
          
          {/* Opvolging */}
          <TabsTrigger 
            value="opvolging" 
            className={cn(
              "gap-2 relative transition-all duration-300 ease-out-expo",
              activeTab === "opvolging" && [
                "bg-tab-opvolging-100 dark:bg-tab-opvolging-900/50",
                "text-tab-opvolging-700 dark:text-tab-opvolging-300",
                "shadow-tab-opvolging"
              ]
            )}
          >
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Opvolging</span>
            {activeTab === "opvolging" && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-opvolging-500" />
            )}
          </TabsTrigger>
          
          {/* Team */}
          <TabsTrigger 
            value="team" 
            className={cn(
              "gap-2 relative transition-all duration-300 ease-out-expo",
              activeTab === "team" && [
                "bg-tab-team-100 dark:bg-tab-team-900/50",
                "text-tab-team-700 dark:text-tab-team-300",
                "shadow-tab-team"
              ]
            )}
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team</span>
            {activeTab === "team" && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-team-500" />
            )}
          </TabsTrigger>
          
          {/* Recruitment */}
          <TabsTrigger 
            value="recruitment" 
            className={cn(
              "gap-2 relative transition-all duration-300 ease-out-expo",
              activeTab === "recruitment" && [
                "bg-tab-recruitment-100 dark:bg-tab-recruitment-900/50",
                "text-tab-recruitment-700 dark:text-tab-recruitment-300",
                "shadow-tab-recruitment"
              ]
            )}
          >
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Recruitment</span>
            {activeTab === "recruitment" && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-recruitment-500" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Mijn Werk */}
        <TabsContent value="mijn-werk" className="mt-6">
          <div className="glass-layer-1 glass-light-bleed shadow-float-indigo p-6 rounded-2xl space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <TodayFocusCard />
              <UpcomingRemindersWidget />
            </div>
            
            {/* Mijn Taken Kanban Flow */}
            <MyTasksFlowSection />
          </div>
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
