
# BENDY-FIX-7: Sync Velden UI + Diagnostiek Fix

## Overzicht
4 bestanden aanpassen om de 6 nieuw gesynchroniseerde velden zichtbaar te maken in de UI en de diagnostiek pagina bij te werken.

## Wijziging 1 -- `src/pages/BendySync.tsx` (regel 73-77)
SYNCED_FIELDS array uitbreiden van 12 naar 20 items. Toevoegen: `mobile`, `comment_public`, `comment`, `website`, `invoice_company_name`, `invoice_address`, `invoice_zipcode`, `invoice_town`.

## Wijziging 2 -- `src/components/organization/SublocationDetailModal.tsx`
4 aanpassingen:

**2a** Interface (regel 15-32): `postcode`, `email`, `contactpersoon_naam`, `interne_opmerking` toevoegen.

**2b** Locatie informatie card (regel 129-147): Postcode+Plaats gecombineerd, e-mail en contactpersoon velden toevoegen.

**2c** Werkbeschrijving tab (regel 228-233): Interne opmerking tonen in amber kader, na publieke opmerking.

**2d** Lege-check (regel 234): `!sublocation.interne_opmerking` toevoegen aan conditie.

## Wijziging 3 -- `src/components/organization/OrganizationDetailModal.tsx`
2 aanpassingen:

**3a** Organization interface (regel 46-55): 4 invoice velden toevoegen (`invoice_bedrijfsnaam`, `invoice_adres`, `invoice_postcode`, `invoice_plaats`).

**3b** Factuurgegevens card (voor regel 626): Nieuwe Card met amber rand en `FileText` icoon, toont bedrijfsnaam, adres, postcode+plaats conditioneel. Alleen zichtbaar als er factuurdata is.

Data query hoeft niet aangepast: `Klanten.tsx` gebruikt al `select("*")`.

## Wijziging 4 -- `src/types/organization.ts`
**4a** Sublocation interface (regel 4-23): `email`, `contactpersoon_naam`, `interne_opmerking` toevoegen.

**4b** Organization interface (regel 39-53): `invoice_bedrijfsnaam`, `invoice_adres`, `invoice_postcode`, `invoice_plaats` toevoegen.

## Geen andere bestanden
Alleen deze 4 bestanden worden gewijzigd.
