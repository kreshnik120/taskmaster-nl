
# Dienst Templates Systeem

## Overzicht
Herbruikbaar template systeem voor de planningsmodule. Gebruikers slaan dienst-instellingen op als templates en laden deze bij het aanmaken van nieuwe diensten. Templates zijn per organisatie beschikbaar.

## Stap 1: Database Migratie

Nieuwe tabel `dienst_templates` met:
- `id`, `org_id`, `naam`, `template_data` (JSONB), `aangemaakt_door`, timestamps
- RLS: SELECT/INSERT op org-basis, UPDATE/DELETE alleen door eigenaar
- Index op `org_id` en `aangemaakt_door`
- `updated_at` trigger
- Realtime publicatie

```sql
CREATE TABLE dienst_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  aangemaakt_door UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dienst_templates_org ON dienst_templates(org_id);
CREATE INDEX idx_dienst_templates_user ON dienst_templates(aangemaakt_door);

ALTER TABLE dienst_templates ENABLE ROW LEVEL SECURITY;

-- RLS: org-leden kunnen lezen en aanmaken
CREATE POLICY "dienst_templates_select" ON dienst_templates FOR SELECT USING (
  org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid())
);
CREATE POLICY "dienst_templates_insert" ON dienst_templates FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid())
);
-- Alleen eigenaar kan wijzigen/verwijderen
CREATE POLICY "dienst_templates_update" ON dienst_templates FOR UPDATE USING (
  aangemaakt_door = auth.uid()
);
CREATE POLICY "dienst_templates_delete" ON dienst_templates FOR DELETE USING (
  aangemaakt_door = auth.uid()
);

CREATE TRIGGER update_dienst_templates_updated_at
  BEFORE UPDATE ON dienst_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE dienst_templates;
```

## Stap 2: NieuweDienstModal.tsx Wijzigingen

### A. Imports uitbreiden
Toevoegen aan lucide-react import: `Trash2`, `BookmarkPlus`

### B. Nieuwe state
```typescript
const [selectedTemplate, setSelectedTemplate] = useState("none");
```

### C. Templates ophalen (useQuery)
Query op `dienst_templates` gefilterd op `org_id`, alleen bij nieuw aanmaken (niet edit).

### D. Template laden handler
`handleLoadTemplate(templateId)` -- vult alle formuliervelden in vanuit `template_data` JSONB. Datum en status worden NIET overgenomen.

### E. Opslaan als template handler
`handleSaveAsTemplate()` -- vraagt naam via `window.prompt`, slaat huidige formulierwaarden op als JSONB in `template_data`.

### F. Template verwijderen handler
`handleDeleteTemplate(templateId)` -- verwijdert template na bevestiging.

### G. Template selector UI
Na de cascade selectie (org/locatie/afdeling), een Select dropdown met:
- "Geen template" als default
- Alle org templates als opties
- Trash-icon naast dropdown bij geselecteerde template
- Alleen zichtbaar bij nieuw aanmaken, NIET bij edit

### H. Footer aanpassing
Extra knop "Opslaan als template" met BookmarkPlus icon, links van Annuleren. Alleen bij nieuw aanmaken.

### I. Reset bij sluiten
`setSelectedTemplate("none")` toevoegen aan bestaande reset useEffect.

## Template Data Structuur

De `template_data` JSONB slaat alle velden op BEHALVE datum en status:

| Veld | Type | Beschrijving |
|------|------|-------------|
| sublocation_id | uuid | Afdeling |
| location_id | uuid | Locatie |
| titel | text | Diensttitel |
| start_tijd | text | Starttijd (HH:MM) |
| eind_tijd | text | Eindtijd (HH:MM) |
| pauze_minuten | number | Pauze in minuten |
| pauze_manual | boolean | Handmatige pauze |
| functie_niveaus | text[] | Vereiste niveaus |
| certificeringen | text[] | Vereiste certificeringen |
| gevraagd_aantal | number | Aantal medewerkers |
| werkvorm | text | ZZP/Loondienst |
| dienst_type | text | dag/avond/nacht/weekend |
| tarief_per_uur | number | Uurtarief |
| herhaling | text | Herhalingspatroon |
| opmerkingen | text | Publiek/flexwerker/prive |
| slaapdienst velden | mixed | Slaapdienst configuratie |
| is_spoed | boolean | Spoedmarkering |
| kleur | text | Kleurcode |

## Gewijzigde Bestanden
1. Database migratie (nieuw)
2. `src/components/planning/NieuweDienstModal.tsx` (bestaand, uitbreiden)
