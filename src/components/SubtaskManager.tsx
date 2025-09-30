import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, GripVertical, Trash2, Calendar, Bell } from "lucide-react";
import { ReminderDialog } from "./ReminderDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
}

interface Subtask {
  id?: string;
  title: string;
  order: number;
  due_at?: string;
  assignee_id?: string;
  status?: string;
  isNew?: boolean;
}

interface SubtaskManagerProps {
  taskId?: string;
  profiles: Profile[];
  onSubtasksChange?: (subtasks: Subtask[]) => void;
}

function SortableSubtask({ 
  subtask, 
  index, 
  profiles, 
  onUpdate, 
  onDelete,
  onReminderClick 
}: { 
  subtask: Subtask; 
  index: number; 
  profiles: Profile[]; 
  onUpdate: (index: number, field: keyof Subtask, value: any) => void;
  onDelete: (index: number) => void;
  onReminderClick: (subtaskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: subtask.id || `new-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg border">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-2">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      
      <div className="flex-1 space-y-3">
        <Input
          placeholder="Subtaak titel..."
          value={subtask.title}
          onChange={(e) => onUpdate(index, 'title', e.target.value)}
          className="font-medium"
        />
        
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Toegewezen aan</Label>
            <Select
              value={subtask.assignee_id || "unassigned"}
              onValueChange={(value) => onUpdate(index, 'assignee_id', value === "unassigned" ? undefined : value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Niet toegewezen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Niet toegewezen</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name || profile.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Deadline</Label>
            <div className="relative">
              <Input
                type="datetime-local"
                value={subtask.due_at || ''}
                onChange={(e) => onUpdate(index, 'due_at', e.target.value)}
                className="h-8"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex gap-1 mt-2">
        {subtask.id && !subtask.isNew && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onReminderClick(subtask.id!)}
          >
            <Bell className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function SubtaskManager({ taskId, profiles, onSubtasksChange }: SubtaskManagerProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(false);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (taskId) {
      loadSubtasks();
    }
  }, [taskId]);

  useEffect(() => {
    onSubtasksChange?.(subtasks);
  }, [subtasks, onSubtasksChange]);

  const loadSubtasks = async () => {
    if (!taskId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('subtasks')
      .select('*')
      .eq('task_id', taskId)
      .order('order', { ascending: true });

    if (error) {
      toast({
        title: "Fout bij laden",
        description: "Kon subtaken niet laden",
        variant: "destructive",
      });
    } else {
      setSubtasks(data || []);
    }
    setLoading(false);
  };

  const addSubtask = () => {
    const newSubtask: Subtask = {
      title: '',
      order: subtasks.length,
      status: 'pending',
      isNew: true,
    };
    setSubtasks([...subtasks, newSubtask]);
  };

  const updateSubtask = (index: number, field: keyof Subtask, value: any) => {
    const updated = [...subtasks];
    updated[index] = { ...updated[index], [field]: value };
    setSubtasks(updated);
  };

  const deleteSubtask = async (index: number) => {
    const subtask = subtasks[index];
    
    if (subtask.id && !subtask.isNew) {
      const { error } = await supabase
        .from('subtasks')
        .delete()
        .eq('id', subtask.id);

      if (error) {
        toast({
          title: "Fout bij verwijderen",
          description: "Kon subtaak niet verwijderen",
          variant: "destructive",
        });
        return;
      }
    }

    const updated = subtasks.filter((_, i) => i !== index);
    // Reorder remaining subtasks
    updated.forEach((s, i) => s.order = i);
    setSubtasks(updated);

    toast({
      title: "Verwijderd",
      description: "Subtaak is verwijderd",
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSubtasks((items) => {
        const oldIndex = items.findIndex((item) => (item.id || `new-${items.indexOf(item)}`) === active.id);
        const newIndex = items.findIndex((item) => (item.id || `new-${items.indexOf(item)}`) === over.id);

        const reordered = arrayMove(items, oldIndex, newIndex);
        // Update order values
        reordered.forEach((item, index) => {
          item.order = index;
        });
        return reordered;
      });
    }
  };

  const saveSubtasks = async () => {
    if (!taskId) return;

    setLoading(true);
    
    // Filter out empty subtasks
    const validSubtasks = subtasks.filter(s => s.title.trim() !== '');

    for (const subtask of validSubtasks) {
      if (subtask.id && !subtask.isNew) {
        // Update existing
        const { error } = await supabase
          .from('subtasks')
          .update({
            title: subtask.title,
            order: subtask.order,
            due_at: subtask.due_at || null,
            assignee_id: subtask.assignee_id || null,
          })
          .eq('id', subtask.id);

        if (error) {
          toast({
            title: "Fout bij opslaan",
            description: `Kon subtaak "${subtask.title}" niet bijwerken`,
            variant: "destructive",
          });
        }
      } else if (subtask.isNew) {
        // Insert new
        const { error } = await supabase
          .from('subtasks')
          .insert({
            task_id: taskId,
            title: subtask.title,
            order: subtask.order,
            due_at: subtask.due_at || null,
            assignee_id: subtask.assignee_id || null,
            status: 'pending',
          });

        if (error) {
          toast({
            title: "Fout bij opslaan",
            description: `Kon subtaak "${subtask.title}" niet toevoegen`,
            variant: "destructive",
          });
        }
      }
    }

    toast({
      title: "Opgeslagen",
      description: "Subtaken zijn bijgewerkt",
    });

    setLoading(false);
    loadSubtasks();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Vervolgtaken / Proces stappen</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSubtask}
        >
          <Plus className="h-4 w-4 mr-1" />
          Subtaak toevoegen
        </Button>
      </div>

      {subtasks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
          <p>Nog geen subtaken. Klik op "Subtaak toevoegen" om te beginnen.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={subtasks.map((s, i) => s.id || `new-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {subtasks.map((subtask, index) => (
                <SortableSubtask
                  key={subtask.id || `new-${index}`}
                  subtask={subtask}
                  index={index}
                  profiles={profiles}
                  onUpdate={updateSubtask}
                  onDelete={deleteSubtask}
                  onReminderClick={(subtaskId) => {
                    setSelectedSubtaskId(subtaskId);
                    setReminderDialogOpen(true);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {taskId && subtasks.length > 0 && (
        <Button
          type="button"
          onClick={saveSubtasks}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Opslaan..." : "Subtaken opslaan"}
        </Button>
      )}

      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        subtaskId={selectedSubtaskId || undefined}
        onSuccess={() => {
          setSelectedSubtaskId(null);
        }}
      />
    </div>
  );
}
