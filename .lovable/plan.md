

# WhatsApp Contact Search - Verbeteringsplan

## Huidige Status: ✅ Volledig Geïmplementeerd

De basisfeature werkt correct met alle geplande functionaliteit:
- 300ms debounced zoeken
- Overlay met resultaten bij 2+ karakters
- Keyboard navigatie (pijltjes, Enter, ESC)
- Click-outside sluit overlay
- Avatar, naam, telefoonnummer per resultaat
- Business account badge

---

## Voorgestelde Verbeteringen

### 1. Uitbreiden Zoekvelden (Prioriteit: Hoog)

**Probleem:** Nu wordt alleen gezocht op `display_name` en `phone_number`, maar `push_name` (de WhatsApp naam die de gebruiker zelf heeft ingesteld) wordt genegeerd.

**Oplossing:**
```sql
WHERE display_name ILIKE '%query%'
   OR phone_number ILIKE '%query%'
   OR push_name ILIKE '%query%'  -- TOEVOEGEN
```

**Bestand:** `src/hooks/whatsapp/useSearchContacts.ts`

---

### 2. Zoekterm Highlighting (Prioriteit: Medium)

**Probleem:** Gebruikers zien niet welk deel van de naam/nummer matchte met hun zoekopdracht.

**Oplossing:** Functie om matchende tekst te highlighten:

```typescript
function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, i) => 
    part.toLowerCase() === query.toLowerCase() 
      ? <mark key={i} className="bg-yellow-200">{part}</mark> 
      : part
  );
}
```

**Bestand:** `src/components/whatsapp/WhatsAppContactSearchResults.tsx`

---

### 3. Error State UI (Prioriteit: Medium)

**Probleem:** Bij zoekfouten wordt alleen naar console gelogd, gebruiker ziet niets.

**Oplossing:** Voeg error state toe aan de hook en toon een foutmelding in de overlay:

```typescript
// In useSearchContacts:
const { data, error, isError } = useQuery({ ... });

// In WhatsAppContactSearchResults:
if (isError) {
  return (
    <div className="...">
      <AlertCircle className="h-5 w-5 text-destructive" />
      <p>Er ging iets mis bij het zoeken</p>
      <Button onClick={retry}>Probeer opnieuw</Button>
    </div>
  );
}
```

**Bestanden:** 
- `src/hooks/whatsapp/useSearchContacts.ts`
- `src/components/whatsapp/WhatsAppContactSearchResults.tsx`

---

### 4. Recente Contacten bij Lege Query (Prioriteit: Laag)

**Probleem:** Bij focus op zoekbalk zonder tekst is de overlay leeg/gesloten.

**Oplossing:** Toon recent gecontacteerde personen wanneer query leeg is:

- Query: `ORDER BY updated_at DESC LIMIT 5` 
- Titel: "Recent gecontacteerd"

---

### 5. Nieuwe Chat Starten (Prioriteit: Laag - Future Feature)

**Probleem:** Bij contact zonder bestaande chat wordt alleen een toast getoond.

**Oplossing:** Direct een nieuwe `whatsapp_chats` record aanmaken en openen. Dit vereist meer logica en wordt aangeraden als aparte feature.

---

## Aanbevolen Volgorde

| Fase | Verbetering | Geschatte Inspanning |
|------|-------------|---------------------|
| 1 | Uitbreiden zoekvelden (push_name) | 5 minuten |
| 2 | Error state UI | 15 minuten |
| 3 | Zoekterm highlighting | 20 minuten |
| 4 | Recente contacten | 30 minuten |
| 5 | Nieuwe chat starten | 1+ uur |

---

## Volgende Stappen

Wil je dat ik een of meer van deze verbeteringen implementeer? Ik raad aan om te beginnen met **verbetering 1 (push_name toevoegen)** omdat dit een quick win is met directe waarde.

