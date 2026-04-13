import { useEffect, useState, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, LayoutGrid, User, Users, List, Calendar, TrendingUp, Loader2, RefreshCw } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getTabColors } from "@/lib/constants/designTokens";
import { PageContainer, ContextColor } from "@/components/ui/page-container";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Tab-to-Context Color Mapping for dynamic PageContainer
const TAB_CONTEXT_MAP: Record<string, ContextColor> = {
  'mijn-werk': 'indigo',
  'kalender': 'teal', 
  'lijst': 'slate',
  'opvolging': 'amber',
  'team': 'violet',
};

// Tab configuration for DRY rendering
const TAB_CONFIG = [
  { value: 'mijn-werk', label: 'Mijn Werk', icon: User, colorKey: 'mijn-werk' },
  { value: 'kalender', label: 'Kalender', icon: Calendar, colorKey: 'kalender' },
  { value: 'lijst', label: 'Lijst', icon: List, colorKey: 'lijst' },
  { value: 'opvolging', label: 'Opvolging', icon: TrendingUp, colorKey: 'opvolging' },
  { value: 'team', label: 'Team', icon: Users, colorKey: 'team' },
] as const;

// Tab 1: Mijn Werk - Components
import { TodayFocusCard } from "@/components/dashboard/TodayFocusCard";
import { UpcomingRemindersWidget } from "@/components/UpcomingRemindersWidget";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { MyTasksFlowSection } from "@/components/dashboard/MyTasksFlowSection";

// Tab 2: Team Overzicht - Components
import { useDashboardStats } from "@/hooks/useDashboardStats";
import {
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
const MyWeekCalendarSection = lazy(() => import("@/components/dashboard/MyWeekCalendarSection"));

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
  const queryClient = useQueryClient();
  
  // Tab 2: Team Overzicht data
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  
  // Tab 3: Recruitment data - inline fetch for UrgencyActionPanel
  const [urgencyApplications, setUrgencyApplications] = useState<Application[]>([]);
  
  // Mijn Werk view toggle (persisted)
  const [mijnWerkView, setMijnWerkView] = useState<"bord" | "kalender">(
    () => (localStorage.getItem("mijn-werk-view") as "bord" | "kalender") || "bord"
  );

  const handleViewChange = (view: string) => {
    if (view === "bord" || view === "kalender") {
      setMijnWerkView(view);
      localStorage.setItem("mijn-werk-view", view);
    }
  };

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

  // Refresh handler for Team tab
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    toast.success("Statistieken vernieuwd");
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
      if (activeTab !== 'mijn-werk') {
        setSearchParams({ tab: 'mijn-werk', taskId });
      }
    }
  }, [searchParams]);

  // Callback when modal closes
  const handleTaskModalClose = (open: boolean) => {
    setTaskModalOpen(open);
    if (!open) {
      setSelectedTaskId(null);
      setSearchParams({ tab: activeTab });
    }
  };

  const handleTaskUpdated = () => {};

  return (
    <PageContainer 
      contextColor={TAB_CONTEXT_MAP[activeTab] || 'indigo'} 
      className="space-y-6 p-6"
      withVignette={true}
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-xl transition-all duration-300 ease-out-expo",
            "glass-inner-glow-3layer",
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

        {/* Refresh button for Team tab */}
        {activeTab === 'team' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={statsLoading}
            className="shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", statsLoading && "animate-spin")} />
            Vernieuwen
          </Button>
        )}
      </div>

      {/* Tabs - DRY with map */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-5 w-full glass-liquid-premium glass-specular-premium p-1.5 gap-1">
          {TAB_CONFIG.map(({ value, label, icon: Icon, colorKey }) => (
            <TabsTrigger 
              key={value}
              value={value} 
              className={cn(
                "gap-2 relative transition-all duration-300 ease-out-expo",
                activeTab === value && [
                  `bg-tab-${colorKey}-100 dark:bg-tab-${colorKey}-900/50`,
                  `text-tab-${colorKey}-700 dark:text-tab-${colorKey}-300`,
                  `shadow-tab-${colorKey}`
                ]
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
              {activeTab === value && (
                <span className={`absolute -bottom-[1px] left-2 right-2 h-[3px] rounded-full bg-tab-${colorKey}-500 shadow-[0_2px_8px_currentColor]`} />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab 1: Mijn Werk */}
        <TabsContent value="mijn-werk" className="mt-6">
          <div className="space-y-4">
            {/* Compact toolbar: Focus + Reminders + View toggle */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-3 min-w-0">
                <TodayFocusCard />
                <UpcomingRemindersWidget />
              </div>
              <ToggleGroup type="single" value={mijnWerkView} onValueChange={handleViewChange} className="glass-liquid-premium p-1 rounded-lg shrink-0">
                <ToggleGroupItem value="bord" className="gap-1.5 px-3 text-xs">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Bord</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="kalender" className="gap-1.5 px-3 text-xs">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Weekkalender</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Conditional view */}
            {mijnWerkView === "bord" ? (
              <MyTasksFlowSection />
            ) : (
              <Suspense fallback={<TabLoadingFallback />}>
                <MyWeekCalendarSection />
              </Suspense>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Team Overzicht - No duplicate header */}
        <TabsContent value="team" className="mt-6">
          <div className="space-y-6">
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
          </div>
        </TabsContent>

        {/* Tab 3: Lijst */}
        <TabsContent value="lijst" className="mt-6">
          <div className="space-y-6">
            <Suspense fallback={<TabLoadingFallback />}>
              <EmbeddedListView />
            </Suspense>
          </div>
        </TabsContent>

        {/* Tab 4: Kalender */}
        <TabsContent value="kalender" className="mt-6">
          <div className="space-y-6">
            <Suspense fallback={<TabLoadingFallback />}>
              <EmbeddedCalendarView />
            </Suspense>
          </div>
        </TabsContent>

        {/* Tab 5: Opvolging */}
        <TabsContent value="opvolging" className="mt-6">
          <div className="space-y-6">
            <Suspense fallback={<TabLoadingFallback />}>
              <EmbeddedOpvolgingView />
            </Suspense>
          </div>
        </TabsContent>
      </Tabs>

      {/* Task Detail Modal for deeplinks */}
      {selectedTaskId && (
        <TaskDetailModal
          task={{ id: selectedTaskId } as any}
          open={taskModalOpen}
          onOpenChange={handleTaskModalClose}
          contextColor={TAB_CONTEXT_MAP[activeTab] as any}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </PageContainer>
  );
}
