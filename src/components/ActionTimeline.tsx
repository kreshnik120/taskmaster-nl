import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO, isToday, isWithinInterval, subDays } from "date-fns";
import { nl } from "date-fns/locale";
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  Plus,
  Clock,
  User,
  ListChecks,
  Calendar,
  Pencil,
  Trash2,
  X,
  Check,
  Filter,
  Search,
  ArrowUp,
  ArrowDown,
  Download,
  Copy,
  ClipboardCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ActionHistoryItem {
  id: string;
  action_text: string;
  action_type: 'followup' | 'note' | 'status_change';
  created_at: string;
  created_by_name?: string;
  completed_at?: string | null;
  completed_by_name?: string;
  is_current: boolean;
}

export interface ActiveSubtaskInfo {
  id: string;
  title: string;
  assignee_name?: string;
  due_at?: string;
}

interface ActionTimelineProps {
  taskId: string;
  currentAction: string | null;
  actionHistory: ActionHistoryItem[];
  activeSubtask?: ActiveSubtaskInfo | null;
  onActionAdded?: () => void;
  onActionCompleted?: () => void;
  onSubtaskCompleted?: (subtaskId: string) => void;
  compact?: boolean;
}

type DateFilterType = 'all' | 'today' | 'week' | 'month';

const FILTER_STORAGE_KEY = 'actionTimeline_filters';

