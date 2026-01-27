import { useState, useMemo, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Wand2, 
  ChevronDown, 
  Loader2,
  CheckSquare,
  Square,
  Filter,
  Quote,
  AlertTriangle,
  Lightbulb,
  Users,
  Building2,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionItem } from "@/hooks/useMeetingMinutes";
import { useCreateTasksFromItems } from "@/hooks/notulen/useCreateTasksFromItems";
import { useOrgMembers } from "@/hooks/notulen/useOrgMembers";

interface NotulenAssistentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingMinuteId: string;
  actionItems: ActionItem[];
  onTasksCreated: (count: number) => void;
}

type ClassificationFilter = 'all' | 'TAAK' | 'IDEE' | 'INFORMATIE';

// Classificatie badge component
function ClassificationBadge({ classification }: { classification?: string }) {
  const config: Record<string, { label: string; className: string }> = {
    TAAK: {
      label: 'TAAK',
      className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    },
    IDEE: {
      label: 'IDEE',
      className: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    },
    INFORMATIE: {
      label: 'INFO',
      className: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
    },
  };
  
  const c = config[classification || ''] || config.INFORMATIE;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", c.className)}>
      {c.label}
    </Badge>
  );
}

// Actie type badge
function ActieTypeBadge({ actieType }: { actieType?: string }) {
  if (!actieType) return null;
  
  const colors: Record<string, string> = {
    'Communicatie': 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    'Administratie': 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
    'Planning': 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
    'Onderzoek': 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
    'Beslissing': 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    'Overig': 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
  };
  
  return (
    <Badge variant="outline" className={cn("text-xs", colors[actieType] || colors['Overig'])}>
      {actieType}
    </Badge>
  );
}

// Confidence indicator component
function ConfidenceIndicator({ confidence }: { confidence?: number }) {
  const score = Math.round((confidence ?? 0) * 100);
  const colorClass = score >= 80 
    ? 'text-green-600 dark:text-green-400'
    : score >= 50 
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';
  
  const bgClass = score >= 80 
    ? 'bg-green-500'
    : score >= 50 
    ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all", bgClass)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("text-xs font-medium tabular-nums", colorClass)}>
        {score}%
      </span>
    </div>
  );
}

