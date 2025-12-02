/**
 * Matching Constants for Healthcare Recruitment System
 * 
 * This file contains shared constants used for calculating match scores
 * between professionals and client requirements.
 */

/**
 * Sector Similarity Matrix
 * 
 * Defines semantic relationships between healthcare sectors.
 * Related sectors receive partial match credit based on similarity score.
 * 
 * Example: A professional with GHZ experience gets 60% credit when matching
 * against a GGZ position, as these sectors are semantically related.
 */
export const SECTOR_SIMILARITY: Record<string, { related: string[]; similarity: number }> = {
  "GGZ": { related: ["GHZ", "Verslavingszorg"], similarity: 0.6 },
  "GHZ": { related: ["GGZ", "Jeugdzorg"], similarity: 0.6 },
  "VVT": { related: ["Thuiszorg", "Ziekenhuis/Klinisch"], similarity: 0.7 },
  "Thuiszorg": { related: ["VVT", "Ziekenhuis/Klinisch"], similarity: 0.7 },
  "Jeugdzorg": { related: ["GHZ", "GGZ"], similarity: 0.5 },
  "Ziekenhuis/Klinisch": { related: ["VVT", "Thuiszorg"], similarity: 0.6 },
  "Verslavingszorg": { related: ["GGZ"], similarity: 0.6 },
};

/**
 * Doelgroep (Target Group) Similarity Matrix
 * 
 * Defines semantic relationships between target groups in healthcare.
 * Related target groups receive partial match credit based on similarity score.
 * 
 * Example: A professional with LVB experience gets 70% credit when matching
 * against a position focused on Autisme, as these groups often overlap in care.
 */
export const DOELGROEP_RELATIONS: Record<string, { related: string[]; similarity: number }> = {
  "LVB": { related: ["Autisme", "NAH", "EMB"], similarity: 0.7 },
  "Autisme": { related: ["LVB", "NAH", "Kinderen/Jeugd"], similarity: 0.7 },
  "NAH": { related: ["LVB", "Autisme", "Somatiek"], similarity: 0.6 },
  "EMB": { related: ["LG", "LVB"], similarity: 0.5 },
  "LG": { related: ["EMB", "LVB"], similarity: 0.5 },
  "Psychiatrie": { related: ["Verslaving", "Dakloosheid", "GGZ"], similarity: 0.6 },
  "Verslaving": { related: ["Psychiatrie", "Dakloosheid"], similarity: 0.6 },
  "Dakloosheid": { related: ["Psychiatrie", "Verslaving"], similarity: 0.5 },
  "Ouderen": { related: ["Somatiek", "Dementie"], similarity: 0.6 },
  "Somatiek": { related: ["Ouderen", "NAH"], similarity: 0.5 },
  "Dementie": { related: ["Ouderen", "Somatiek"], similarity: 0.7 },
  "Kinderen/Jeugd": { related: ["Autisme", "Jeugdzorg"], similarity: 0.6 },
  "Jeugdzorg": { related: ["Kinderen/Jeugd"], similarity: 0.7 },
};

/**
 * Functie Niveau Normalization
 * 
 * Maps various representations of healthcare function levels to their canonical form.
 * This handles variations with/without parentheses, abbreviations, and common typos.
 */
export const FUNCTIE_NORMALIZATION: Record<string, string> = {
  // VIG variations
  "vig": "VIG",
  "verzorgende ig": "VIG",
  "verzorgende-ig": "VIG",
  
  // HBO-V variations
  "hbo-v": "HBO-V",
  "hbov": "HBO-V",
  "hbo v": "HBO-V",
  "hbo verpleegkundige": "HBO-V",
  
  // Verpleegkundige MBO variations - CRITICAL FIX
  "verpleegkundige mbo": "Verpleegkundige MBO",
  "verpleegkundige (mbo)": "Verpleegkundige MBO",
  "mbo verpleegkundige": "Verpleegkundige MBO",
  "verpleegkundige": "Verpleegkundige MBO",
  "vp mbo": "Verpleegkundige MBO",
  
  // Helpende variations
  "helpende": "Helpende",
  "helpende 2": "Helpende",
  "helpende niveau 2": "Helpende",
  
  // Begeleider variations
  "begeleider": "Begeleider",
  "agogisch medewerker": "Begeleider",
  
  // Persoonlijk begeleider variations
  "persoonlijk begeleider": "Persoonlijk begeleider",
  "pb": "Persoonlijk begeleider",
  "pb-er": "Persoonlijk begeleider",
  
  // GGZ-agoog variations
  "ggz-agoog": "GGZ-agoog",
  "ggz agoog": "GGZ-agoog",
  "ggz medewerker": "GGZ-agoog",
};

