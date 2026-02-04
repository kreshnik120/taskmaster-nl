import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssigneeStats } from "@/hooks/useDashboardStats";
import { getAssigneeColor } from "@/hooks/useAssigneeColor";

interface AssigneeProgressProps {
  assignees: AssigneeStats[];
  isLoading?: boolean;
}

export function AssigneeProgress({ assignees, isLoading }: AssigneeProgressProps) {
  const navigate = useNavigate();

  const handleClick = (userId: string) => {
    if (userId === 'unassigned') return;
    navigate(`/dashboard?tab=lijst&assignee=${userId}`);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Per Medewerker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (assignees.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Per Medewerker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Geen taken gevonden</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card-violet">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Per Medewerker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignees.map((assignee) => {
          const progress = assignee.total > 0 
            ? Math.round((assignee.completed / assignee.total) * 100) 
            : 0;
          const isClickable = assignee.userId !== 'unassigned';
          const avatarColor = getAssigneeColor(assignee.userId);

          return (
            <div
              key={assignee.userId}
              onClick={() => handleClick(assignee.userId)}
              className={cn(
                "p-3 rounded-xl transition-all duration-200",
                "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
                "border border-white/30 dark:border-white/12",
                "shadow-[0_2px_6px_hsla(270,45%,55%,0.06)]",
                isClickable && "cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_12px_hsla(270,45%,55%,0.12)]"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={`text-xs ${avatarColor.avatarBg} ${avatarColor.avatarText}`}>
                    {getInitials(assignee.userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{assignee.userName}</p>
                  <p className="text-xs text-muted-foreground">
                    {assignee.completed}/{assignee.total} afgerond
                  </p>
                </div>
                {assignee.overdue > 0 && (
                  <Badge variant="destructive" className="shrink-0">
                    {assignee.overdue} verlopen
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Progress value={progress} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {progress}%
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
