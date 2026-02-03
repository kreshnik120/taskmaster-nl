// ============================================================================
// M6 FACTURATIE - TypeScript Types
// ============================================================================

// ENUMS
export type FactuurStatus =
  | 'CONCEPT'
  | 'DEFINITIEF'
  | 'VERZONDEN'
  | 'HERINNERING_1'
  | 'HERINNERING_2'
  | 'HERINNERING_3'
  | 'BETWIST'
  | 'BETAALD'
  | 'AFGEBOEKT';

export type FactuurType = 'VERKOOP' | 'SELFBILLING' | 'INKOOP' | 'CREDIT';

export type BetalingMethode = 'BANK' | 'IDEAL' | 'INCASSO' | 'CONTANT' | 'OVERIG';

export type HerinneringNiveau = 1 | 2 | 3;

export type BtwPercentage = 0 | 9 | 21;

// BASE INTERFACES
export interface Factuur {
  id: string;
  tenant_id: string;
  factuur_nummer: string;
  type: FactuurType;
  opdrachtgever_id: string | null;
  flexwerker_id: string | null;
  factuurdatum: string;
  vervaldatum: string;
  urenstaat_ids: string[];
  subtotaal: number;
  btw_percentage: number;
  btw_bedrag: number;
  totaal: number;
  betaald_bedrag: number;
  openstaand_bedrag: number;
  status: FactuurStatus;
  verzonden_op: string | null;
  verzonden_naar: string | null;
  pdf_url: string | null;
  referentie: string | null;
  notities: string | null;
  betalingskenmerk: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface FactuurRegel {
  id: string;
  factuur_id: string;
  urenstaat_id: string | null;
  omschrijving: string;
  aantal: number;
  eenheid: string;
  prijs: number;
  btw_percentage: number;
  subtotaal: number;
  btw_bedrag: number;
  totaal: number;
  volgorde: number;
  created_at: string;
}

export interface Betaling {
  id: string;
  factuur_id: string;
  bedrag: number;
  datum: string;
  methode: BetalingMethode;
  referentie: string | null;
  opmerking: string | null;
  created_by: string;
  created_at: string;
}

export interface FactuurHerinnering {
  id: string;
  factuur_id: string;
  niveau: HerinneringNiveau;
  verzonden_op: string;
  verzonden_naar: string;
  openstaand_bedrag: number;
  email_log: string | null;
  created_at: string;
}

// FORM INPUT TYPES
export interface CreateFactuurInput {
  type?: FactuurType;
  opdrachtgever_id: string;
  flexwerker_id?: string | null;
  factuurdatum?: string;
  vervaldatum?: string;
  btw_percentage?: BtwPercentage;
  referentie?: string | null;
  notities?: string | null;
  regels: CreateFactuurRegelInput[];
  urenstaat_ids?: string[];
}

export interface CreateFactuurRegelInput {
  urenstaat_id?: string | null;
  omschrijving: string;
  aantal: number;
  eenheid?: string;
  prijs: number;
  btw_percentage?: BtwPercentage;
}

export interface UpdateFactuurInput {
  referentie?: string | null;
  notities?: string | null;
  vervaldatum?: string;
}

export interface CreateBetalingInput {
  factuur_id: string;
  bedrag: number;
  datum?: string;
  methode?: BetalingMethode;
  referentie?: string | null;
  opmerking?: string | null;
}

export interface FactuurFilters {
  status?: FactuurStatus | FactuurStatus[];
  type?: FactuurType | FactuurType[];
  opdrachtgever_id?: string;
  factuurdatum_van?: string;
  factuurdatum_tot?: string;
  vervaldatum_van?: string;
  vervaldatum_tot?: string;
  search?: string;
  alleen_openstaand?: boolean;
  alleen_vervallen?: boolean;
}

// RESPONSE TYPES
export interface FactuurWithDetails extends Factuur {
  regels: FactuurRegel[];
  betalingen: Betaling[];
  herinneringen: FactuurHerinnering[];
  opdrachtgever: {
    id: string;
    name: string;
    centrale_facturatie_email: string | null;
    kvk_nummer: string | null;
    btw_nummer: string | null;
    website: string | null;
  } | null;
  flexwerker: {
    id: string;
    full_name: string;
    email: string | null;
  } | null;
}

export interface FactuurListItem {
  id: string;
  factuur_nummer: string;
  type: FactuurType;
  status: FactuurStatus;
  factuurdatum: string;
  vervaldatum: string;
  totaal: number;
  openstaand_bedrag: number;
  opdrachtgever_naam: string | null;
  dagen_over_vervaldatum: number;
}

export interface FactuurStats {
  totaal_openstaand: number;
  totaal_vervallen: number;
  aantal_vervallen: number;
  totaal_deze_week_betaald: number;
  aantal_deze_week_betaald: number;
  totaal_dit_kwartaal: number;
}

// CONSTANTS
export const FACTUUR_STATUS_LABELS: Record<FactuurStatus, string> = {
  CONCEPT: 'Concept',
  DEFINITIEF: 'Definitief',
  VERZONDEN: 'Verzonden',
  HERINNERING_1: 'Herinnering 1',
  HERINNERING_2: 'Herinnering 2',
  HERINNERING_3: 'Herinnering 3',
  BETWIST: 'Betwist',
  BETAALD: 'Betaald',
  AFGEBOEKT: 'Afgeboekt',
};

export const FACTUUR_TYPE_LABELS: Record<FactuurType, string> = {
  VERKOOP: 'Verkoopfactuur',
  SELFBILLING: 'Self-billing',
  INKOOP: 'Inkoopfactuur',
  CREDIT: 'Creditnota',
};

export const BETALING_METHODE_LABELS: Record<BetalingMethode, string> = {
  BANK: 'Bankoverschrijving',
  IDEAL: 'iDEAL',
  INCASSO: 'Automatische incasso',
  CONTANT: 'Contant',
  OVERIG: 'Overig',
};

export const FACTUUR_STATUS_COLORS: Record<FactuurStatus, string> = {
  CONCEPT: 'gray',
  DEFINITIEF: 'blue',
  VERZONDEN: 'cyan',
  HERINNERING_1: 'yellow',
  HERINNERING_2: 'orange',
  HERINNERING_3: 'red',
  BETWIST: 'purple',
  BETAALD: 'green',
  AFGEBOEKT: 'gray',
};

// Herinnering niveau constants
export const HERINNERING_NIVEAUS: HerinneringNiveau[] = [1, 2, 3];

export const HERINNERING_NIVEAU_LABELS: Record<HerinneringNiveau, string> = {
  1: 'Eerste herinnering',
  2: 'Tweede herinnering',
  3: 'Laatste herinnering',
};

export const HERINNERING_NIVEAU_COLORS: Record<HerinneringNiveau, string> = {
  1: 'yellow',
  2: 'orange',
  3: 'red',
};

// Payment summary for dashboard
export interface BetalingSummary {
  factuur_id: string;
  factuur_nummer: string;
  totaal_bedrag: number;
  betaald_bedrag: number;
  openstaand_bedrag: number;
  aantal_betalingen: number;
  laatste_betaling_datum: string | null;
}

// =============================================================================
// FACTURATIE INSTELLINGEN TYPES
// =============================================================================

export interface FacturatieInstellingen {
  id: string;
  tenant_id: string;

