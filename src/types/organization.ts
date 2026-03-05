// Unified organization types for Klanten page
// Both Kaarten and Hiërarchie views use these types

export interface Sublocation {
  id: string;
  naam: string;
  adres?: string | null;
  postcode?: string | null;
  plaats?: string | null;
  telefoon?: string | null;
  email?: string | null;
  contactpersoon_naam?: string | null;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  gezochte_functies?: string[] | null;
  publieke_opmerking?: string | null;
  interne_opmerking?: string | null;
  doelgroep_omschrijving?: string | null;
  provincie?: string | null;
  leeftijd_van?: number | null;
  leeftijd_tot?: number | null;
  kostenplaats?: string | null;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
  is_active?: boolean;
  externe_referentie?: string | null;
  bendy_parent_id?: string | null;
  kleur?: string | null;
}

export interface Location {
  id: string;
  naam: string;
  adres?: string | null;
  postcode?: string | null;
  plaats?: string | null;
  telefoon?: string | null;
  contactpersoon_naam?: string | null;
  contactpersoon_email?: string | null;
  factuur_email?: string | null;
  provincie?: string | null;
  sublocations: Sublocation[];
}

export interface Organization {
  id: string;
  name: string;
  org_id: string;
  kvk_nummer?: string | null;
  btw_nummer?: string | null;
  website?: string | null;
  logo_url?: string | null;
  notes?: string | null;
  centrale_facturatie_email?: string | null;
  invoice_bedrijfsnaam?: string | null;
  invoice_adres?: string | null;
  invoice_postcode?: string | null;
  invoice_plaats?: string | null;
  crm_fase?: string | null;
  afkorting?: string | null;
  locations: Location[];
  bureau?: string;
  totalSublocations?: number;
  sectors?: string[];
}

// Bureau mapping constants
export const BUREAU_IDS = {
  ABCzorg: "550e8400-e29b-41d4-a716-446655440000",
  CitoZorg: "650e8400-e29b-41d4-a716-446655440001",
} as const;

export const getBureauName = (orgId: string): string => {
  if (orgId === BUREAU_IDS.ABCzorg) return "ABCzorg";
  if (orgId === BUREAU_IDS.CitoZorg) return "CitoZorg";
  return "Onbekend";
};

export const getBureauId = (bureauName: string): string => {
  if (bureauName === "ABCzorg") return BUREAU_IDS.ABCzorg;
  if (bureauName === "CitoZorg") return BUREAU_IDS.CitoZorg;
  return BUREAU_IDS.ABCzorg; // Default
};

// Grouping types
export type GroupType = "bureau" | "sector" | "regio" | "alfabetisch" | "matching";

// Sectors and colors for UI
export const SECTOREN = ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis/Klinisch", "Thuiszorg"];
export const DOELGROEPEN = ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving"];
export const FUNCTIES = ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"];

export const SECTOR_COLORS: Record<string, { selected: string; outline: string }> = {
  "VVT": { selected: "bg-blue-500 text-white border-blue-500 hover:bg-blue-600", outline: "border-blue-500 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950" },
  "GGZ": { selected: "bg-purple-500 text-white border-purple-500 hover:bg-purple-600", outline: "border-purple-500 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950" },
  "GHZ": { selected: "bg-green-500 text-white border-green-500 hover:bg-green-600", outline: "border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950" },
  "Jeugdzorg": { selected: "bg-orange-500 text-white border-orange-500 hover:bg-orange-600", outline: "border-orange-500 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950" },
  "Ziekenhuis/Klinisch": { selected: "bg-red-500 text-white border-red-500 hover:bg-red-600", outline: "border-red-500 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950" },
  "Thuiszorg": { selected: "bg-teal-500 text-white border-teal-500 hover:bg-teal-600", outline: "border-teal-500 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950" },
};

