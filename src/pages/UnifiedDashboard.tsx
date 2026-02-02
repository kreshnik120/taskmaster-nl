import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, User, Users, Briefcase, Focus, List, Calendar, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Application {
  id: string;
  pipeline_stage: string;
  created_at: string;
  updated_at: string | null;
}

// Type for sub-views within "Mijn Werk" tab
type MijnWerkView = 'focus' | 'lijst' | 'kalender' | 'opvolging';

const MIJN_WERK_VIEWS: { value: MijnWerkView; label: string; icon: typeof Focus }[] = [
  { value: 'focus', label: 'Focus', icon: Focus },
  { value: 'lijst', label: 'Lijst', icon: List },
  { value: 'kalender', label: 'Kalender', icon: Calendar },
  { value: 'opvolging', label: 'Opvolging', icon: TrendingUp },
];

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

  // Get active view for "Mijn Werk" tab from URL or default to 'focus'
  const viewParam = searchParams.get('view') as MijnWerkView | null;
  const mijnWerkView: MijnWerkView = 
    viewParam && MIJN_WERK_VIEWS.some(v => v.value === viewParam) 
      ? viewParam 
      : 'focus';

  // Handle tab change - update URL
  const handleTabChange = (value: string) => {
    // Preserve view param if switching to mijn-werk, otherwise remove it
    if (value === 'mijn-werk' && mijnWerkView !== 'focus') {
      setSearchParams({ tab: value, view: mijnWerkView });
    } else {
      setSearchParams({ tab: value });
    }
  };

  // Handle view change within "Mijn Werk" tab
  const handleViewChange = (value: string) => {
    if (value && MIJN_WERK_VIEWS.some(v => v.value === value)) {
      const newView = value as MijnWerkView;
      if (newView === 'focus') {
        // Remove view param for default focus view
        setSearchParams({ tab: 'mijn-werk' });
      } else {
        setSearchParams({ tab: 'mijn-werk', view: newView });
      }
    }
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
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="mijn-werk" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Mijn Werk</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team Overzicht</span>
          </TabsTrigger>
          <TabsTrigger value="recruitment" className="gap-2">
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Recruitment</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Mijn Werk */}
        <TabsContent value="mijn-werk" className="space-y-6 mt-6">
          {/* Sub-view switcher: Desktop ToggleGroup / Mobile Select */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Desktop: ToggleGroup */}
              <ToggleGroup 
                type="single" 
                value={mijnWerkView} 
                onValueChange={handleViewChange}
                className="hidden md:flex"
              >
                {MIJN_WERK_VIEWS.map((view) => (
                  <ToggleGroupItem 
                    key={view.value} 
                    value={view.value}
                    aria-label={view.label}
                    className="gap-2"
                  >
                    <view.icon className="h-4 w-4" />
                    {view.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* Mobile: Select dropdown */}
              <Select value={mijnWerkView} onValueChange={handleViewChange}>
                <SelectTrigger className="w-[160px] md:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MIJN_WERK_VIEWS.map((view) => (
                    <SelectItem key={view.value} value={view.value}>
                      <div className="flex items-center gap-2">
                        <view.icon className="h-4 w-4" />
                        {view.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Render view based on selection */}
          {mijnWerkView === 'focus' && (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <TodayFocusCard />
                <UpcomingRemindersWidget />
              </div>
              
              {/* Mijn Taken Kanban Flow */}
              <MyTasksFlowSection />
            </>
          )}

          {mijnWerkView === 'lijst' && (
            <div className="p-8 border border-dashed border-muted-foreground/30 rounded-lg text-center">
              <List className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">Lijstweergave</h3>
              <p className="text-muted-foreground">
                Wordt geïmplementeerd in Onderdeel 2
              </p>
            </div>
          )}

          {mijnWerkView === 'kalender' && (
            <div className="p-8 border border-dashed border-muted-foreground/30 rounded-lg text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">Kalenderweergave</h3>
              <p className="text-muted-foreground">
                Wordt geïmplementeerd in Onderdeel 2
              </p>
            </div>
          )}

          {mijnWerkView === 'opvolging' && (
            <div className="p-8 border border-dashed border-muted-foreground/30 rounded-lg text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">Opvolgingsweergave</h3>
              <p className="text-muted-foreground">
                Wordt geïmplementeerd in Onderdeel 2
              </p>
            </div>
          )}
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
