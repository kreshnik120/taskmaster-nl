import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { OrganizationCardSimple } from "@/components/organization/OrganizationCardSimple";

interface Location {
  id: string;
  naam: string;
  plaats?: string | null;
  telefoon?: string | null;
  contactpersoon_email?: string | null;
  sublocations?: Sublocation[];
}

interface Sublocation {
  id: string;
  naam: string;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  gezochte_functies?: string[] | null;
  plaats?: string | null;
  publieke_opmerking?: string | null;
}

interface Organization {
  id: string;
  name: string;
  org_id: string;
  kvk_nummer?: string | null;
  logo_url?: string | null;
  website?: string | null;
  centrale_facturatie_email?: string | null;
  locations?: Location[];
  bureau?: string;
}

interface OrganizationSectionProps {
  title: string;
  organizations: Organization[];
  totalOrganizations: number;
  groupType: "bureau" | "sector" | "matching" | "regio" | "alpha";
  onOrganizationClick: (org: Organization) => void;
  searchQuery?: string;
  defaultOpen?: boolean;
  gridClass?: string;
}

// Semantic section coloring
function getSectionAccent(groupType: string, title: string): string {
  if (groupType === "bureau") {
    if (title === "ABCzorg") return "border-l-green-500";
    if (title === "CitoZorg") return "border-l-amber-500";
  }
  if (groupType === "sector") {
    switch (title) {
      case "GGZ": return "border-l-blue-500";
      case "GHZ": return "border-l-emerald-500";
      case "Jeugdzorg": return "border-l-orange-500";
      case "VVT": return "border-l-purple-500";
      case "Ziekenhuis": return "border-l-red-500";
      case "Thuiszorg": return "border-l-cyan-500";
    }
  }
  return "border-l-slate-400";
}

export function OrganizationSection({
  title,
  organizations,
  totalOrganizations,
  groupType,
  onOrganizationClick,
  searchQuery = "",
  defaultOpen = true,
  gridClass = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
}: OrganizationSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  const percentage = totalOrganizations > 0 
    ? Math.round((organizations.length / totalOrganizations) * 100) 
    : 0;

  // Count total sublocations in this section
  const totalSublocations = organizations.reduce((acc, org) => 
    acc + (org.locations?.reduce((locAcc, loc) => locAcc + (loc.sublocations?.length || 0), 0) || 0), 0
  );

  const accentClass = getSectionAccent(groupType, title);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className={`flex items-center gap-3 w-full text-left py-2 px-3 rounded-lg collapsible-glass collapsible-glass-rose border-l-4 ${accentClass}`}>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        <div className="flex-1 flex items-center gap-3">
          <span className="font-semibold">{title}</span>
          <span className="text-sm text-muted-foreground">
            {organizations.length} organisatie{organizations.length !== 1 ? 's' : ''}
          </span>
          {totalSublocations > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {totalSublocations} werklocaties
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{percentage}%</span>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-4">
        <div className={`grid ${gridClass} gap-4`}>
          {organizations.map((org, index) => (
            <OrganizationCardSimple
              key={org.id}
              organization={org}
              searchQuery={searchQuery}
              onClick={onOrganizationClick}
              groupType={groupType}
              index={index}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
