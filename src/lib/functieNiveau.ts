// Officiële MBO/HBO niveaunummers per functie
const FUNCTIE_NIVEAU_MAP: Record<string, number> = {
  'Helpende': 2,
  'Helpende 2': 2,
  'VIG': 3,
  'Begeleider': 3,
  'Persoonlijk begeleider': 4,
  'Verpleegkundige MBO': 4,
  'Verpleegkundige (MBO)': 4,
  'VP3': 3,
  'VP4': 4,
  'GGZ-agoog': 6,
  'HBO-V': 6,
  'HBO': 6,
  'WO': 7,
};

export function getNiveauNummer(functieNiveau: string): number | null {
  return FUNCTIE_NIVEAU_MAP[functieNiveau] ?? null;
}

export function formatFunctieNiveau(functieNiveau: string | null | undefined): string {
  if (!functieNiveau) return 'Niveau onbekend';
  const nummer = getNiveauNummer(functieNiveau);
  if (nummer) return `${functieNiveau} (nv${nummer})`;
  return functieNiveau;
}
