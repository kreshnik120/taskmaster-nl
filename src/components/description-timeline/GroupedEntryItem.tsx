import { useState } from "react";
import { Plus, Minus, Edit3, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DiffView } from "@/components/DiffView";
import { GroupedEntry, DescriptionChangeEntry } from "./types";
import { formatRelativeDate, computeChangeSummary } from "./utils";

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
  const [expanded, setExpanded] = useState(false);
  const entry = group.firstEntry;

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

  const summary = computeChangeSummary(entry.metadata);

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
        </div>

        {/* Summary + expand toggle */}
        {group.isSingle ? (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer"
            >
              <span>{summary}</span>
              {expanded 
                ? <ChevronUp className="h-3 w-3" /> 
                : <ChevronDown className="h-3 w-3" />
              }
            </button>

            {/* Inline diff */}
            {expanded && (
              <div className="mt-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <DiffView
                  oldText={entry.metadata?.old_description}
                  newText={entry.metadata?.new_description}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">
              {group.count} wijzigingen
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 mt-1 text-xs text-primary/80 hover:text-primary transition-colors duration-200"
              onClick={() => onViewGroup(group)}
            >
              Bekijk alle
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