/**
 * Normalize a functie_niveau string to its canonical form
 */
export const normalizeFunctie = (functie: string | null | undefined): string | null => {
  if (!functie) return null;
  
  const normalized = functie.toLowerCase().trim();
  return FUNCTIE_NORMALIZATION[normalized] || functie;
};

/**
 * Check if two functie_niveau values match (with normalization)
 */
export const functieMatches = (applicantFunctie: string | null | undefined, clientFunctie: string): boolean => {
  if (!applicantFunctie) return false;
  
  const normalizedApplicant = normalizeFunctie(applicantFunctie);
  const normalizedClient = normalizeFunctie(clientFunctie);
  
  return normalizedApplicant?.toLowerCase() === normalizedClient?.toLowerCase();
};

/**
 * Check if applicant functie matches any of the client's sought functions
 */
export const functieMatchesAny = (applicantFunctie: string | null | undefined, clientFuncties: string[]): boolean => {
  if (!applicantFunctie || !clientFuncties?.length) return false;
  
  return clientFuncties.some(cf => functieMatches(applicantFunctie, cf));
};

/**
 * Province Mapping
 * 
 * Maps Dutch cities/places to their provinces for region matching.
 * This enables matching professionals by their city to clients in the same province.
 */
export const STAD_PROVINCIE_MAPPING: Record<string, string> = {
  // Limburg
  "blerick": "limburg",
  "venlo": "limburg",
  "maastricht": "limburg",
  "heerlen": "limburg",
  "sittard": "limburg",
  "geleen": "limburg",
  "roermond": "limburg",
  "weert": "limburg",
  "kerkrade": "limburg",
  "venray": "limburg",
  
  // Noord-Brabant
  "vught": "noord-brabant",
  "eindhoven": "noord-brabant",
  "tilburg": "noord-brabant",
  "breda": "noord-brabant",
  "den bosch": "noord-brabant",
  "'s-hertogenbosch": "noord-brabant",
  "helmond": "noord-brabant",
  "oss": "noord-brabant",
  "roosendaal": "noord-brabant",
  "bergen op zoom": "noord-brabant",
  "uden": "noord-brabant",
  "waalwijk": "noord-brabant",
  "rosmalen": "noord-brabant",
  
  // Gelderland
  "arnhem": "gelderland",
  "nijmegen": "gelderland",
  "apeldoorn": "gelderland",
  "ede": "gelderland",
  "doetinchem": "gelderland",
  "zutphen": "gelderland",
  "tiel": "gelderland",
  "wageningen": "gelderland",
  "harderwijk": "gelderland",
  "zevenaar": "gelderland",
  
  // Zuid-Holland
  "rotterdam": "zuid-holland",
  "den haag": "zuid-holland",
  "'s-gravenhage": "zuid-holland",
  "leiden": "zuid-holland",
  "dordrecht": "zuid-holland",
  "zoetermeer": "zuid-holland",
  "delft": "zuid-holland",
  "gouda": "zuid-holland",
  "alphen aan den rijn": "zuid-holland",
  "schiedam": "zuid-holland",
  
  // Noord-Holland
  "amsterdam": "noord-holland",
  "haarlem": "noord-holland",
  "zaandam": "noord-holland",
  "alkmaar": "noord-holland",
  "hilversum": "noord-holland",
  "amstelveen": "noord-holland",
  "purmerend": "noord-holland",
  "hoofddorp": "noord-holland",
  "heerhugowaard": "noord-holland",
  "hoorn": "noord-holland",
  
  // Utrecht
  "utrecht": "utrecht",
  "amersfoort": "utrecht",
  "veenendaal": "utrecht",
  "nieuwegein": "utrecht",
  "zeist": "utrecht",
  "woerden": "utrecht",
  "ijsselstein": "utrecht",
  "soest": "utrecht",
  "driebergen": "utrecht",
  
  // Overijssel
  "zwolle": "overijssel",
  "enschede": "overijssel",
  "deventer": "overijssel",
  "hengelo": "overijssel",
  "almelo": "overijssel",
  "kampen": "overijssel",
  "oldenzaal": "overijssel",
  
  // Flevoland
  "almere": "flevoland",
  "lelystad": "flevoland",
  "dronten": "flevoland",
  "emmeloord": "flevoland",
  
  // Groningen
  "groningen": "groningen",
  
  // Friesland
  "leeuwarden": "friesland",
  "drachten": "friesland",
  "sneek": "friesland",
  "heerenveen": "friesland",
  
  // Drenthe
  "assen": "drenthe",
  "emmen": "drenthe",
  "hoogeveen": "drenthe",
  "meppel": "drenthe",
  
  // Zeeland
  "middelburg": "zeeland",
  "vlissingen": "zeeland",
  "goes": "zeeland",
  "terneuzen": "zeeland",
};

