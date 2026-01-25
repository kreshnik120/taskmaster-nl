import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { WidgetConfig } from '@/hooks/useWidgetPreferences';

interface WidgetConfigItemProps {
  widget: WidgetConfig;
  onToggleVisibility: (key: string, isVisible: boolean) => void;
  disabled?: boolean;
}

export function WidgetConfigItem({
  widget,
  onToggleVisibility,
  disabled = false,
}: WidgetConfigItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      }`}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Visibility Checkbox */}
      <Checkbox
        id={`widget-${widget.key}`}
        checked={widget.isVisible}
        onCheckedChange={(checked) =>
          onToggleVisibility(widget.key, checked as boolean)
        }
        disabled={disabled}
      />

      {/* Widget Info */}
      <div className="flex-1 min-w-0">
        <Label
          htmlFor={`widget-${widget.key}`}
          className="font-medium cursor-pointer"
        >
          {widget.name}
        </Label>
        <p className="text-sm text-muted-foreground truncate">
          {widget.description}
        </p>
      </div>
    </div>
  );
}
