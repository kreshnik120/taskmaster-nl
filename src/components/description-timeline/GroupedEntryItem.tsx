import { Plus, Minus, Edit3, Eye, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { GroupedEntry, DescriptionChangeEntry } from "./types";
import { formatRelativeDate, truncateText } from "./utils";

interface GroupedEntryItemProps {
  group: GroupedEntry;
  index: number;
  isLast: boolean;
  onViewChange: (entry: DescriptionChangeEntry) => void;
  onViewGroup: (group: GroupedEntry) => void;
}

export function GroupedEntryItem({ 
  group, 
  index, 
  isLast, 
  onViewChange,
  onViewGroup 
}: GroupedEntryItemProps) {
  const entry = group.firstEntry;
  const hasContent = entry.metadata?.old_description || entry.metadata?.new_description;

  const getChangeIcon = (changeType?: string) => {
    switch (changeType) {
      case 'added':
        return <Plus className="h-3.5 w-3.5 text-emerald-600" />;
      case 'removed':
        return <Minus className="h-3.5 w-3.5 text-red-600" />;
      case 'modified':
      default:
        return <Edit3 className="h-3.5 w-3.5 text-blue-600" />;
    }
  };

  const getGroupIcon = () => {
    return <Layers className="h-3.5 w-3.5 text-primary" />;
  };

  return (
    <div 
      className="flex items-start gap-2 text-sm group animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Timeline indicator */}
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center",
          "bg-muted/50 group-hover:bg-muted transition-colors duration-200"
        )}>
          {group.isSingle 
            ? getChangeIcon(entry.metadata?.change_type)
            : getGroupIcon()
          }
        </div>
        {!isLast && (
          <div className="w-px h-4 bg-border/50 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {formatRelativeDate(entry.created_at)}
          </span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs font-medium">
            {group.created_by_name}
          </span>
          
          {/* Grouped badge of single badge */}
          {group.isSingle ? (
            <Badge 
              variant={
                entry.metadata?.change_type === 'added' ? 'success' :
                entry.metadata?.change_type === 'removed' ? 'destructive' : 'info'
              } 
              className="text-[10px] px-1.5 py-0"
            >
              {entry.metadata?.change_type === 'added' ? 'Toegevoegd' :
               entry.metadata?.change_type === 'removed' ? 'Verwijderd' : 'Gewijzigd'}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {group.count} wijzigingen
            </Badge>
          )}
        </div>

        {/* Preview or action */}
        {group.isSingle ? (
          // Single entry: show hover preview
          hasContent ? (
            <HoverCard openDelay={300}>
              <HoverCardTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 mt-1 text-xs text-primary/80 hover:text-primary transition-colors duration-200"
                  onClick={() => onViewChange(entry)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Bekijk
                </Button>
              </HoverCardTrigger>
              <HoverCardContent 
                side="right" 
                align="start"
                className="w-80 max-h-48 overflow-auto text-xs"
              >
                {entry.metadata?.change_type === 'added' ? (
                  <div>
                    <span className="font-medium text-emerald-600">Toegevoegd:</span>
                    <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                      {truncateText(entry.metadata.new_description, 200)}
                    </p>
                  </div>
                ) : entry.metadata?.change_type === 'removed' ? (
                  <div>
                    <span className="font-medium text-red-600">Verwijderd:</span>
                    <p className="mt-1 text-muted-foreground line-through whitespace-pre-wrap">
                      {truncateText(entry.metadata.old_description, 200)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium text-muted-foreground">Was:</span>
                      <p className="mt-0.5 text-muted-foreground/70 line-through whitespace-pre-wrap">
                        {truncateText(entry.metadata?.old_description, 100)}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-emerald-600">Werd:</span>
                      <p className="mt-0.5 whitespace-pre-wrap">
                        {truncateText(entry.metadata?.new_description, 100)}
                      </p>
                    </div>
                  </div>
                )}
              </HoverCardContent>
            </HoverCard>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 italic">
              Geen details
            </p>
          )
        ) : (
          // Grouped entries: show "Bekijk alle" button
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 mt-1 text-xs text-primary/80 hover:text-primary transition-colors duration-200"
            onClick={() => onViewGroup(group)}
          >
            <Eye className="h-3 w-3 mr-1" />
            Bekijk alle
          </Button>
        )}
      </div>
    </div>
  );
}