  // BTW
  standaard_btw_percentage: number;
  btw_vrijgesteld: boolean;
  btw_nummer: string | null;

  // Betalingstermijn
  standaard_betalingstermijn: number;

  // Factuurnummer
  factuur_prefix: string;
  factuur_volgnummer_lengte: number;

  // Herinneringen
  herinnering_dagen_1: number;
  herinnering_dagen_2: number;
  herinnering_dagen_3: number;

  // Bedrijfsgegevens
  bedrijfsnaam: string | null;
  adres_straat: string | null;
  adres_postcode: string | null;
  adres_plaats: string | null;
  adres_land: string | null;
  kvk_nummer: string | null;
  iban: string | null;
  bic: string | null;
  logo_url: string | null;

  // Teksten
  factuur_footer_tekst: string | null;
  betalingsinstructies: string | null;

  // Metadata
  created_at: string;
  updated_at: string | null;
}

export interface UpdateFacturatieInstellingenInput {
  standaard_btw_percentage?: number;
  btw_vrijgesteld?: boolean;
  btw_nummer?: string | null;
  standaard_betalingstermijn?: number;
  factuur_prefix?: string;
  factuur_volgnummer_lengte?: number;
  herinnering_dagen_1?: number;
  herinnering_dagen_2?: number;
  herinnering_dagen_3?: number;
  bedrijfsnaam?: string | null;
  adres_straat?: string | null;
  adres_postcode?: string | null;
  adres_plaats?: string | null;
  adres_land?: string | null;
  kvk_nummer?: string | null;
  iban?: string | null;
  bic?: string | null;
  logo_url?: string | null;
  factuur_footer_tekst?: string | null;
  betalingsinstructies?: string | null;
}

// Export types (voor useFactuurExport hook)
export interface FactuurExportRow {
  factuurnummer: string;
  type: string;
  status: string;
  factuurdatum: string;
  vervaldatum: string;
  opdrachtgever: string;
  subtotaal: number;
  btw_percentage: number;
  btw_bedrag: number;
  totaal: number;
  betaald_bedrag: number;
  openstaand_bedrag: number;
}

export type ExportFormat = 'csv' | 'xlsx';