/**
 * Neighbor Provinces Matrix
 * 
 * Defines which provinces border each other.
 * Matching against a neighboring province gives partial credit.
 */
export const BUUR_PROVINCIES: Record<string, string[]> = {
  "limburg": ["noord-brabant", "gelderland"],
  "noord-brabant": ["limburg", "gelderland", "zuid-holland", "zeeland"],
  "gelderland": ["limburg", "noord-brabant", "utrecht", "zuid-holland", "noord-holland", "flevoland", "overijssel"],
  "zuid-holland": ["noord-brabant", "gelderland", "utrecht", "noord-holland", "zeeland"],
  "noord-holland": ["zuid-holland", "utrecht", "flevoland"],
  "utrecht": ["noord-holland", "zuid-holland", "gelderland", "flevoland"],
  "overijssel": ["gelderland", "flevoland", "drenthe", "friesland"],
  "flevoland": ["noord-holland", "utrecht", "gelderland", "overijssel"],
  "groningen": ["friesland", "drenthe"],
  "friesland": ["groningen", "drenthe", "overijssel", "flevoland"],
  "drenthe": ["groningen", "friesland", "overijssel"],
  "zeeland": ["noord-brabant", "zuid-holland"],
};

/**
 * Get province from a location string
 */
export const getProvincieFromLocatie = (locatie: string): string | null => {
  if (!locatie) return null;
  
  const normalized = locatie.toLowerCase().trim();
  
  // Check if it's already a province name
  const provincies = Object.keys(BUUR_PROVINCIES);
  if (provincies.includes(normalized)) {
    return normalized;
  }
  
  // Check if it's a known city
  if (STAD_PROVINCIE_MAPPING[normalized]) {
    return STAD_PROVINCIE_MAPPING[normalized];
  }
  
  // Check if location contains a known province name
  for (const provincie of provincies) {
    if (normalized.includes(provincie)) {
      return provincie;
    }
  }
  
  return null;
};

/**
 * Calculate region match score between applicant and client regions
 * Returns: { score: number, matchType: 'exact' | 'province' | 'neighbor' | 'none', reason: string }
 */
export const calculateRegioScore = (
  applicantRegio: string | null | undefined,
  clientRegios: string[]
): { score: number; matchType: 'exact' | 'province' | 'neighbor' | 'none'; reason: string } => {
  if (!applicantRegio || !clientRegios?.length) {
    return { score: 0, matchType: 'none', reason: 'Geen regio gegevens' };
  }

  const applicantRegios = applicantRegio
    .toLowerCase()
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);

  const clientRegiosLower = clientRegios.map(r => r.toLowerCase());

  // 1. Check for exact match
  for (const ar of applicantRegios) {
    for (const cr of clientRegiosLower) {
      if (ar.includes(cr) || cr.includes(ar)) {
        return { score: 30, matchType: 'exact', reason: `Exacte regio match: ${ar}` };
      }
    }
  }

  // 2. Check for province match
  for (const ar of applicantRegios) {
    const applicantProvincie = getProvincieFromLocatie(ar);
    if (!applicantProvincie) continue;

    for (const cr of clientRegiosLower) {
      const clientProvincie = getProvincieFromLocatie(cr);
      if (clientProvincie && applicantProvincie === clientProvincie) {
        return { 
          score: 25, 
          matchType: 'province', 
          reason: `Zelfde provincie: ${applicantProvincie.charAt(0).toUpperCase() + applicantProvincie.slice(1)}` 
        };
      }
    }
  }

  // 3. Check for neighboring province match
  for (const ar of applicantRegios) {
    const applicantProvincie = getProvincieFromLocatie(ar);
    if (!applicantProvincie) continue;

    const neighbors = BUUR_PROVINCIES[applicantProvincie] || [];
    
    for (const cr of clientRegiosLower) {
      const clientProvincie = getProvincieFromLocatie(cr);
      if (clientProvincie && neighbors.includes(clientProvincie)) {
        return { 
          score: 15, 
          matchType: 'neighbor', 
          reason: `Buurprovincie: ${applicantProvincie.charAt(0).toUpperCase() + applicantProvincie.slice(1)} ↔ ${clientProvincie.charAt(0).toUpperCase() + clientProvincie.slice(1)}` 
        };
      }
    }
  }

  return { score: 0, matchType: 'none', reason: 'Geen regio overlap' };
};
