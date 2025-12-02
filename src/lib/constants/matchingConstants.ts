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
