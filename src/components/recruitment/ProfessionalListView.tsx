import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileWarning, CheckCircle2, AlertCircle, FileX } from "lucide-react";
import { getOrganizationBadgeColor, getOrganizationName } from "@/lib/organizationMapping";
import { formatFunctieNiveau } from "@/lib/functieNiveau";
import { getFunctieNiveauColor } from "@/types/organization";
import { cn } from "@/lib/utils";
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
  skills?: string[];
  org_id?: string | null;
  documents_count?: number | null;
  documents_published_count?: number | null;
  documents_expiring_count?: number | null;
}

interface ProfessionalListViewProps {
  professionals: Professional[];
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onClick: (professional: Professional) => void;
}

const getInitials = (name: string): string => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    actief: { label: 'Actief', className: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
    beschikbaar: { label: 'Beschikbaar', className: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
    inactief: { label: 'Inactief', className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' },
    op_pauze: { label: 'Op pauze', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
    bezet: { label: 'Bezet', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  };
  const s = map[status?.toLowerCase()] || { label: status, className: 'bg-muted text-muted-foreground' };
  return <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", s.className)}>{s.label}</Badge>;
};

export function ProfessionalListView({ professionals, selectedIds, onSelect, onClick }: ProfessionalListViewProps) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/30 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Professional</TableHead>
            <TableHead className="hidden md:table-cell">Functie</TableHead>
            <TableHead className="hidden lg:table-cell">Regio</TableHead>
            <TableHead className="hidden md:table-cell">Status</TableHead>
            <TableHead className="hidden lg:table-cell">Documenten</TableHead>
            <TableHead className="hidden xl:table-cell text-right">Geregistreerd</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {professionals.map((p) => {
            const totalDocs = p.documents_count || 0;
            const publishedDocs = p.documents_published_count || 0;
            const expiringDocs = p.documents_expiring_count || 0;

            return (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-rose-50/40 dark:hover:bg-rose-950/20 transition-colors"
                onClick={() => onClick(p)}
              >
                <TableCell onClick={(e) => e.stopPropagation()} className="pr-0">
                  <Checkbox
                    checked={selectedIds.has(p.id)}
                    onCheckedChange={(checked) => onSelect(p.id, checked as boolean)}
                    className="data-[state=checked]:bg-primary"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className={cn(getFunctieNiveauColor(p.functie_niveau).solid, "text-white text-[10px] font-medium")}>
                        {getInitials(p.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground truncate">{p.full_name}</span>
                    {p.org_id && (
                      <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-3.5 flex-shrink-0", getOrganizationBadgeColor(getOrganizationName(p.org_id)))}>
                        {getOrganizationName(p.org_id)}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-sm text-muted-foreground">{formatFunctieNiveau(p.functie_niveau)}</span>
                  {p.werkvorm && <span className="text-xs text-muted-foreground/50 ml-1">· {p.werkvorm}</span>}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {p.regio || '—'}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {getStatusBadge(p.status)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5">
                    {expiringDocs > 0 ? (
                      <><FileWarning className="h-3.5 w-3.5 text-destructive" /><span className="text-xs text-destructive">{expiringDocs} verlopen</span></>
                    ) : totalDocs > 0 && publishedDocs >= totalDocs ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-xs text-emerald-600">OK</span></>
                    ) : totalDocs > 0 ? (
                      <><AlertCircle className="h-3.5 w-3.5 text-amber-500" /><span className="text-xs text-amber-600">{totalDocs - publishedDocs} onvolledig</span></>
                    ) : (
                      <><FileX className="h-3.5 w-3.5 text-muted-foreground/40" /><span className="text-xs text-muted-foreground/50">Geen</span></>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden xl:table-cell text-right text-xs text-muted-foreground/50">
                  {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: nl })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
