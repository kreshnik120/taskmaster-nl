import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface PriorityBadgeProps {
  taskId: string;
  priority: string | null;
  editable?: boolean;
  size?: "sm" | "md" | "lg";
}

const priorityConfig = {
  LOW: {
    label: "Laag",
    color: "text-muted-foreground",
    icon: ArrowDown,
  },
  MEDIUM: {
    label: "Gemiddeld",
    color: "text-foreground",
    icon: Minus,
  },
  HIGH: {
    label: "Hoog",
    color: "text-foreground font-semibold",
    icon: ArrowUp,
  },
  CRITICAL: {
    label: "Kritiek",
    color: "text-foreground font-bold",
    icon: ArrowUp,
  },
};

export function PriorityBadge({ taskId, priority, editable = true, size = "md" }: PriorityBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const currentPriority = priority?.toUpperCase() || "MEDIUM";
  const config = priorityConfig[currentPriority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;
  const Icon = config.icon;

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
        .update({ priority: newPriority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" })
        .eq("id", taskId);

      if (error) throw error;

      toast({
        title: "Prioriteit bijgewerkt",
        description: `Prioriteit gewijzigd naar ${priorityConfig[newPriority as keyof typeof priorityConfig].label}`,
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
      <div className={`${config.color} ${sizeClasses[size]} inline-flex items-center gap-1.5`}>
        <Icon size={iconSizes[size]} className="shrink-0" />
        <span className="text-xs">{config.label}</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <Select
        value={currentPriority}
        onValueChange={handlePriorityChange}
        disabled={isUpdating}
        onOpenChange={(open) => !open && setIsEditing(false)}
        defaultOpen={true}
      >
        <SelectTrigger className={`${sizeClasses[size]} w-auto inline-flex items-center border-2 border-primary`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(priorityConfig).map(([key, value]) => {
            const ItemIcon = value.icon;
            return (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <ItemIcon size={14} />
                  <span>{value.label}</span>
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
      className={`${config.color} ${sizeClasses[size]} inline-flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity`}
      onClick={() => setIsEditing(true)}
    >
      <Icon size={iconSizes[size]} className="shrink-0" />
      <span className="text-xs">{config.label}</span>
    </div>
  );
}
