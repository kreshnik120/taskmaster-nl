import { Eye, Pencil, Copy, Send, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface DienstQuickActionsProps {
  dienst: DienstData;
  children: React.ReactNode;
  onOpen: (dienst: DienstData) => void;
  onEdit: (dienst: DienstData) => void;
  onCopy: (dienst: DienstData) => void;
  onDelete: (dienst: DienstData) => void;
}

export function DienstQuickActions({
  dienst,
  children,
  onOpen,
  onEdit,
  onCopy,
  onDelete,
}: DienstQuickActionsProps) {
  const queryClient = useQueryClient();

  const handlePubliceren = async () => {
    const { error } = await supabase
      .from("diensten")
      .update({ status: "open" })
      .eq("id", dienst.id);
    if (error) {
      toast.error("Kon dienst niet publiceren");
      return;
    }
    toast.success("Dienst gepubliceerd");
    queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onOpen(dienst)}>
          <Eye className="h-4 w-4 mr-2" />
          Openen
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onEdit(dienst)}>
          <Pencil className="h-4 w-4 mr-2" />
          Bewerken
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCopy(dienst)}>
          <Copy className="h-4 w-4 mr-2" />
          Kopiëren
        </ContextMenuItem>
        {dienst.status === "concept" && (
          <ContextMenuItem onClick={handlePubliceren}>
            <Send className="h-4 w-4 mr-2" />
            Publiceren
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onDelete(dienst)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Verwijderen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
