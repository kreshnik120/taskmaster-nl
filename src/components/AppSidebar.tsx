import { Clock, Trash2, CheckCircle2, Brain, Users, ChevronDown, ChevronUp, Briefcase, Building2, Link2, LogOut, RefreshCw, Archive, Paperclip, FileText, LayoutDashboard, MessageCircle, Receipt } from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter } from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { User } from "@supabase/supabase-js";
import { usePendingMinutesCount } from "@/hooks/notulen/usePendingMinutesCount";
import { useWhatsAppUnreadCount } from "@/hooks/whatsapp/useWhatsAppUnreadCount";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { getAssigneeColor } from "@/hooks/useAssigneeColor";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  badge?: 'taskCount' | 'validationCount' | 'pendingMinutesCount' | 'whatsappUnreadCount';
  requiresEdit?: boolean;
  requiresAdmin?: boolean;
}
interface MenuGroup {
  label: string;
  defaultOpen: boolean | 'conditional';
  items: MenuItem[];
}
const menuGroups: MenuGroup[] = [{
  label: "Mijn Werk",
  defaultOpen: true,
  items: [{
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    badge: 'taskCount'
  }, {
    title: "WhatsApp",
    url: "/whatsapp",
    icon: MessageCircle,
    badge: 'whatsappUnreadCount'
}, {
  title: "Bijlagen",
    url: "/bijlagen",
    icon: Paperclip
  }, {
    title: "Notulen",
    url: "/notulen",
    icon: FileText,
    badge: 'pendingMinutesCount'
  }]
}, {
  label: "Recruitment",
  defaultOpen: true,
  items: [{
    title: "Sollicitaties",
    url: "/sollicitaties",
    icon: Briefcase,
    requiresEdit: true
  }, {
    title: "Professionals",
    url: "/professionals",
    icon: Users,
    requiresEdit: true
  }, {
    title: "Klanten",
    url: "/klanten",
    icon: Building2,
    requiresEdit: true
  }, {
    title: "Plaatsingen",
    url: "/plaatsingen",
    icon: Link2,
    requiresEdit: true
  }, {
    title: "Facturatie",
    url: "/facturatie",
    icon: Receipt,
    requiresEdit: true
  }]
}, {
  label: "Analyse & AI",
  defaultOpen: 'conditional',
  items: [{
    title: "AI Training",
    url: "/ai-training",
    icon: Brain,
    badge: 'validationCount',
    requiresAdmin: true
  }, {
    title: "Gebruikers",
    url: "/gebruikers",
    icon: Users,
    requiresAdmin: true
  }]
}, {
  label: "Archief",
  defaultOpen: false,
  items: [{
    title: "Afgeronde taken",
    url: "/afgerond",
    icon: CheckCircle2
  }, {
    title: "Verwijderde taken",
    url: "/verwijderd",
    icon: Trash2
  }, {
    title: "Sollicitaties archief",
    url: "/sollicitaties-archief",
    icon: Archive,
    requiresEdit: true
  }, {
    title: "Tijdregistratie",
    url: "/tijdregistratie",
    icon: Clock
  }]
}];
interface CollapsibleGroupProps {
  group: MenuGroup;
  activeTaskCount?: number;
  validationCount?: number;
  pendingMinutesCount?: number;
  whatsappUnreadCount?: number;
  canEdit: boolean;
  isAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
}
const CollapsibleGroup = ({
  group,
  activeTaskCount,
  validationCount,
  pendingMinutesCount,
  whatsappUnreadCount,
  canEdit,
  isAdmin,
  isOpen,
  onToggle
}: CollapsibleGroupProps) => {
  const location = useLocation();
  
  const visibleItems = group.items.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    if (item.requiresEdit && !canEdit) return false;
    return true;
  });
  if (visibleItems.length === 0) return null;
  const getBadgeCount = (badgeType?: string) => {
    if (badgeType === 'taskCount') return activeTaskCount;
    if (badgeType === 'validationCount') return validationCount;
    if (badgeType === 'pendingMinutesCount') return pendingMinutesCount;
    if (badgeType === 'whatsappUnreadCount') return whatsappUnreadCount;
    return undefined;
  };
  return <Collapsible open={isOpen} onOpenChange={onToggle} className="mb-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground/70 hover:text-foreground transition-colors group rounded-md hover:bg-sidebar-accent/50">
        <span>{group.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "transform rotate-180")} />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-1">
        <SidebarMenu>
          {visibleItems.map(item => {
          const badgeCount = getBadgeCount(item.badge);
          const isActive = item.url === "/" 
            ? location.pathname === "/" 
            : location.pathname === item.url;
          
          return <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <NavLink 
                    to={item.url}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    isActive 
                        ? "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm text-primary font-medium border-l-[3px] border-primary shadow-[0_1px_4px_rgba(0,0,0,0.04)]" 
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/40 dark:hover:bg-slate-800/40"
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{item.title}</span>
                    
                    {badgeCount !== undefined && badgeCount > 0 && <Badge variant="secondary" className="ml-auto shrink-0 bg-muted text-muted-foreground text-[10px] px-1.5">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </Badge>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>;
        })}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>;
};
export function AppSidebar() {
  const navigate = useNavigate();
  const {
    role,
    isAdmin,
    canEdit
  } = useUserRole();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const { pendingCount } = usePendingMinutesCount();
  const whatsappUnreadCount = useWhatsAppUnreadCount();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Mijn Werk": true,
    "Recruitment": true,
    "Analyse & AI": isAdmin(),
    "Archief": false,
  });

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    fetchUser();
  }, []);

  // ⚡ EFFICIENT COUNT: Uses idx_ai_knowledge_validation_deleted for fast query
  const {
    data: validationCount
  } = useQuery({
    queryKey: ['validation-queue-count'],
    queryFn: async () => {
      // Uses COUNT(*) with covering index (faster than HEAD on large tables)
      const {
        count,
        error
      } = await supabase.from('ai_knowledge_base').select('*', {
        count: 'exact',
        head: true
      }).eq('validation_status', 'unverified').is('deleted_at', null);
      if (error) {
        console.error('⚠️ Failed to fetch validation count:', error.code, error.message);
        return 0;
      }
      return count || 0;
    },
    enabled: isAdmin(),
    staleTime: 60000,
    // ⚡ CACHE: 60s (reduces queries)
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // ⚡ EFFICIENT COUNT: Active tasks (not completed, not deleted)
  const {
    data: activeTaskCount
  } = useQuery({
    queryKey: ['active-task-count'],
    queryFn: async () => {
      const {
        count,
        error
      } = await supabase.from('tasks').select('*', {
        count: 'exact',
        head: true
      }).is('completed_at', null).is('deleted_at', null);
      if (error) {
        console.error('⚠️ Failed to fetch task count:', error);
        return 0;
      }
      return count || 0;
    },
    staleTime: 30000,
    // ⚡ CACHE: 30s (tasks change more frequently)
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // 🔄 REAL-TIME: Listen for task changes via standardized hook
  useRealtimeChannel({
    channelName: 'sidebar-tasks-count',
    table: 'tasks',
    onEvent: () => queryClient.invalidateQueries({ queryKey: ['active-task-count'] }),
    debounceMs: 200
  });
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
  const displayName = currentUser?.user_metadata?.full_name || currentUser?.email?.split("@")[0] || "Gebruiker";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const userAvatarColor = getAssigneeColor(currentUser?.id);

  const getRoleLabel = () => {
    switch (role) {
      case "admin":
        return "Admin";
      case "manager":
        return "Manager";
      case "user":
        return "Gebruiker";
      default:
        return "Geen rol";
    }
  };

  return <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-bold mb-4">
            TaskFlow
          </SidebarGroupLabel>
          
          <SidebarGroupContent className="space-y-1">
            {menuGroups.map((group, index) => (
              <div key={group.label}>
                {index > 0 && <Separator className="my-3 mx-4" />}
                <CollapsibleGroup 
                  group={group} 
                  activeTaskCount={activeTaskCount} 
                  validationCount={validationCount} 
                  pendingMinutesCount={pendingCount}
                  whatsappUnreadCount={whatsappUnreadCount}
                  canEdit={canEdit()} 
                  isAdmin={isAdmin()}
                  isOpen={openGroups[group.label] ?? false}
                  onToggle={() => toggleGroup(group.label)}
                />
              </div>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 px-3 py-2 h-auto hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all duration-200 bg-white/30 dark:bg-slate-900/30 border border-white/20 dark:border-white/8"
            >
              <Avatar className="h-8 w-8 ring-2 ring-white/20 dark:ring-white/10">
                <AvatarFallback className={`text-xs ${userAvatarColor.avatarBg} ${userAvatarColor.avatarText}`}>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-sm flex-1 min-w-0">
                <span className="font-medium truncate w-full">{displayName}</span>
                <span className="text-xs text-muted-foreground">{getRoleLabel()}</span>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem onClick={handleSwitchAccount}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Wissel account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Uitloggen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>;
}