// Item component - Fase 7D: Uitgebreide weergave
function ActionItemRow({
  item,
  index,
  isSelected,
  onToggle,
  teamMembers,
  assigneeOverride,
  onAssigneeChange,
}: {
  item: ActionItem;
  index: number;
  isSelected: boolean;
  onToggle: (index: number) => void;
  teamMembers: Array<{ id: string; name: string }>;
  assigneeOverride?: string;
  onAssigneeChange: (index: number, userId: string) => void;
}) {
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Check if assignee is in system
  const isAssigneeInSystem = useMemo(() => {
    if (!item.assignee) return true;
    if (item.assignee.toLowerCase() === 'team') return false;
    return teamMembers.some(m => 
      m.name.toLowerCase().includes(item.assignee!.toLowerCase())
    );
  }, [item.assignee, teamMembers]);

  const hasExtraDetails = item.onderwerp || item.betrokkenen?.length || 
                          item.actieplan?.length || item.suggestie || item.externe_partij;
  
  return (
    <div className={cn(
      "p-3 rounded-lg border transition-colors",
      isSelected 
        ? "bg-primary/5 border-primary/20" 
        : "bg-card border-border hover:border-primary/20"
    )}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`item-${index}`}
          checked={isSelected}
          onCheckedChange={() => onToggle(index)}
          className="mt-0.5"
        />
        
        <div className="flex-1 min-w-0 space-y-2">
          {/* Action text */}
          <label 
            htmlFor={`item-${index}`}
            className="text-sm font-medium cursor-pointer block"
          >
            {item.action}
          </label>
          
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ClassificationBadge classification={item.classification} />
            <ActieTypeBadge actieType={item.actie_type} />
            
            {item.assignee && (
              <span className="text-muted-foreground">
                👤 {item.assignee}
              </span>
            )}
            
            {item.deadline && (
              <span className="text-muted-foreground">
                📅 {item.deadline}
              </span>
            )}
            
            <ConfidenceIndicator confidence={item.confidence} />
          </div>
          
          {/* Fase 7D: Assignee warnings */}
          {item.assignee && !isAssigneeInSystem && (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {item.assignee.toLowerCase() === 'team' 
                  ? '"Team" kan niet als assignee' 
                  : `"${item.assignee}" niet gevonden`}
              </span>
              <Select 
                value={assigneeOverride || ''}
                onValueChange={(val) => onAssigneeChange(index, val)}
              >
                <SelectTrigger className="w-[140px] h-7 text-xs">
                  <SelectValue placeholder="Selecteer..." />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="none">Niet toewijzen</SelectItem>
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Fase 7D: Extra details collapsible */}
          {hasExtraDetails && (
            <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                <ListChecks className="h-3 w-3" />
                <span>Details & actieplan</span>
                <ChevronDown className={cn(
                  "h-3 w-3 transition-transform",
                  isDetailsOpen && "rotate-180"
                )} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {/* Onderwerp & Doelgroep */}
                {(item.onderwerp || item.doelgroep) && (
                  <div className="text-xs space-y-1 pl-2 border-l-2 border-muted">
                    {item.onderwerp && (
                      <p><span className="font-medium">Onderwerp:</span> {item.onderwerp}</p>
                    )}
                    {item.doelgroep && (
                      <p><span className="font-medium">Doelgroep:</span> {item.doelgroep}</p>
                    )}
                  </div>
                )}
                
                {/* Betrokkenen */}
                {item.betrokkenen && item.betrokkenen.length > 0 && (
                  <div className="text-xs">
                    <div className="flex items-center gap-1 mb-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">Betrokkenen:</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pl-4">
                      {item.betrokkenen.map((b, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {b.naam} {b.rol && `(${b.rol})`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Externe partij */}
                {item.externe_partij && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded">
                    <Building2 className="h-3 w-3" />
                    <span>
                      Betreft {item.externe_partij.type}: <strong>{item.externe_partij.naam}</strong>
                    </span>
                  </div>
                )}
                
                {/* Actieplan */}
                {item.actieplan && item.actieplan.length > 0 && (
                  <div className="text-xs bg-muted/50 p-2 rounded">
                    <div className="flex items-center gap-1 mb-1">
                      <ListChecks className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">Voorgesteld actieplan:</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 pl-2">
                      {item.actieplan.map((stap, i) => (
                        <li key={i}>{stap}</li>
                      ))}
                    </ol>
                  </div>
                )}
                
                {/* Suggestie */}
                {item.suggestie && (
                  <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 p-2 rounded">
                    <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="italic">{item.suggestie}</span>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
          
          {/* Source quote collapsible */}
          {item.source_quote && (
            <Collapsible open={isQuoteOpen} onOpenChange={setIsQuoteOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Quote className="h-3 w-3" />
                <span>Bron citaat</span>
                <ChevronDown className={cn(
                  "h-3 w-3 transition-transform",
                  isQuoteOpen && "rotate-180"
                )} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <p className="text-xs text-muted-foreground italic pl-4 border-l-2 border-muted">
                  "{item.source_quote}"
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotulenAssistent({
  open,
  onOpenChange,
  meetingMinuteId,
  actionItems,
  onTasksCreated,
}: NotulenAssistentProps) {
  const { createTasks, isCreating } = useCreateTasksFromItems();
  const { data: orgMembers = [] } = useOrgMembers();
  
  // Map org members to simple format
  const teamMembers = useMemo(() => 
    orgMembers.map(m => ({ id: m.id, name: m.name || 'Onbekend' })),
    [orgMembers]
  );
  
  // Filter state
  const [filter, setFilter] = useState<ClassificationFilter>('all');
  
  // Assignee overrides (index -> userId)
  const [assigneeOverrides, setAssigneeOverrides] = useState<Map<number, string>>(new Map());
  
  // Pre-selection: TAAK met confidence >= 80%
  const initialSelection = useMemo(() => {
    const selected = new Set<number>();
    actionItems.forEach((item, index) => {
      if (item.classification === 'TAAK' && (item.confidence ?? 0) >= 0.8) {
        selected.add(index);
      }
    });
    return selected;
  }, [actionItems]);
  
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(initialSelection);
  
  // Reset selection when actionItems change
  useMemo(() => {
    setSelectedIndices(initialSelection);
    setAssigneeOverrides(new Map());
  }, [initialSelection]);
  
  // Filtered items
  const filteredItems = useMemo(() => {
    if (filter === 'all') return actionItems;
    return actionItems.filter(item => item.classification === filter);
  }, [actionItems, filter]);
  
  // Get original index for filtered item
  const getOriginalIndex = useCallback((filteredIndex: number) => {
    if (filter === 'all') return filteredIndex;
    const filteredItem = filteredItems[filteredIndex];
    return actionItems.indexOf(filteredItem);
  }, [actionItems, filteredItems, filter]);
  
  // Toggle selection
  const handleToggle = useCallback((filteredIndex: number) => {
    const originalIndex = getOriginalIndex(filteredIndex);
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(originalIndex)) {
        next.delete(originalIndex);
      } else {
        next.add(originalIndex);
      }
      return next;
    });
  }, [getOriginalIndex]);
  
  // Assignee override handler
  const handleAssigneeChange = useCallback((originalIndex: number, userId: string) => {
    setAssigneeOverrides(prev => {
      const next = new Map(prev);
      if (userId === 'none' || !userId) {
        next.delete(originalIndex);
      } else {
        next.set(originalIndex, userId);
      }
      return next;
    });
  }, []);
  
  // Bulk actions
  const handleSelectAllTaken = useCallback(() => {
    const newSelection = new Set(selectedIndices);
    actionItems.forEach((item, index) => {
      if (item.classification === 'TAAK') {
        newSelection.add(index);
      }
    });
    setSelectedIndices(newSelection);
  }, [actionItems, selectedIndices]);
  
  const handleDeselectAll = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);
  
  // Submit
  const handleSubmit = useCallback(async () => {
    const selectedItems = actionItems.filter((_, index) => selectedIndices.has(index));
    const result = await createTasks(selectedItems, meetingMinuteId);
    
    if (result.created > 0) {
      onTasksCreated(result.created);
      onOpenChange(false);
    }
  }, [actionItems, selectedIndices, createTasks, meetingMinuteId, onTasksCreated, onOpenChange]);
  
  const selectedCount = selectedIndices.size;
  const totalCount = actionItems.length;
  
  // Counts per classification
  const counts = useMemo(() => ({
    all: actionItems.length,
    TAAK: actionItems.filter(i => i.classification === 'TAAK').length,
    IDEE: actionItems.filter(i => i.classification === 'IDEE').length,
    INFORMATIE: actionItems.filter(i => i.classification === 'INFORMATIE').length,
  }), [actionItems]);
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[640px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Notulen Assistent
          </SheetTitle>
          <SheetDescription>
            Selecteer items om als taak aan te maken. Items met classificatie "TAAK" 
            en hoge betrouwbaarheid zijn automatisch geselecteerd.
          </SheetDescription>
        </SheetHeader>
        
        <Separator className="my-4" />
        
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 pb-4">
          <div className="flex items-center gap-1 mr-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          
          {(['all', 'TAAK', 'IDEE', 'INFORMATIE'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="h-7 px-2.5"
            >
              {f === 'all' ? 'Alle' : f === 'INFORMATIE' ? 'INFO' : f}
              <Badge 
                variant="secondary" 
                className={cn(
                  "ml-1.5 h-4 px-1 text-xs",
                  filter === f && "bg-primary-foreground/20"
                )}
              >
                {counts[f]}
              </Badge>
            </Button>
          ))}
          
          <div className="flex-1" />
          
          {/* Bulk actions */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAllTaken}
            className="h-7 text-xs"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            Selecteer alle TAKEN
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeselectAll}
            className="h-7 text-xs"
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            Deselecteer
          </Button>
        </div>
        
        {/* Items list */}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-2 pb-4">
            {filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {filter === 'all' 
                  ? "Geen action items gevonden"
                  : `Geen items met classificatie "${filter}"`
                }
              </div>
            ) : (
              filteredItems.map((item, filteredIndex) => {
                const originalIndex = getOriginalIndex(filteredIndex);
                return (
                  <ActionItemRow
                    key={originalIndex}
                    item={item}
                    index={filteredIndex}
                    isSelected={selectedIndices.has(originalIndex)}
                    onToggle={handleToggle}
                    teamMembers={teamMembers}
                    assigneeOverride={assigneeOverrides.get(originalIndex)}
                    onAssigneeChange={(_, userId) => handleAssigneeChange(originalIndex, userId)}
                  />
                );
              })
            )}
          </div>
        </ScrollArea>
        
        <Separator className="my-4" />
        
        <SheetFooter className="flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {selectedCount} van {totalCount} geselecteerd
          </p>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Annuleren
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isCreating || selectedCount === 0}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Maak {selectedCount} {selectedCount === 1 ? 'taak' : 'taken'} aan
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