export function ActionTimeline({ 
  taskId, 
  currentAction, 
  actionHistory, 
  activeSubtask,
  onActionAdded,
  onActionCompleted,
  onSubtaskCompleted,
  compact = false 
}: ActionTimelineProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newActionText, setNewActionText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completingAction, setCompletingAction] = useState<string | null>(null);
  
  // Edit state
  const [editingAction, setEditingAction] = useState<ActionHistoryItem | null>(null);
  const [editText, setEditText] = useState("");
  const [editingCurrentAction, setEditingCurrentAction] = useState(false);
  const [currentActionEditText, setCurrentActionEditText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Delete state
  const [deletingAction, setDeletingAction] = useState<ActionHistoryItem | null>(null);
  const [deletingCurrentAction, setDeletingCurrentAction] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Expand state for long texts
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // Export state
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  
  // Filter state with localStorage initialization
  const [showFilters, setShowFilters] = useState(() => {
    try {
      const saved = localStorage.getItem(`${FILTER_STORAGE_KEY}_${taskId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.showFilters ?? false;
      }
    } catch {}
    return false;
  });
  
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      const saved = localStorage.getItem(`${FILTER_STORAGE_KEY}_${taskId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.searchQuery ?? "";
      }
    } catch {}
    return "";
  });
  
  const [dateFilter, setDateFilter] = useState<DateFilterType>(() => {
    try {
      const saved = localStorage.getItem(`${FILTER_STORAGE_KEY}_${taskId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.dateFilter ?? 'all';
      }
    } catch {}
    return 'all';
  });
  
  const [userFilter, setUserFilter] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(`${FILTER_STORAGE_KEY}_${taskId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.userFilter ?? null;
      }
    } catch {}
    return null;
  });
  
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => {
    try {
      const saved = localStorage.getItem(`${FILTER_STORAGE_KEY}_${taskId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.sortOrder ?? 'asc';
      }
    } catch {}
    return 'asc';
  });
  
  const { toast } = useToast();

  const completedActions = actionHistory
    .filter(a => a.completed_at)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());

  // Extract unique users from action history
  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    actionHistory.forEach(action => {
      if (action.completed_by_name) {
        users.add(action.completed_by_name);
      }
    });
    return Array.from(users);
  }, [actionHistory]);

  // Filtered and sorted actions
  const filteredActions = useMemo(() => {
    let actions = completedActions;
    
    // Text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      actions = actions.filter(a => 
        a.action_text.toLowerCase().includes(query)
      );
    }
    
    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      
      actions = actions.filter(a => {
        if (!a.completed_at) return false;
        const completedDate = parseISO(a.completed_at);
        
        switch (dateFilter) {
          case 'today':
            return isToday(completedDate);
          case 'week':
            return isWithinInterval(completedDate, {
              start: subDays(now, 7),
              end: now
            });
          case 'month':
            return isWithinInterval(completedDate, {
              start: subDays(now, 30),
              end: now
            });
          default:
            return true;
        }
      });
    }
    
    // User filter
    if (userFilter) {
      actions = actions.filter(a => a.completed_by_name === userFilter);
    }
    
    // Sort
    return [...actions].sort((a, b) => {
      const dateA = new Date(a.completed_at!).getTime();
      const dateB = new Date(b.completed_at!).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [completedActions, searchQuery, dateFilter, userFilter, sortOrder]);

  // Check if any filter is active
  const hasActiveFilters = searchQuery || dateFilter !== 'all' || userFilter;
  const activeFilterCount = [searchQuery, dateFilter !== 'all', userFilter].filter(Boolean).length;

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCompleteSubtask = async () => {
    if (!activeSubtask || !onSubtaskCompleted) return;
    
    setCompletingAction(activeSubtask.title);
    await new Promise(resolve => setTimeout(resolve, 400));
    
    onSubtaskCompleted(activeSubtask.id);
    setCompletingAction(null);
  };

  const handleCompleteCurrentAction = async () => {
    if (!currentAction || completingAction) return;
    
    setCompletingAction(currentAction);
    await new Promise(resolve => setTimeout(resolve, 400));
    
    setIsCompleting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: existing } = await supabase
        .from('task_action_history')
        .select('id')
        .eq('task_id', taskId)
        .eq('action_text', currentAction)
        .limit(1);

      if (existing && existing.length > 0) {
        const { error: updateError } = await supabase
          .from('task_action_history')
          .update({ 
            completed_at: new Date().toISOString(), 
            completed_by: user?.id 
          })
          .eq('id', existing[0].id);
        if (updateError) throw updateError;
      } else {
        const { error: historyError } = await supabase
          .from('task_action_history')
          .insert({
            task_id: taskId,
            action_text: currentAction,
            action_type: 'followup',
            completed_at: new Date().toISOString(),
            completed_by: user?.id,
            is_current: false
          });
        if (historyError) throw historyError;
      }

      const { error: taskError } = await supabase
        .from('tasks')
        .update({ next_action: null })
        .eq('id', taskId);

      if (taskError) throw taskError;

      toast({
        title: "Actie voltooid",
        description: "De vervolgactie is gemarkeerd als afgerond."
      });

      onActionCompleted?.();
    } catch (error) {
      console.error('Error completing action:', error);
      toast({
        title: "Fout",
        description: "Kon de actie niet voltooien.",
        variant: "destructive"
      });
    } finally {
      setIsCompleting(false);
      setCompletingAction(null);
    }
  };

  const handleAddAction = async () => {
    if (!newActionText.trim()) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (currentAction) {
        const { data: existing } = await supabase
          .from('task_action_history')
          .select('id')
          .eq('task_id', taskId)
          .eq('action_text', currentAction)
          .limit(1);

        if (existing && existing.length > 0) {
          await supabase
            .from('task_action_history')
            .update({ 
              completed_at: new Date().toISOString(), 
              completed_by: user?.id 
            })
            .eq('id', existing[0].id);
        } else {
          await supabase
            .from('task_action_history')
            .insert({
              task_id: taskId,
              action_text: currentAction,
              action_type: 'followup',
              completed_at: new Date().toISOString(),
              completed_by: user?.id,
              is_current: false
            });
        }
      }

      const { error } = await supabase
        .from('tasks')
        .update({ next_action: newActionText.trim() })
        .eq('id', taskId);

      if (error) throw error;

      setNewActionText("");
      setIsAdding(false);
      
      toast({
        title: "Actie toegevoegd",
        description: "De nieuwe vervolgactie is ingesteld."
      });

      onActionAdded?.();
    } catch (error) {
      console.error('Error adding action:', error);
      toast({
        title: "Fout",
        description: "Kon de actie niet toevoegen.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit handlers
  const handleStartEditAction = (action: ActionHistoryItem) => {
    setEditingAction(action);
    setEditText(action.action_text);
  };

  const handleUpdateAction = async () => {
    if (!editingAction || !editText.trim() || isUpdating) return;
    
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('task_action_history')
        .update({ action_text: editText.trim() })
        .eq('id', editingAction.id);
        
      if (error) throw error;
      
      toast({ title: "Actie bijgewerkt" });
      setEditingAction(null);
      setEditText("");
      onActionAdded?.();
    } catch (error) {
      console.error('Error updating action:', error);
      toast({ 
        title: "Fout", 
        description: "Kon de actie niet bijwerken.",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartEditCurrentAction = () => {
    setEditingCurrentAction(true);
    setCurrentActionEditText(currentAction || "");
  };

  const handleUpdateCurrentAction = async () => {
    if (!currentActionEditText.trim() || isUpdating) return;
    
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ next_action: currentActionEditText.trim() })
        .eq('id', taskId);
        
      if (error) throw error;
      
      toast({ title: "Actie bijgewerkt" });
      setEditingCurrentAction(false);
      setCurrentActionEditText("");
      onActionAdded?.();
    } catch (error) {
      console.error('Error updating current action:', error);
      toast({ 
        title: "Fout", 
        description: "Kon de actie niet bijwerken.",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete handlers
  const handleDeleteAction = async () => {
    if (!deletingAction || isDeleting) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('task_action_history')
        .delete()
        .eq('id', deletingAction.id);
        
      if (error) throw error;
      
      toast({ title: "Actie verwijderd" });
      setDeletingAction(null);
      onActionAdded?.();
    } catch (error) {
      console.error('Error deleting action:', error);
      toast({ 
        title: "Fout", 
        description: "Kon de actie niet verwijderen.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCurrentAction = async () => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ next_action: null })
        .eq('id', taskId);
        
      if (error) throw error;
      
      toast({ title: "Actie verwijderd" });
      setDeletingCurrentAction(false);
      onActionAdded?.();
    } catch (error) {
      console.error('Error deleting current action:', error);
      toast({ 
        title: "Fout", 
        description: "Kon de actie niet verwijderen.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddAction();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewActionText("");
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, type: 'history' | 'current') => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (type === 'history') {
        handleUpdateAction();
      } else {
        handleUpdateCurrentAction();
      }
    } else if (e.key === 'Escape') {
      if (type === 'history') {
        setEditingAction(null);
        setEditText("");
      } else {
        setEditingCurrentAction(false);
        setCurrentActionEditText("");
      }
    }
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {currentAction && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-primary/5 via-primary/[0.03] to-transparent border border-primary/15 group">
            <div className="flex items-start gap-2.5">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <ArrowRight className="h-3 w-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-medium uppercase tracking-wider text-primary/70">
                  Volgende actie
                </span>
                <p className="text-sm font-medium text-foreground leading-snug mt-0.5 truncate">
                  {currentAction}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sync filters to localStorage
  useEffect(() => {
    const filterState = {
      showFilters,
      searchQuery,
      dateFilter,
      userFilter,
      sortOrder
    };
    try {
      localStorage.setItem(`${FILTER_STORAGE_KEY}_${taskId}`, JSON.stringify(filterState));
    } catch (error) {
      console.warn('Could not save filter state to localStorage:', error);
    }
  }, [taskId, showFilters, searchQuery, dateFilter, userFilter, sortOrder]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setDateFilter('all');
    setUserFilter(null);
    try {
      localStorage.removeItem(`${FILTER_STORAGE_KEY}_${taskId}`);
    } catch {}
  }, [taskId]);

  // Export helpers
  const formatActionsForExport = useCallback((actions: ActionHistoryItem[]) => {
    return actions.map(action => ({
      datum: action.completed_at 
        ? format(parseISO(action.completed_at), "d MMM yyyy HH:mm", { locale: nl })
        : "",
      actie: action.action_text,
      uitgevoerd_door: action.completed_by_name || "",
      type: action.action_type === 'followup' ? 'Opvolging' 
          : action.action_type === 'note' ? 'Notitie' 
          : 'Status wijziging'
    }));
  }, []);

  const exportToCSV = useCallback(() => {
    const actionsToExport = hasActiveFilters ? filteredActions : completedActions;
    
    if (actionsToExport.length === 0) {
      toast({
        title: "Geen acties om te exporteren",
        description: "Pas de filters aan of voeg eerst acties toe.",
        variant: "destructive"
      });
      return;
    }
    
    const formattedData = formatActionsForExport(actionsToExport);
    
    const headers = ["Datum", "Actie", "Uitgevoerd door", "Type"];
    const csvRows = [
      headers.join(";"),
      ...formattedData.map(row => 
        [row.datum, `"${row.actie.replace(/"/g, '""')}"`, row.uitgevoerd_door, row.type].join(";")
      )
    ];
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `actieverloop_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export gelukt",
      description: `${actionsToExport.length} acties geëxporteerd naar CSV.`
    });
  }, [hasActiveFilters, filteredActions, completedActions, formatActionsForExport, toast]);

  const copyToClipboard = useCallback(async () => {
    const actionsToExport = hasActiveFilters ? filteredActions : completedActions;
    
    if (actionsToExport.length === 0) {
      toast({
        title: "Geen acties om te kopiëren",
        description: "Pas de filters aan of voeg eerst acties toe.",
        variant: "destructive"
      });
      return;
    }
    
    const formattedData = formatActionsForExport(actionsToExport);
    
    const textContent = formattedData.map(row => 
      `${row.datum} - ${row.uitgevoerd_door || 'Onbekend'}\n${row.actie}`
    ).join("\n\n---\n\n");
    
    try {
      await navigator.clipboard.writeText(textContent);
      setCopiedToClipboard(true);
      
      toast({
        title: "Gekopieerd naar klembord",
        description: `${actionsToExport.length} acties gekopieerd.`
      });
      
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast({
        title: "Kopiëren mislukt",
        description: "Probeer het opnieuw of gebruik de CSV export.",
        variant: "destructive"
      });
    }
  }, [hasActiveFilters, filteredActions, completedActions, formatActionsForExport, toast]);

  return (
    <div className="space-y-4">
      {/* Header met filter toggle en toevoeg-knop */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Actieverloop
          {/* Active filter indicator badge */}
          {hasActiveFilters && (
            <span className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              {activeFilterCount}
            </span>
          )}
        </span>
        
        <div className="flex items-center gap-1">
          {/* Filter toggle - only show when there's history */}
          {completedActions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0 text-muted-foreground hover:text-foreground",
                showFilters && "bg-muted text-foreground"
              )}
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Filters tonen/verbergen"
              title="Filters"
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          )}
          
          {!isAdding && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Actie
            </Button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50 animate-in slide-in-from-top-1 duration-200">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek in acties..."
              className="h-8 pl-8 pr-8 text-sm bg-background"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery("")}
                aria-label="Zoekterm wissen"
                title="Wissen"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          {/* Filter row */}
          <div className="flex flex-wrap gap-2">
            {/* Date filter */}
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilterType)}>
              <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs bg-background">
                <Calendar className="h-3 w-3 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle data</SelectItem>
                <SelectItem value="today">Vandaag</SelectItem>
                <SelectItem value="week">Afgelopen 7 dagen</SelectItem>
                <SelectItem value="month">Afgelopen 30 dagen</SelectItem>
              </SelectContent>
            </Select>
            
            {/* User filter */}
            {uniqueUsers.length > 0 && (
              <Select 
                value={userFilter || "all"} 
                onValueChange={(v) => setUserFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs bg-background">
                  <User className="h-3 w-3 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle gebruikers</SelectItem>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Sort toggle */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs bg-background"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              aria-label={sortOrder === 'asc' ? 'Sorteren: oudste eerst' : 'Sorteren: nieuwste eerst'}
              title={sortOrder === 'asc' ? 'Oudste eerst' : 'Nieuwste eerst'}
            >
              {sortOrder === 'asc' ? (
                <>
                  <ArrowUp className="h-3 w-3 mr-1" />
                  Oudste eerst
                </>
              ) : (
                <>
                  <ArrowDown className="h-3 w-3 mr-1" />
                  Nieuwste eerst
                </>
              )}
            </Button>
            
            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
                aria-label="Alle filters wissen"
                title="Wissen"
              >
                <X className="h-3 w-3 mr-1" />
                Wissen
              </Button>
            )}
          </div>
          
          {/* Result indicator */}
          {hasActiveFilters && (
            <p className="text-[10px] text-muted-foreground">
              {filteredActions.length} van {completedActions.length} acties
            </p>
          )}
          
          {/* Export buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground mr-1">Export:</span>
            
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] bg-background"
              onClick={exportToCSV}
              disabled={completedActions.length === 0}
              aria-label="Exporteer naar CSV"
              title="Download als CSV bestand"
            >
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-6 px-2 text-[10px] bg-background transition-colors",
                copiedToClipboard && "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400"
              )}
              onClick={copyToClipboard}
              disabled={completedActions.length === 0}
              aria-label="Kopieer naar klembord"
              title="Kopieer acties naar klembord"
            >
              {copiedToClipboard ? (
                <>
                  <ClipboardCheck className="h-3 w-3 mr-1" />
                  Gekopieerd!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Kopiëren
                </>
              )}
            </Button>
            
            {hasActiveFilters && (
              <span className="text-[9px] text-muted-foreground/60 ml-auto">
                Export {filteredActions.length} gefilterde acties
              </span>
            )}
          </div>
        </div>
      )}

      {/* Timeline container */}
      <div className="relative">
        {/* Verticale connector lijn */}
        {(completedActions.length > 0 || currentAction || activeSubtask) && (
          <div 
            className="absolute left-[11px] top-3 bottom-3 w-px bg-border/60" 
            aria-hidden="true" 
          />
        )}

        <div className="space-y-2">
          {/* No results after filtering */}
          {filteredActions.length === 0 && completedActions.length > 0 && hasActiveFilters && (
            <div className="text-center py-4 text-sm text-muted-foreground/60">
              <Search className="h-4 w-4 mx-auto mb-1 opacity-50" />
              Geen acties gevonden voor deze filters
            </div>
          )}

          {/* Filtered completed actions */}
          {filteredActions.map((action) => {
            const isEditing = editingAction?.id === action.id;
            const isExpanded = expandedItems.has(action.id);
            const isLongText = action.action_text.length > 80;
            
            return (
              <div 
                key={action.id} 
                className="relative flex items-start gap-3 group rounded-lg -mx-2 px-2 py-1.5 hover:bg-muted/30 transition-colors"
              >
                {/* Status icon */}
                <div className="relative z-10 h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 ring-2 ring-background">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-0.5">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mb-0.5">
                    <Clock className="h-3 w-3" />
                    <span>
                      {action.completed_at && format(parseISO(action.completed_at), "d MMM 'om' HH:mm", { locale: nl })}
                    </span>
                    {action.completed_by_name && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {action.completed_by_name}
                        </span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-start justify-between gap-2">
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, 'history')}
                          className="h-8 text-sm flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={handleUpdateAction}
                          disabled={isUpdating}
                          aria-label="Opslaan"
                          title="Opslaan"
                        >
                          {isUpdating ? (
                            <div className="h-3.5 w-3.5 border-2 border-green-600/30 border-t-green-600 rounded-full animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingAction(null);
                            setEditText("");
                          }}
                          disabled={isUpdating}
                          aria-label="Annuleren"
                          title="Annuleren"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm text-muted-foreground leading-snug",
                            !isExpanded && isLongText && "line-clamp-2"
                          )}>
                            {action.action_text}
                          </p>
                          {isLongText && (
                            <button 
                              className="text-[10px] text-primary/60 hover:text-primary mt-0.5 font-medium"
                              onClick={() => toggleExpand(action.id)}
                            >
                              {isExpanded ? 'Minder tonen' : 'Meer tonen'}
                            </button>
                          )}
                        </div>
                        
                        {/* Hover action buttons */}
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
                            onClick={() => handleStartEditAction(action)}
                            aria-label="Bewerk actie"
                            title="Bewerk actie"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingAction(action)}
                            aria-label="Verwijder actie"
                            title="Verwijder actie"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* NU ACTIEF sectie - Prioriteit: Subtaak > next_action */}
          {(activeSubtask || currentAction) && (
            <div 
              className={cn(
                "relative flex items-start gap-3 group transition-all duration-300",
                (completingAction === activeSubtask?.title || completingAction === currentAction) && "animate-complete-slide-up"
              )}
            >
              {/* Pulse/Check indicator met morphing */}
              <div className={cn(
                "relative z-10 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ring-2 ring-background transition-colors duration-300",
                (completingAction === activeSubtask?.title || completingAction === currentAction)
                  ? "bg-green-100 dark:bg-green-900/30" 
                  : "bg-primary/10"
              )}>
                {(completingAction === activeSubtask?.title || completingAction === currentAction) ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 animate-check-pop" />
                ) : (
                  <>
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                    {activeSubtask ? (
                      <ListChecks className="h-3.5 w-3.5 text-primary relative z-10" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5 text-primary relative z-10" />
                    )}
                  </>
                )}
              </div>

              {/* Content card met kleurovergang */}
              <div className="flex-1 min-w-0">
                <div className={cn(
                  "p-3 rounded-xl border transition-all duration-300",
                  (completingAction === activeSubtask?.title || completingAction === currentAction)
                    ? "bg-green-50/50 dark:bg-green-900/20 border-green-200/50 dark:border-green-800/30" 
                    : "bg-gradient-to-r from-primary/[0.04] via-primary/[0.02] to-transparent border-primary/10 shadow-sm hover:shadow-md hover:border-primary/20"
                )}>
                  {editingCurrentAction && !activeSubtask ? (
                    // Inline edit mode voor current action
                    <div className="flex items-center gap-2">
                      <Input
                        value={currentActionEditText}
                        onChange={(e) => setCurrentActionEditText(e.target.value)}
                        onKeyDown={(e) => handleEditKeyDown(e, 'current')}
                        className="h-8 text-sm flex-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={handleUpdateCurrentAction}
                        disabled={isUpdating}
                        aria-label="Opslaan"
                        title="Opslaan"
                      >
                        {isUpdating ? (
                          <div className="h-3.5 w-3.5 border-2 border-green-600/30 border-t-green-600 rounded-full animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingCurrentAction(false);
                          setCurrentActionEditText("");
                        }}
                        disabled={isUpdating}
                        aria-label="Annuleren"
                        title="Annuleren"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "text-[10px] font-medium uppercase tracking-wider transition-colors duration-300",
                          (completingAction === activeSubtask?.title || completingAction === currentAction)
                            ? "text-green-600 dark:text-green-400" 
                            : "text-primary/70"
                        )}>
                          {(completingAction === activeSubtask?.title || completingAction === currentAction) 
                            ? "Voltooid!" 
                            : activeSubtask 
                              ? "Actieve Subtaak" 
                              : "Nu actief"}
                        </span>
                        <p className="text-sm font-medium text-foreground leading-snug mt-0.5">
                          {activeSubtask ? activeSubtask.title : currentAction}
                        </p>
                        
                        {/* Extra context voor subtaak */}
                        {activeSubtask && (activeSubtask.assignee_name || activeSubtask.due_at) && (
                          <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground/60">
                            {activeSubtask.assignee_name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {activeSubtask.assignee_name}
                              </span>
                            )}
                            {activeSubtask.due_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(parseISO(activeSubtask.due_at), "d MMM", { locale: nl })}
                              </span>
                            )}
                            </div>
                        )}
                        
                        {/* Hint voor subtaak editing */}
                        {activeSubtask && (
                          <p className="text-[9px] text-muted-foreground/40 mt-1.5 italic">
                            Bewerk via Processtappen
                          </p>
                        )}
                      </div>
                      
                      {/* Action buttons container */}
                      <div className="flex gap-1 shrink-0">
                        {/* Edit en Delete knoppen - alleen voor next_action, niet voor subtaken */}
                        {!activeSubtask && currentAction && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              onClick={handleStartEditCurrentAction}
                              aria-label="Bewerk huidige actie"
                              title="Bewerk actie"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingCurrentAction(true)}
                              aria-label="Verwijder huidige actie"
                              title="Verwijder actie"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-7 px-2 shrink-0 transition-all text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30",
                            (completingAction === activeSubtask?.title || completingAction === currentAction)
                              ? "opacity-100" 
                              : "opacity-0 group-hover:opacity-100"
                          )}
                          onClick={activeSubtask ? handleCompleteSubtask : handleCompleteCurrentAction}
                          disabled={isCompleting || !!completingAction}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          <span className="text-xs">Voltooid</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Nieuwe actie toevoegen */}
          {isAdding && (
            <div className="relative flex items-start gap-3">
              <div className="relative z-10 h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center shrink-0 ring-2 ring-background">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Input
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nieuwe vervolgactie..."
                    className="h-9 text-sm"
                    autoFocus
                    disabled={isSubmitting}
                  />
                  <Button
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={handleAddAction}
                    disabled={!newActionText.trim() || isSubmitting}
                  >
                    {isSubmitting ? "..." : "Toevoegen"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 shrink-0"
                    onClick={() => {
                      setIsAdding(false);
                      setNewActionText("");
                    }}
                  >
                    Annuleren
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Lege staat */}
          {!currentAction && !activeSubtask && completedActions.length === 0 && !isAdding && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted/30 mb-2">
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground/60 mb-2">
                Nog geen vervolgacties
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Eerste actie toevoegen
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog - Voltooide Actie */}
      <AlertDialog open={!!deletingAction} onOpenChange={() => setDeletingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Actie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze actie uit de historie wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog - Huidige Actie */}
      <AlertDialog open={deletingCurrentAction} onOpenChange={setDeletingCurrentAction}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Huidige actie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je de huidige vervolgactie wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCurrentAction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
