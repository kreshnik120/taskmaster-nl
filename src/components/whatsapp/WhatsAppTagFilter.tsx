import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getTagConfig } from "@/lib/whatsapp-tags";

interface WhatsAppTagFilterProps {
  selectedTag: string | null;
  onSelectTag: (tagId: string | null) => void;
  availableTags: string[];
}

export function WhatsAppTagFilter({ 
  selectedTag, 
  onSelectTag, 
  availableTags 
}: WhatsAppTagFilterProps) {
  if (availableTags.length === 0) return null;
  
  return (
    <Select 
      value={selectedTag || 'all'} 
      onValueChange={(v) => onSelectTag(v === 'all' ? null : v)}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Filter op label" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Alle labels</SelectItem>
        {availableTags.map(tagId => {
          const config = getTagConfig(tagId);
          if (!config) return null;
          return (
            <SelectItem key={tagId} value={tagId}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full", 
                  config.color.bg,
                  config.color.border,
                  "border"
                )} />
                {config.label}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
