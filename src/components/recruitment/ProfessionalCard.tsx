import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string | null;
  regio: string | null;
  status: string;
  created_at: string;
}

interface ProfessionalCardProps {
  professional: Professional;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick: () => void;
}

export function ProfessionalCard({ 
  professional, 
  isSelected, 
  onSelect, 
  onClick 
}: ProfessionalCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "actief": return "bg-green-500";
      case "inactief": return "bg-gray-400";
      case "op_pauze": return "bg-orange-500";
      default: return "bg-gray-400";
    }
  };

  const timeInStatus = formatDistanceToNow(new Date(professional.created_at), { 
    addSuffix: false, 
    locale: nl 
  });

  return (
    <Card 
      className="p-4 hover:shadow-md transition-all duration-200 cursor-pointer border-border bg-background"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(professional.id, checked as boolean)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name + Status Dot */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-foreground truncate">
              {professional.full_name}
            </h3>
            <div className={`w-2 h-2 rounded-full ${getStatusColor(professional.status)} flex-shrink-0`} />
          </div>

          {/* Function · Work Type */}
          <p className="text-sm text-muted-foreground mb-2">
            {professional.functie_niveau}
            {professional.werkvorm && (
              <>
                <span className="mx-1.5">·</span>
                {professional.werkvorm}
              </>
            )}
          </p>

          {/* Region */}
          {professional.regio && (
            <p className="text-sm text-muted-foreground/80 mb-3">
              {professional.regio}
            </p>
          )}

          {/* Time in Status - Subtle gray */}
          <p className="text-xs text-muted-foreground/60">
            In deze status: {timeInStatus}
          </p>
        </div>
      </div>
    </Card>
  );
}
