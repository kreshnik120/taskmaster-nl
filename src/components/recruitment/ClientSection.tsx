import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ClientCard } from "@/components/ClientCard";

interface Client {
  id: string;
  name: string;
  company: string;
  org_id: string;
  created_at: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  regio?: string[] | null;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  gezochte_functies?: string[] | null;
  organizations?: {
    name: string;
  };
}

interface ClientSectionProps {
  title: string;
  clients: Client[];
  totalClients: number;
  groupType: "bureau" | "sector" | "matching" | "regio" | "alpha";
  onClientClick: (client: Client) => void;
  searchQuery: string;
  defaultOpen?: boolean;
  gridClass?: string;
}

// Get section accent based on groupType and title
const getSectionAccent = (title: string, groupType: string): string => {
  if (groupType === "bureau") {
    if (title === "ABCzorg") return "border-l-blue-500";
    if (title === "CitoZorg") return "border-l-orange-500";
  }
  if (groupType === "sector") {
    // Semantic sector colors
    if (title === "GGZ") return "border-l-blue-500";
    if (title === "GHZ") return "border-l-green-500";
    if (title === "Jeugdzorg") return "border-l-orange-500";
    if (title === "VVT") return "border-l-purple-500";
    if (title === "Ziekenhuis") return "border-l-red-500";
    if (title === "Thuiszorg") return "border-l-cyan-500";
  }
  if (groupType === "matching") {
    if (title === "Volledig") return "border-l-green-500";
    if (title === "Deels ingevuld") return "border-l-amber-500";
    if (title === "Geen data") return "border-l-muted";
  }
  return "";
};


export function ClientSection({
  title,
  clients,
  totalClients,
  groupType,
  onClientClick,
  searchQuery,
  defaultOpen = true,
  gridClass = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
}: ClientSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);
  
  const percentage = totalClients > 0 ? Math.round((clients.length / totalClients) * 100) : 0;
  const accentClass = getSectionAccent(title, groupType);

  // Calculate contextual insights
  const completeClients = clients.filter(c => {
    const hasRegio = c.regio && c.regio.length > 0;
    const hasSector = c.sector && c.sector.length > 0;
    const hasDoelgroep = c.doelgroep && c.doelgroep.length > 0;
    const hasFuncties = c.gezochte_functies && c.gezochte_functies.length > 0;
    return hasRegio && hasSector && hasDoelgroep && hasFuncties;
  }).length;

  const incompleteClients = clients.length - completeClients;
  const completenessPercentage = clients.length > 0 ? Math.round((completeClients / clients.length) * 100) : 0;

  if (clients.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={`border-l-4 ${accentClass} pl-4`}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-4 px-4 -ml-4 rounded-lg hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform" />
          )}
          <span className="text-lg font-semibold tracking-tight">{title}</span>
          <Badge variant="secondary" className="rounded-full px-3 py-0.5 font-medium">
            {clients.length}
          </Badge>
          {completeClients > 0 && (
            <span className="text-xs text-muted-foreground">
              · {completeClients} compleet
            </span>
          )}
          {incompleteClients > 0 && completenessPercentage < 50 && (
            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs text-amber-600 border-amber-300">
              Vereist actie
            </Badge>
          )}
        </div>
        <span className="text-sm text-muted-foreground font-medium">{percentage}%</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={`grid ${gridClass} gap-6 py-6`}>
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onClick={() => onClientClick(client)}
              searchQuery={searchQuery}
              groupType={groupType}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
