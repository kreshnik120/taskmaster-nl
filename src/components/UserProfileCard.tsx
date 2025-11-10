import { User } from "@supabase/supabase-js";
import { UserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, RefreshCw, User as UserIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface UserProfileCardProps {
  user: User | null;
  role: UserRole | null;
  onLogout: () => void;
  onSwitch: () => void;
}

export function UserProfileCard({ user, role, onLogout, onSwitch }: UserProfileCardProps) {
  if (!user) return null;

  const getRoleBadge = () => {
    switch (role) {
      case "admin":
        return <Badge className="bg-destructive text-destructive-foreground">🔴 ADMIN</Badge>;
      case "manager":
        return <Badge className="bg-orange-500 text-white">🟠 MANAGER</Badge>;
      case "user":
        return <Badge className="bg-green-600 text-white">🟢 USER</Badge>;
      default:
        return <Badge variant="outline">GEEN ROL</Badge>;
    }
  };

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Gebruiker";

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-md">
      <div className="flex items-start gap-2">
        <UserIcon className="h-5 w-5 mt-1 text-muted-foreground" />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <div className="mt-1">{getRoleBadge()}</div>
        </div>
      </div>
      
      <Separator className="my-1" />
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSwitch}
          className="flex-1 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Wissel
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="flex-1 text-xs"
        >
          <LogOut className="h-3 w-3 mr-1" />
          Uitloggen
        </Button>
      </div>
    </div>
  );
}
