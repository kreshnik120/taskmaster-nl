

# SYNC VERFIJNING: Bendy Data Altijd Bijwerken + Groepen Opslaan

## Samenvatting
Bendy is de bron van waarheid, maar momenteel worden veel velden alleen gevuld als ze NULL zijn (null-only fill). Dit betekent dat updates in Bendy nooit doorstromen. Daarnaast worden Bendy groepen (flexpools) opgehaald maar nergens opgeslagen. Deze wijziging lost beide problemen op.

## Wijzigingen

### A. SQL Migratie - nieuwe kolom `bendy_groepen`
Voegt een `text[]` kolom toe aan de `professionals` tabel voor het opslaan van Bendy flexpool groepnamen.

### B. Edge Function - select query uitbreiden
`werkvorm` en `bendy_groepen` toevoegen aan de bestaande select in `syncProfessionals` (regel 936).

### C. UPDATE path - Bendy is leidend (4 sub-wijzigingen)

**C1. Certificaten** (regels 1031-1035): Verwijder de `!matchedPro.certificaten` null-check zodat certificaten altijd worden bijgewerkt vanuit Bendy.

**C2. Werkvorm** (nieuw na certificaten): Voeg `mapWerkvorm()` call toe in het update path, vergelijk met bestaande waarde, en update als gewijzigd.

**C3. Bendy groepen** (nieuw na werkvorm): Sla groepnamen op vanuit `userGroupIds` + `groupMap` (variabelen bestaan al op regels 1071-1075). Plaats dit VOOR de functie_niveau berekening zodat dezelfde variabelen hergebruikt worden.

**C4. Company data** (regels 1043-1053): Verwijder alle 10 `!matchedPro.xxx` null-checks zodat bedrijfsgegevens altijd worden bijgewerkt.

### D. INSERT path - bendy_groepen toevoegen
Voeg `bendy_groepen` toe aan `insertData` (na regel 1181) met de al bestaande `userGroupNames` variabele.

### E. Frontend - Groepen op ProfessionalCard
- Voeg `bendy_groepen` toe aan de Professional interface
- Toon teal-kleurige badges na de skills badges (max 2 zichtbaar + "+N" overflow)

### F. Frontend - Groepen in ProfessionalDetailModal
- Voeg `bendy_groepen` toe aan de Professional interface
- Toon een "Bendy Groepen" collapsible sectie na CV en voor Contact, met teal badges
- `Users` icon is al geimporteerd (regel 21)

## Bestanden
- **Nieuw:** SQL migratie (ALTER TABLE)
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (wijzigingen B, C, D)
- **Gewijzigd:** `src/components/recruitment/ProfessionalCard.tsx` (wijziging E)
- **Gewijzigd:** `src/components/ProfessionalDetailModal.tsx` (wijziging F)

## Technische details

### SQL Migratie
```sql
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS bendy_groepen text[] DEFAULT '{}';
COMMENT ON COLUMN professionals.bendy_groepen IS 'Bendy flexpool groepnamen, automatisch gesyncet';
```

### Edge function - select query (regel 936)
Toevoegen aan het einde van de select string: `, werkvorm, bendy_groepen`

### Edge function - UPDATE path wijzigingen

**C1 - Certificaten (regels 1031-1035):**
```typescript
if (attrs.certificates) {
  const parsed = parseCertificates(attrs.certificates);
  if (parsed && parsed.length > 0) {
    updateData.certificaten = parsed;
  }
}
```

**C2 - Werkvorm (nieuw, na certificaten blok, rond regel 1036):**
```typescript
// Werkvorm bijwerken vanuit Bendy professional_type
const mappedWerkvorm = mapWerkvorm(attrs.professional_type || null);
if (mappedWerkvorm && mappedWerkvorm !== matchedPro.werkvorm) {
  updateData.werkvorm = mappedWerkvorm;
}
```

**C3 - Bendy groepen (nieuw, invoegen rond regel 1069, VOOR de bestaande userGroupIds declaratie op regel 1071):**

