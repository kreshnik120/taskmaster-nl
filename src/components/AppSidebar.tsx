import { Home, Kanban, List, Calendar, Clock, BarChart3, Trash2, CheckCircle2, Brain, LogOut, Users } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
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
  const { isAdmin, canEdit } = useUserRole();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Je bent uitgelogd");
      navigate("/auth");
    } catch (error) {
      toast.error("Er ging iets mis bij het uitloggen");
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
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span>Uitloggen</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
