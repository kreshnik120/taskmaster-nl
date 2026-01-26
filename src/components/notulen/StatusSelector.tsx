import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface StatusSelectorProps {
  currentStatus: string | null;
  onStatusChange: (newStatus: string) => void;
  disabled?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Concept', className: 'bg-secondary text-secondary-foreground' },
  { value: 'pending_approval', label: 'Wacht op goedkeuring', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  { value: 'approved', label: 'Goedgekeurd', className: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  { value: 'archived', label: 'Gearchiveerd', className: 'bg-muted text-muted-foreground' },
];

export function StatusSelector({ currentStatus, onStatusChange, disabled }: StatusSelectorProps) {
  const currentOption = STATUS_OPTIONS.find((s) => s.value === currentStatus) || STATUS_OPTIONS[0];

  return (
    <Select
      value={currentStatus || 'draft'}
      onValueChange={onStatusChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0">
        <Badge className={currentOption.className}>
          <SelectValue />
        </Badge>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <Badge className={option.className} variant="secondary">
                {option.label}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
