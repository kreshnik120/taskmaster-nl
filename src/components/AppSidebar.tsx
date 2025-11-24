import { Home, Kanban, List, Calendar, Clock, BarChart3, Trash2, CheckCircle2, Brain, Users, ChevronDown } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { UserProfileCard } from "./UserProfileCard";
import { User } from "@supabase/supabase-js";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  badge?: 'taskCount' | 'validationCount';
  requiresEdit?: boolean;
  requiresAdmin?: boolean;
}

interface MenuGroup {
  label: string;
  defaultOpen: boolean | 'conditional';
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    label: "Dagelijks werk",
    defaultOpen: true,
    items: [
      { title: "Mijn dag", url: "/", icon: Home, badge: 'taskCount' },
      { title: "Kanban bord", url: "/kanban", icon: Kanban },
      { title: "Lijstweergave", url: "/lijst", icon: List },
      { title: "Kalender", url: "/kalender", icon: Calendar },
    ],
  },
  {
    label: "Analyse & Tracking",
    defaultOpen: false,
    items: [
      { title: "Tijdregistratie", url: "/tijdregistratie", icon: Clock },
      { title: "Opvolging", url: "/opvolging", icon: BarChart3 },
    ],
  },
  {
    label: "Archief",
    defaultOpen: false,
    items: [
      { title: "Afgeronde taken", url: "/afgerond", icon: CheckCircle2 },
      { title: "Verwijderde taken", url: "/verwijderd", icon: Trash2 },
    ],
  },
  {
    label: "Beheer",
    defaultOpen: 'conditional',
    items: [
      { title: "Professionals", url: "/professionals", icon: Users, requiresEdit: true },
      { title: "AI Training", url: "/ai-training", icon: Brain, badge: 'validationCount', requiresAdmin: true },
    ],
  },
];

interface CollapsibleGroupProps {
  group: MenuGroup;
  activeTaskCount?: number;
  validationCount?: number;
  canEdit: boolean;
  isAdmin: boolean;
}

const CollapsibleGroup = ({ 
  group, 
  activeTaskCount, 
  validationCount,
  canEdit,
  isAdmin 
}: CollapsibleGroupProps) => {
  const visibleItems = group.items.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    if (item.requiresEdit && !canEdit) return false;
    return true;
  });

  if (visibleItems.length === 0) return null;

  const shouldBeOpen = 
    group.defaultOpen === true ? true :
    group.defaultOpen === 'conditional' ? visibleItems.length > 0 :
    false;

  const [isOpen, setIsOpen] = useState(shouldBeOpen);

  const getBadgeCount = (badgeType?: string) => {
    if (badgeType === 'taskCount') return activeTaskCount;
    if (badgeType === 'validationCount') return validationCount;
    return undefined;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group rounded-md hover:bg-muted/50">
        <span>{group.label}</span>
        <ChevronDown className={cn(
          "h-4 w-4 transition-transform duration-200",
          isOpen && "transform rotate-180"
        )} />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-1">
        <SidebarMenu>
          {visibleItems.map((item) => {
            const badgeCount = getBadgeCount(item.badge);
            
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors relative",
                        isActive 
                          ? "bg-accent text-accent-foreground font-medium before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-primary before:rounded-r" 
                          : "hover:bg-muted/50"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{item.title}</span>
                    
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <Badge 
                        variant={item.badge === 'validationCount' ? 'destructive' : 'default'}
                        className="ml-auto shrink-0"
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </Badge>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  );
};

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

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-bold mb-4">
            TaskFlow
          </SidebarGroupLabel>
          
          <SidebarGroupContent className="space-y-1">
            {menuGroups.map((group) => (
              <CollapsibleGroup
                key={group.label}
                group={group}
                activeTaskCount={activeTaskCount}
                validationCount={validationCount}
                canEdit={canEdit()}
                isAdmin={isAdmin()}
              />
            ))}
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
