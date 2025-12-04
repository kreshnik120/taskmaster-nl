import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Briefcase, 
  Clock, 
  Calendar, 
  AlertCircle,
  Users,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Vacancy {
  id: string;
  titel: string;
  functie_niveau: string;
  aantal_fte?: number;
  uren_per_week?: number;
  start_datum?: string;
  deadline?: string;
  status: 'open' | 'in_review' | 'vervuld' | 'gesloten';
  urgentie: 'laag' | 'normaal' | 'hoog' | 'kritiek';
  gewenste_sector_ervaring?: string[];
  applications_count?: number;
}

interface VacancyCardProps {
  vacancy: Vacancy;
  onClick?: () => void;
}

const urgentieColors: Record<string, string> = {
  laag: "bg-slate-100 text-slate-700 border-slate-200",
  normaal: "bg-blue-50 text-blue-700 border-blue-200",
  hoog: "bg-amber-50 text-amber-700 border-amber-200",
  kritiek: "bg-red-50 text-red-700 border-red-200",
};

const statusColors: Record<string, string> = {
  open: "bg-green-50 text-green-700 border-green-200",
  in_review: "bg-yellow-50 text-yellow-700 border-yellow-200",
  vervuld: "bg-slate-100 text-slate-500 border-slate-200",
  gesloten: "bg-slate-100 text-slate-400 border-slate-200",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_review: "In review",
  vervuld: "Vervuld",
  gesloten: "Gesloten",
};

export function VacancyCard({ vacancy, onClick }: VacancyCardProps) {
  const isUrgent = vacancy.urgentie === 'hoog' || vacancy.urgentie === 'kritiek';
  const isOpen = vacancy.status === 'open';

  return (
    <Card 
      className={`p-4 cursor-pointer hover:shadow-md transition-all ${
        isUrgent && isOpen ? 'border-l-4 border-l-amber-500' : ''
      } ${!isOpen ? 'opacity-60' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm truncate">{vacancy.titel}</h4>
            {isUrgent && isOpen && (
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            )}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Badge variant="secondary" className="text-xs">
              {vacancy.functie_niveau}
            </Badge>
            {vacancy.uren_per_week && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {vacancy.uren_per_week} uur/week
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {vacancy.start_datum && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Start: {format(new Date(vacancy.start_datum), 'd MMM', { locale: nl })}
              </span>
            )}
            {vacancy.deadline && (
              <span className="flex items-center gap-1 text-amber-600">
                Deadline: {format(new Date(vacancy.deadline), 'd MMM', { locale: nl })}
              </span>
            )}
            {typeof vacancy.applications_count === 'number' && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {vacancy.applications_count} kandidaten
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge variant="outline" className={statusColors[vacancy.status]}>
            {statusLabels[vacancy.status]}
          </Badge>
          <Badge variant="outline" className={urgentieColors[vacancy.urgentie]}>
            {vacancy.urgentie.charAt(0).toUpperCase() + vacancy.urgentie.slice(1)}
          </Badge>
        </div>
      </div>

      {vacancy.gewenste_sector_ervaring && vacancy.gewenste_sector_ervaring.length > 0 && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-1">
          {vacancy.gewenste_sector_ervaring.slice(0, 3).map((sector) => (
            <Badge key={sector} variant="outline" className="text-xs">
              {sector}
            </Badge>
          ))}
          {vacancy.gewenste_sector_ervaring.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{vacancy.gewenste_sector_ervaring.length - 3}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}