export const DOELGROEP_COLORS: Record<string, { selected: string; outline: string }> = {
  "Ouderen": { selected: "bg-amber-500 text-white border-amber-500 hover:bg-amber-600", outline: "border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950" },
  "LVB": { selected: "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600", outline: "border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950" },
  "Psychiatrie": { selected: "bg-indigo-500 text-white border-indigo-500 hover:bg-indigo-600", outline: "border-indigo-500 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950" },
  "Somatiek": { selected: "bg-rose-500 text-white border-rose-500 hover:bg-rose-600", outline: "border-rose-500 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950" },
  "Kinderen/Jeugd": { selected: "bg-cyan-500 text-white border-cyan-500 hover:bg-cyan-600", outline: "border-cyan-500 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950" },
  "Verslaving": { selected: "bg-slate-500 text-white border-slate-500 hover:bg-slate-600", outline: "border-slate-500 text-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950" },
};

export const FUNCTIE_NIVEAU_COLORS: Record<string, {
  bg: string;
  text: string;
  border: string;
  solid: string;
  selected: string;
  outline: string;
}> = {
  'WO':                     { bg: 'bg-red-500/10',    text: 'text-red-700',    border: 'border-red-200',    solid: 'bg-red-600',    selected: 'bg-red-600 text-white border-red-600',    outline: 'border-red-600 text-red-700 hover:bg-red-50' },
  'HBO':                    { bg: 'bg-blue-500/10',   text: 'text-blue-700',   border: 'border-blue-200',   solid: 'bg-blue-600',   selected: 'bg-blue-600 text-white border-blue-600',  outline: 'border-blue-600 text-blue-700 hover:bg-blue-50' },
  'HBO-V':                  { bg: 'bg-purple-500/10', text: 'text-purple-700', border: 'border-purple-200', solid: 'bg-purple-500', selected: 'bg-purple-600 text-white border-purple-600', outline: 'border-purple-600 text-purple-700 hover:bg-purple-50' },
  'Verpleegkundige MBO':    { bg: 'bg-cyan-500/10',   text: 'text-cyan-700',   border: 'border-cyan-200',   solid: 'bg-cyan-500',   selected: 'bg-cyan-600 text-white border-cyan-600',  outline: 'border-cyan-600 text-cyan-700 hover:bg-cyan-50' },
  'GGZ-agoog':              { bg: 'bg-rose-500/10',   text: 'text-rose-700',   border: 'border-rose-200',   solid: 'bg-rose-500',   selected: 'bg-rose-600 text-white border-rose-600',  outline: 'border-rose-600 text-rose-700 hover:bg-rose-50' },
  'VIG':                    { bg: 'bg-green-500/10',  text: 'text-green-700',  border: 'border-green-200',  solid: 'bg-green-500',  selected: 'bg-green-600 text-white border-green-600', outline: 'border-green-600 text-green-700 hover:bg-green-50' },
  'Persoonlijk begeleider': { bg: 'bg-indigo-500/10', text: 'text-indigo-700', border: 'border-indigo-200', solid: 'bg-indigo-500', selected: 'bg-indigo-600 text-white border-indigo-600', outline: 'border-indigo-600 text-indigo-700 hover:bg-indigo-50' },
  'Begeleider':             { bg: 'bg-teal-500/10',   text: 'text-teal-700',   border: 'border-teal-200',   solid: 'bg-teal-500',   selected: 'bg-teal-600 text-white border-teal-600',  outline: 'border-teal-600 text-teal-700 hover:bg-teal-50' },
  'Helpende':               { bg: 'bg-amber-500/10',  text: 'text-amber-700',  border: 'border-amber-200',  solid: 'bg-amber-500',  selected: 'bg-amber-600 text-white border-amber-600', outline: 'border-amber-600 text-amber-700 hover:bg-amber-50' },
};

export const getFunctieNiveauColor = (functie?: string) =>
  FUNCTIE_NIVEAU_COLORS[functie || ''] || {
    bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border',
    solid: 'bg-muted-foreground', selected: 'bg-muted text-foreground border-border',
    outline: 'border-border text-foreground hover:bg-muted'
  };
