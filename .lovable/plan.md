
# Debug Resultaat: Profielfoto's Update Faalt

## Root Cause Analyse

### Situatie
De Edge Function werkt **correct**, maar vindt geen matching contacts vanwege data inconsistenties.

### Bewijs uit Database

| Contact Phone | Contact org_id | VPS stuurt org_id | Match? |
|---------------|----------------|-------------------|--------|
| `31687654321@s.whatsapp.net` | `650e8400-...` (CitoZorg) | `550e8400-...` (ABCzorg) | ❌ |
| `31618710360` | **Bestaat niet** in ABCzorg | `550e8400-...` (ABCzorg) | ❌ |

### Logs Bevestigen Dit

```
[58327580] Searching contacts with phone variants: 31687654321, 31687654321@s.whatsapp.net, +31687654321
[58327580] ⚠️ No contact found for phone 31687654321 in org 550e8400-... - photo stored but contact not updated
```

## Oorzaken

1. **Contact in verkeerde org**: `31687654321` staat in CitoZorg maar foto sync draait via ABCzorg sessie
2. **Contact bestaat niet**: `31618710360` is niet aangemaakt als contact voordat foto sync draaide

## Opties

### Optie A: Data Cleanup (Handmatig)
Verplaats/kopieer contacts naar de juiste org.

### Optie B: Cross-Org Phone Lookup (Code Fix)
Pas Edge Function aan om óók te zoeken zonder org_id filter (minder veilig).

### Optie C: Ensure Contact Exists First (Robuustheid)
Pas Edge Function aan om automatisch een contact aan te maken als deze niet bestaat.

## Aanbevolen Oplossing: Optie C

Voeg "create-if-not-exists" logica toe aan `handleContactProfilePicture`:

```typescript
// Als geen bestaand contact gevonden, maak er een aan
if (!updatedContacts || updatedContacts.length === 0) {
  // Probeer contact aan te maken met minimale data
  const { data: newContact, error: insertError } = await supabase
    .from('whatsapp_contacts')
    .insert({
      org_id: orgId,
      session_id: sessionId,
      phone_number: phone,
      profile_picture_url: publicUrl,
    })
    .select('id')
    .single();
    
  if (insertError) {
    console.warn(`[${requestId}] Could not create contact: ${formatError(insertError)}`);
    return { success: true, url: publicUrl, contactCreated: false };
  }
  
  return { success: true, url: publicUrl, contactCreated: true };
}
```

## Implementatie

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| EDIT | `supabase/functions/whatsapp-bridge/index.ts` | Voeg auto-create contact logica toe |

## Overwegingen

- **Veiligheid**: org_id filter blijft behouden (multi-tenant veilig)
- **Data integriteit**: Nieuwe contacts krijgen alleen phone + profile_picture_url (minimaal)
- **Backwards compatible**: Bestaande contacts worden gewoon geüpdatet
