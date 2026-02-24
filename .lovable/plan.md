

# BUGFIX: deriveFunctieNiveau — Hoogste Niveau Wint

## Probleem
De huidige `deriveFunctieNiveau()` functie (regels 392-425) gebruikt een cascade: de eerste match wint. Als een professional in Bendy-groep "Helpende" zit maar een diploma "Persoonlijk begeleider" (nv4) heeft, wordt "Helpende" (nv2) geretourneerd. Het hogere diploma wordt genegeerd.

## Oplossing
Vervang de cascade-logica door een "highest-wins" aanpak: alle 4 bronnen (groepen, level, function_type, diploma) worden gecontroleerd en het hoogste kwalificatieniveau wint.

## Wijzigingen

### 1. Bestand: `supabase/functions/bendy-sync/index.ts`

**Wat wordt vervangen:** Regels 391-425 (de hele `deriveFunctieNiveau` functie + commentaar erboven)

**Wat komt ervoor in de plaats:**
- Een `NIVEAU_RANK` object (9 niveaus: Helpende=1 t/m WO=8)
- Een `matchNiveauFromText()` helper met dezelfde regex patronen
- Een herschreven `deriveFunctieNiveau()` die alle 4 bronnen checkt en het hoogste niveau retourneert

**Niet aangeraakt:**
- `deriveFunctieNiveauFromDiplomas()` (regels 428-476) - blijft ongewijzigd
- Alle frontend code - blijft ongewijzigd
- Alle andere sync logica - blijft ongewijzigd

### 2. Edge function deployen
Na de codewijziging wordt `bendy-sync` opnieuw gedeployed.

## Technische details

Regels 391-425 worden vervangen door:

```typescript
// Ranking: hoe hoger het nummer, hoe hoger de kwalificatie
const NIVEAU_RANK: Record<string, number> = {
  'Helpende': 1,
  'Begeleider': 2,
  'VIG': 3,
  'Persoonlijk begeleider': 4,
  'Verpleegkundige (MBO)': 5,
  'GGZ-agoog': 6,
  'HBO-V': 7,
  'HBO': 7,
  'WO': 8,
};

function matchNiveauFromText(text: string): string | null {
  if (/Persoonlijk\s*begeleider/i.test(text)) return 'Persoonlijk begeleider';
  if (/Verpleegkundige|VP|HBO-V/i.test(text)) return 'Verpleegkundige (MBO)';
  if (/GGZ/i.test(text)) return 'GGZ-agoog';
  if (/VIG/i.test(text)) return 'VIG';
  if (/Begeleider|BGL|PB/i.test(text)) return 'Begeleider';
  if (/Helpende|ADL/i.test(text)) return 'Helpende';
  return null;
}

function deriveFunctieNiveau(groupNames: string[], functionType?: string | null, level?: string | null, diplomaNiveau?: string | null): string | null {
  let bestNiveau: string | null = null;
  let bestRank = 0;

  // Bron 1: Groepnamen
  for (const name of groupNames) {
    const niveau = matchNiveauFromText(name);
    if (niveau && (NIVEAU_RANK[niveau] || 0) > bestRank) {
      bestRank = NIVEAU_RANK[niveau] || 0;
      bestNiveau = niveau;
    }
  }

  // Bron 2: Level (gedecodeerd)
  if (level) {
    const niveau = matchNiveauFromText(level.trim());
    if (niveau && (NIVEAU_RANK[niveau] || 0) > bestRank) {
      bestRank = NIVEAU_RANK[niveau] || 0;
      bestNiveau = niveau;
    }
  }

  // Bron 3: Function type (gedecodeerd)
  if (functionType) {
    const niveau = matchNiveauFromText(functionType.trim());
    if (niveau && (NIVEAU_RANK[niveau] || 0) > bestRank) {
      bestRank = NIVEAU_RANK[niveau] || 0;
      bestNiveau = niveau;
    }
  }

  // Bron 4: Diploma-afgeleid niveau
  if (diplomaNiveau && (NIVEAU_RANK[diplomaNiveau] || 0) > bestRank) {
    bestRank = NIVEAU_RANK[diplomaNiveau] || 0;
    bestNiveau = diplomaNiveau;
  }

  return bestNiveau;
}
```

## Verificatie
1. `NIVEAU_RANK` bevat alle 9 niveaus (Helpende=1 t/m WO=8)
2. `matchNiveauFromText()` bevat dezelfde regex patronen als de oude stap 1/2/3
3. `deriveFunctieNiveau()` berekent bestRank uit alle 4 bronnen en retourneert het hoogste
4. Bij gelijke rank wint de eerste gevonden bron

