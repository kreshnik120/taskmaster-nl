// Knowledge Category Hierarchy - Fase 15 Implementation
// Groepeert 25+ categorieën in 6 logische hoofdgroepen

export interface CategoryGroup {
  id: string;
  label: string;
  icon: string;
  description: string;
  categories: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: 'zzp',
    label: 'ZZP & Leveranciers',
    icon: 'Briefcase',
    description: 'ZZP gerelateerde kennis en leveranciersinformatie',
    categories: ['zzp', 'zzp_leveranciers', 'zzp_vereisten', 'zzp_tarieven']
  },
  {
    id: 'hr',
    label: 'HR & Personeel',
    icon: 'Users',
    description: 'Arbeidsvoorwaarden, onboarding, evaluatie',
    categories: ['hr_arbeidsvoorwaarden', 'hr_onboarding', 'hr_evaluatie', 'hr_verlof', 'hr_policies']
  },
  {
    id: 'juridisch',
    label: 'Juridisch & Compliance',
    icon: 'Scale',
    description: 'Wetgeving, compliance en juridische kennis',
    categories: ['wetgeving', 'compliance', 'juridisch', 'privacy', 'contract_specifiek']
  },
  {
    id: 'markt',
    label: 'Markt & Sector',
    icon: 'TrendingUp',
    description: 'Marktinformatie en sectorkennis',
    categories: ['jeugdzorg_markt', 'gehandicaptenzorg_markt', 'ggz_markt', 'vvt_markt', 'sector_trends']
  },
  {
    id: 'operationeel',
    label: 'Operationeel',
    icon: 'Settings',
    description: 'Processen, systeem en dagelijkse operaties',
    categories: ['processen', 'system', 'recruitment', 'planning', 'matching', 'success_patterns', 'candidate_experience']
  },
  {
    id: 'klanten',
    label: 'Klanten & Organisaties',
    icon: 'Building',
    description: 'Klant- en organisatie-informatie',
    categories: ['klanten', 'organisatie_intel', 'bedrijfsgegevens', 'org_profile', 'contact_info', 'tarief_info']
  }
];

// Flat map voor snelle categorie → groep lookup
export const CATEGORY_TO_GROUP: Record<string, string> = {};
CATEGORY_GROUPS.forEach(group => {
  group.categories.forEach(cat => {
    CATEGORY_TO_GROUP[cat] = group.id;
  });
});

// Alle bekende categorieën voor validatie
export const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap(g => g.categories);

// Categorie labels voor display
export const CATEGORY_LABELS: Record<string, string> = {
  // ZZP
  zzp: 'ZZP Algemeen',
  zzp_leveranciers: 'ZZP Leveranciers',
  zzp_vereisten: 'ZZP Vereisten',
  zzp_tarieven: 'ZZP Tarieven',
  // HR
  hr_arbeidsvoorwaarden: 'Arbeidsvoorwaarden',
  hr_onboarding: 'Onboarding',
  hr_evaluatie: 'Evaluatie',
  hr_verlof: 'Verlof',
  hr_policies: 'HR Beleid',
  // Juridisch
  wetgeving: 'Wetgeving',
  compliance: 'Compliance',
  juridisch: 'Juridisch',
  privacy: 'Privacy',
  contract_specifiek: 'Contracten',
  // Markt
  jeugdzorg_markt: 'Jeugdzorg Markt',
  gehandicaptenzorg_markt: 'GHZ Markt',
  ggz_markt: 'GGZ Markt',
  vvt_markt: 'VVT Markt',
  sector_trends: 'Sector Trends',
  // Operationeel
  processen: 'Processen',
  system: 'Systeem',
  recruitment: 'Recruitment',
  planning: 'Planning',
  matching: 'Matching',
  success_patterns: 'Succes Patronen',
  candidate_experience: 'Kandidaat Ervaring',
  // Klanten
  klanten: 'Klanten',
  organisatie_intel: 'Organisatie Intel',
  bedrijfsgegevens: 'Bedrijfsgegevens',
  org_profile: 'Org Profiel',
  contact_info: 'Contactinfo',
  tarief_info: 'Tariefinfo'
};

// Coverage thresholds voor visuele indicatie
export const COVERAGE_THRESHOLDS = {
  critical: 25,  // <25% = rood
  moderate: 50,  // 25-50% = oranje
  good: 80       // 50-80% = geel, >80% = groen
};

export const getCoverageColor = (percentage: number): string => {
  if (percentage < COVERAGE_THRESHOLDS.critical) return 'text-red-600';
  if (percentage < COVERAGE_THRESHOLDS.moderate) return 'text-orange-500';
  if (percentage < COVERAGE_THRESHOLDS.good) return 'text-yellow-500';
  return 'text-green-600';
};

export const getCoverageBgColor = (percentage: number): string => {
  if (percentage < COVERAGE_THRESHOLDS.critical) return 'bg-red-500/10';
  if (percentage < COVERAGE_THRESHOLDS.moderate) return 'bg-orange-500/10';
  if (percentage < COVERAGE_THRESHOLDS.good) return 'bg-yellow-500/10';
  return 'bg-green-500/10';
};

export const getCoverageIcon = (percentage: number): string => {
  if (percentage < COVERAGE_THRESHOLDS.critical) return '🔴';
  if (percentage < COVERAGE_THRESHOLDS.moderate) return '🟠';
  if (percentage < COVERAGE_THRESHOLDS.good) return '🟡';
  return '🟢';
};
