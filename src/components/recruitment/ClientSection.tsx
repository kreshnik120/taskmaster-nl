import { useState } from "react";
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
  groupType: "bureau" | "matching" | "regio" | "alpha";
  onClientClick: (client: Client) => void;
  searchQuery: string;
  defaultOpen?: boolean;
}

const getSectionAccent = (title: string, groupType: string): string => {
  if (groupType === "bureau") {
    if (title === "ABCzorg") return "border-l-blue-500";
    if (title === "CitoZorg") return "border-l-orange-500";
  }
  if (groupType === "matching") {
    if (title === "Volledig") return "border-l-green-500";
    if (title === "Deels ingevuld") return "border-l-amber-500";
    if (title === "Geen data") return "border-l-muted";
  }
  return "";
};

const getSectionIcon = (title: string, groupType: string): string => {
  if (groupType === "bureau") {
    if (title === "ABCzorg") return "🔵";
    if (title === "CitoZorg") return "🟠";
  }
  if (groupType === "matching") {
    if (title === "Volledig") return "✅";
    if (title === "Deels ingevuld") return "⚠️";
    if (title === "Geen data") return "❌";
  }
  if (groupType === "regio") return "📍";
  if (groupType === "alpha") return "🔤";
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
}: ClientSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const percentage = totalClients > 0 ? Math.round((clients.length / totalClients) * 100) : 0;
  const accentClass = getSectionAccent(title, groupType);
  const icon = getSectionIcon(title, groupType);

  if (clients.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={`border-l-4 ${accentClass} pl-4`}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-3 border-b hover:bg-muted/50 transition-colors -ml-4 pl-4 pr-4">
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm">
            {icon} {title}
          </span>
          <Badge variant="secondary" className="font-normal">
            {clients.length}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{percentage}% van totaal</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-6">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onClick={() => onClientClick(client)}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
