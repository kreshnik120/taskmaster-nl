import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssigneeStats } from "@/hooks/useDashboardStats";

interface AssigneeProgressProps {
  assignees: AssigneeStats[];
  isLoading?: boolean;
}

export function AssigneeProgress({ assignees, isLoading }: AssigneeProgressProps) {
  const navigate = useNavigate();

  const handleClick = (userId: string) => {
    if (userId === 'unassigned') return;
    navigate(`/lijst?assignee=${userId}`);
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
    <Card>
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

          return (
            <div
              key={assignee.userId}
              onClick={() => handleClick(assignee.userId)}
              className={cn(
                "p-3 rounded-lg border transition-colors",
                isClickable && "cursor-pointer hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
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