De bestaande code op regels 1071-1075 declareert al `userGroupIds` en `userGroupNames`. We voegen de groepen-opslag toe direct na die declaratie (rond regel 1075):
```typescript
// Bendy groepen opslaan
const userGroupNamesForStorage = userGroupIds
  .map((id: string) => groupMap.get(id))
  .filter(Boolean) as string[];
if (userGroupNamesForStorage.length > 0) {
  updateData.bendy_groepen = userGroupNamesForStorage;
} else {
  updateData.bendy_groepen = [];
}
```

Noot: `userGroupNames` op regel 1073-1075 IS al exact wat we nodig hebben, dus we kunnen dit vereenvoudigen door direct `userGroupNames` te gebruiken:
```typescript
updateData.bendy_groepen = userGroupNames.length > 0 ? userGroupNames : [];
```

**C4 - Company data (regels 1043-1053):**
```typescript
if (companyAttrs.name) updateData.bedrijfsnaam = companyAttrs.name;
if (companyAttrs.chamber_of_commerce_number) updateData.kvk_nummer = companyAttrs.chamber_of_commerce_number;
if (companyAttrs.vat_id) updateData.btw_nummer = companyAttrs.vat_id;
if (companyAttrs.iban) updateData.iban = companyAttrs.iban;
if (companyAttrs.big_number) updateData.big_nummer = companyAttrs.big_number;
if (companyAttrs.agb_code) updateData.agb_code = companyAttrs.agb_code;
if (companyAttrs.skj_registration_number) updateData.skj_registratie = companyAttrs.skj_registration_number;
if (companyAttrs.iban_name_of) updateData.iban_tenaamstelling = companyAttrs.iban_name_of;
if (companyAttrs.bookkeeping_email) updateData.boekhouding_email = companyAttrs.bookkeeping_email;
if (companyAttrs.telephone) updateData.bedrijfstelefoon = companyAttrs.telephone;
```

### Edge function - INSERT path (na regel 1181)
```typescript
bendy_groepen: userGroupNames.length > 0 ? userGroupNames : [],
```

### ProfessionalCard.tsx

Interface uitbreiding (rond regel 30):
```typescript
bendy_groepen?: string[] | null;
```

Teal badges na skills blok (na regel 210, voor document compliance badge):
```tsx
{professional.bendy_groepen && professional.bendy_groepen.length > 0 && (
  <div className="flex gap-1.5 flex-wrap mb-2">
    {professional.bendy_groepen.slice(0, 2).map((groep, idx) => (
      <Badge
        key={idx}
        variant="outline"
        className="text-xs font-normal bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800"
      >
        {groep}
      </Badge>
    ))}
    {professional.bendy_groepen.length > 2 && (
      <Badge variant="ghost" className="text-xs font-normal">
        +{professional.bendy_groepen.length - 2}
      </Badge>
    )}
  </div>
)}
```

### ProfessionalDetailModal.tsx

Interface uitbreiding (na regel 93):
```typescript
bendy_groepen?: string[] | null;
```

Bendy Groepen sectie (na CV sectie, voor Contact sectie - na regel 785):
```tsx
{/* Bendy Groepen */}
{professional.bendy_groepen && professional.bendy_groepen.length > 0 && (
  <>
    <Separator />
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg collapsible-glass collapsible-glass-rose">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Bendy Groepen
        </h3>
        <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="flex flex-wrap gap-2 p-3">
          {professional.bendy_groepen.map((groep: string) => (
            <Badge key={groep} variant="outline" className="bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800">
              {groep}
            </Badge>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  </>
)}
```

`Users` is al geimporteerd op regel 21.

## Verwacht resultaat
- Certificaten, werkvorm, bedrijfsgegevens worden bij elke sync bijgewerkt (niet meer null-only)
- Bendy groepen worden opgeslagen in `bendy_groepen` kolom
- Teal badges zichtbaar op ProfessionalCard en in ProfessionalDetailModal
- INSERT path bevat ook bendy_groepen voor nieuwe professionals

