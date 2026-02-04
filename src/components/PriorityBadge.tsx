import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getPriorityConfig, getPriorityTextClass, getPriorityOptions, type PriorityLevel } from "@/hooks/usePriorityConfig";

interface PriorityBadgeProps {
  taskId: string;
  priority: string | null;
  editable?: boolean;
  size?: "sm" | "md" | "lg";
}

export function PriorityBadge({ taskId, priority, editable = true, size = "md" }: PriorityBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const config = getPriorityConfig(priority);
  const Icon = config.icon;
  const priorityOptions = getPriorityOptions();

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-3 py-1 gap-1.5",
    lg: "text-base px-4 py-1.5 gap-2",
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  const handlePriorityChange = async (newPriority: string) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ priority: newPriority as PriorityLevel })
        .eq("id", taskId);

      if (error) throw error;

      toast({
        title: "Prioriteit bijgewerkt",
        description: `Prioriteit gewijzigd naar ${getPriorityConfig(newPriority).label}`,
      });
    } catch (error) {
      console.error("Error updating priority:", error);
      toast({
        title: "Fout",
        description: "Kon prioriteit niet bijwerken",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
      setIsEditing(false);
    }
  };

  if (!editable) {
    return (
      <div className={`${getPriorityTextClass(priority)} ${sizeClasses[size]} inline-flex items-center gap-1.5`}>
        <Icon size={iconSizes[size]} className="shrink-0" />
        <span className="text-xs">{config.label}</span>
      </div>
    );
  }

  if (isEditing) {
    const currentValue = (priority?.toUpperCase() || "MEDIUM") as PriorityLevel;
    return (
      <Select
        value={currentValue}
        onValueChange={handlePriorityChange}
        disabled={isUpdating}
        onOpenChange={(open) => !open && setIsEditing(false)}
        defaultOpen={true}
      >
        <SelectTrigger className={`${sizeClasses[size]} w-auto inline-flex items-center border-2 border-primary`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {priorityOptions.map((option) => {
            const ItemIcon = option.icon;
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  <ItemIcon size={14} />
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div
      className={`${getPriorityTextClass(priority)} ${sizeClasses[size]} inline-flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity`}
      onClick={() => setIsEditing(true)}
    >
      <Icon size={iconSizes[size]} className="shrink-0" />
      <span className="text-xs">{config.label}</span>
    </div>
  );
}
