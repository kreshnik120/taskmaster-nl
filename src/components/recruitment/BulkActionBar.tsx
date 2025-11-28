import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  X, Send, Building2, MoveRight, Trash2, CheckCircle2 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkMove: (toStage: string) => void;
  onBulkAssignBureau: (bureau: string) => void;
  onBulkEmail: () => void;
  onBulkDelete: () => void;
}

const PIPELINE_STAGES = [
  { id: "nieuw", label: "Nieuw" },
  { id: "screening", label: "Screening" },
  { id: "interview", label: "Interview" },
  { id: "goedgekeurd", label: "Goedgekeurd" },
  { id: "geplaatst", label: "Geplaatst" },
];

const ORGANISATIES = ["ABCzorg", "CitoZorg"];

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onBulkMove,
  onBulkAssignBureau,
  onBulkEmail,
  onBulkDelete,
}: BulkActionBarProps) {
  const [moveToStage, setMoveToStage] = useState<string>("");
  const [assignBureau, setAssignBureau] = useState<string>("");

  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <div className="bg-primary text-primary-foreground rounded-lg shadow-lg border p-4 flex items-center gap-4 min-w-[600px]">
          {/* Selection Count */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground">
              {selectedCount}
            </Badge>
            <span className="text-sm font-medium">geselecteerd</span>
          </div>

          <div className="h-6 w-px bg-primary-foreground/20" />

          {/* Actions */}
          <div className="flex items-center gap-2 flex-1">
            {/* Bulk Move */}
            <Select value={moveToStage} onValueChange={(value) => {
              setMoveToStage(value);
              onBulkMove(value);
              setMoveToStage("");
            }}>
              <SelectTrigger className="h-9 w-[160px] bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
                <MoveRight className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Verplaats naar" />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk Assign Bureau */}
            <Select value={assignBureau} onValueChange={(value) => {
              setAssignBureau(value);
              onBulkAssignBureau(value);
              setAssignBureau("");
            }}>
              <SelectTrigger className="h-9 w-[160px] bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Wijs bureau toe" />
              </SelectTrigger>
              <SelectContent>
                {ORGANISATIES.map((org) => (
                  <SelectItem key={org} value={org}>
                    {org}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk Email */}
            <Button
              size="sm"
              variant="secondary"
              className="h-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-primary-foreground/20"
              onClick={onBulkEmail}
            >
              <Send className="h-4 w-4 mr-2" />
              Email verzenden
            </Button>

            {/* Bulk Delete */}
            <Button
              size="sm"
              variant="destructive"
              className="h-9"
              onClick={onBulkDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Verwijderen
            </Button>
          </div>

          {/* Clear Selection */}
          <Button
            size="sm"
            variant="ghost"
            className="h-9 hover:bg-primary-foreground/10 text-primary-foreground"
            onClick={onClearSelection}
          >
            <X className="h-4 w-4 mr-2" />
            Annuleren
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
