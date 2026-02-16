

# BENDY-FIX-8: Ontbrekende Velden Syncen (5 nieuwe velden)

## Overzicht
5 Bendy-velden met significante fill rates toevoegen aan de sync engine en zichtbaar maken in de UI. 6 bestanden worden gewijzigd.

## Wijziging 1 -- SQL Migratie (nieuw bestand)
5 nieuwe kolommen:
- `client_organizations.crm_fase` (TEXT)
- `client_organizations.afkorting` (TEXT)
- `client_sublocations.externe_referentie` (TEXT)
- `client_sublocations.bendy_parent_id` (TEXT)
- `client_sublocations.kleur` (TEXT)

Alle met `ADD COLUMN IF NOT EXISTS`, idempotent.

## Wijziging 2 -- `supabase/functions/bendy-sync/index.ts`

**2a** SELECT org (regel 322): `crm_fase, afkorting` toevoegen.

**2b** Org update blok (regel 355, na invoice_town): `crm_stage` en `abbreviation` condities toevoegen.

**2c** SELECT subs (regel 430): `externe_referentie, bendy_parent_id, kleur` toevoegen.

**2d** UPDATE sub (regel 531, na comment): 3 condities voor `external_id`, `parent_id`, `color` toevoegen (met `String()` conversie voor ID-velden).

**2e** INSERT sub (regel 572, na interne_opmerking): `externe_referentie`, `bendy_parent_id`, `kleur` meegeven.

Edge function wordt herdeployed.

## Wijziging 3 -- `src/pages/BendySync.tsx`
SYNCED_FIELDS array (regel 80-86): 5 items toevoegen (`crm_stage`, `abbreviation`, `external_id`, `parent_id`, `color`). Totaal wordt 25.

## Wijziging 4 -- `src/types/organization.ts`
- Sublocation interface (na regel 25): `externe_referentie`, `bendy_parent_id`, `kleur` toevoegen.
- Organization interface (na regel 55): `crm_fase`, `afkorting` toevoegen.

## Wijziging 5 -- `src/components/organization/OrganizationDetailModal.tsx`
- Organization interface (regel 46-58): `crm_fase`, `afkorting` toevoegen.
- Na Factuurgegevens card (regel 663): Nieuwe "Bendy gegevens" card met teal rand, toont CRM Fase en Afkorting conditioneel.

## Wijziging 6 -- `src/components/organization/SublocationDetailModal.tsx`
- Sublocation interface (regel 15-35): `externe_referentie`, `bendy_parent_id`, `kleur` toevoegen.
- Locatie informatie grid (na regel 159): Externe referentie en Kleur (met kleur-bolletje) conditioneel tonen.

## Geen andere bestanden
6 bestanden totaal: 1 SQL migratie, bendy-sync/index.ts, BendySync.tsx, organization.ts, OrganizationDetailModal.tsx, SublocationDetailModal.tsx.

