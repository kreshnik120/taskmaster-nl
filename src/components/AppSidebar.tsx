import { Home, Kanban, List, Calendar, Clock, BarChart3, Trash2, CheckCircle2, Brain, Users } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { UserProfileCard } from "./UserProfileCard";
import { User } from "@supabase/supabase-js";

const menuItems = [
  { title: "Mijn dag", url: "/", icon: Home },
  { title: "Kanban bord", url: "/kanban", icon: Kanban },
  { title: "Lijstweergave", url: "/lijst", icon: List },
  { title: "Kalender", url: "/kalender", icon: Calendar },
  { title: "Tijdregistratie", url: "/tijdregistratie", icon: Clock },
  { title: "Opvolging", url: "/opvolging", icon: BarChart3 },
  { title: "Afgeronde taken", url: "/afgerond", icon: CheckCircle2 },
  { title: "Verwijderde taken", url: "/verwijderd", icon: Trash2 },
  { title: "Professionals", url: "/professionals", icon: Users },
  { title: "AI Training", url: "/ai-training", icon: Brain },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { role, isAdmin, canEdit } = useUserRole();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    fetchUser();
  }, []);

  // ⚡ EFFICIENT COUNT: Uses idx_ai_knowledge_validation_deleted for fast query
  const { data: validationCount } = useQuery({
    queryKey: ['validation-queue-count'],
    queryFn: async () => {
      // Uses COUNT(*) with covering index (faster than HEAD on large tables)
      const { count, error } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .eq('validation_status', 'unverified')
        .is('deleted_at', null);
      
      if (error) {
        console.error('⚠️ Failed to fetch validation count:', error.code, error.message);
        return 0;
      }
      
      return count || 0;
    },
    enabled: isAdmin(),
    staleTime: 60000, // ⚡ CACHE: 60s (reduces queries)
    refetchInterval: 60000,
  });

  // ⚡ EFFICIENT COUNT: Active tasks (not completed, not deleted)
  const { data: activeTaskCount } = useQuery({
    queryKey: ['active-task-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .is('completed_at', null)
        .is('deleted_at', null);
      
      if (error) {
        console.error('⚠️ Failed to fetch task count:', error);
        return 0;
      }
      
      return count || 0;
    },
    staleTime: 30000, // ⚡ CACHE: 30s (tasks change more frequently)
    refetchInterval: 30000,
  });

  // 🔄 REAL-TIME: Listen for task changes
  useEffect(() => {
    const channel = supabase
      .channel('sidebar-tasks-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        () => {
          // Invalidate query to trigger instant refetch
          queryClient.invalidateQueries({ queryKey: ['active-task-count'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Je bent uitgelogd");
      navigate("/auth");
    } catch (error) {
      toast.error("Er ging iets mis bij het uitloggen");
    }
  };

  const handleSwitchAccount = async () => {
    try {
      await supabase.auth.signOut();
      toast.info("Log in met een ander account");
      navigate("/auth");
    } catch (error) {
      toast.error("Er ging iets mis bij het wisselen");
    }
  };

  const filteredMenuItems = menuItems.filter((item) => {
    if (item.url === '/ai-training') return isAdmin();
    if (item.url === '/professionals') return canEdit();
    return true;
  });

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-bold">TaskFlow</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={({ isActive }) =>
                        isActive ? "bg-accent text-accent-foreground" : ""
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.url === '/' && activeTaskCount !== undefined && activeTaskCount > 0 && (
                        <Badge variant="default" className="ml-auto">
                          {activeTaskCount > 99 ? '99+' : activeTaskCount}
                        </Badge>
                      )}
                      {item.url === '/ai-training' && isAdmin() && validationCount && validationCount > 0 && (
                        <Badge variant="destructive" className="ml-auto">
                          {validationCount > 999 ? '999+' : validationCount}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserProfileCard
          user={currentUser}
          role={role}
          onLogout={handleLogout}
          onSwitch={handleSwitchAccount}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
