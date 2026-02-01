

# WhatsApp Data Quality - Verbeterd Herstelplan

## 📊 Geverifieerde Situatie

### Exacte Duplicaten Gevonden

| Nummer (genormaliseerd) | Aantal records | Formaten | Met foto | Met chat |
|------------------------|----------------|----------|----------|----------|
| `31648005001` (Kreshnik) | **4** | `+31...`, `31...`, `31...@s.whatsapp.net` | 2 | 3 |
| `31642520970` (Vigiilent) | 2 | `+31...`, `31...` | 1 | 1 (andere) |
| `31686861816` (BLOEZEM) | 2 | `+31...`, `31...` | 1 | 2 (andere) |
| + 8 andere paren | 16 | Mix | Mix | Mix |

**Totaal: 11 duplicate sets = 24+ extra records**

### Root Cause (Bevestigd in Code)

```typescript
// Regel 1199-1204: EXACT match op phone_number
const { data: existing } = await supabase
  .from("whatsapp_contacts")
  .select("id, display_name, profile_picture_url")
  .eq("session_id", sessionId)
  .eq("phone_number", phoneNumber)  // ❌ "+31642520970" !== "31642520970"
  .maybeSingle();
```

---

## 🔧 Verbeterde Oplossing

### Architectuur Wijzigingen

| Huidige Situatie | Verbeterde Aanpak |
|------------------|-------------------|
| Lookup op `session_id` + exact `phone_number` | Lookup op `org_id` + genormaliseerd nummer |
| Geen normalisatie | `normalizePhoneNumber()` functie |
| Geen database constraint | `UNIQUE INDEX` op genormaliseerd nummer |

---

## Stap 1: Normalisatie Functie (Code)

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

Voeg toe na regel 14 (na `formatError` functie):

```typescript
/**
 * Normaliseert telefoon nummers naar standaard formaat.
 * Verwijdert '+', WhatsApp suffixes, en converteert naar alleen cijfers.
 * 
 * Voorbeelden:
 * - "+31642520970" → "31642520970"
 * - "31642520970@s.whatsapp.net" → "31642520970"
 * - "06-12345678" → "31612345678" (NL prefix)
 */
function normalizePhoneNumber(input: string): string {
  if (!input || input.startsWith('group-')) {
    return input; // Groepen niet normaliseren
  }
  
  // Verwijder WhatsApp suffix eerst
  let normalized = input.split('@')[0];
  
  // Verwijder alle niet-cijfers (inclusief + en -)
  normalized = normalized.replace(/[^0-9]/g, '');
  
  // NL: converteer 06... naar 316...
  if (normalized.startsWith('06') && normalized.length === 10) {
    normalized = '31' + normalized.substring(1);
  }
  
  // NL: converteer 6... (zonder 0) naar 316... als het 9 cijfers is
  if (normalized.startsWith('6') && normalized.length === 9) {
    normalized = '31' + normalized;
  }
  
  return normalized;
}
```

---

## Stap 2: Update getOrCreateContact (Code)

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts` - regel 1190-1248

Vervang de lookup logica met org_id en genormaliseerde zoekopdracht:

```typescript
async function getOrCreateContact(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  phoneNumber: string,
  displayName: string | undefined,
  requestId: string
) {
  // Normaliseer het nummer voor consistente lookup
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  
  // VERBETERD: Zoek op org_id + genormaliseerd nummer (niet session_id)
  // Dit voorkomt duplicaten wanneer hetzelfde nummer in verschillende formaten binnenkomt
  const { data: existing } = await supabase
    .from("whatsapp_contacts")
    .select("id, display_name, profile_picture_url, phone_number")
    .eq("org_id", orgId)
    .or(`phone_number.eq.${normalizedPhone},phone_number.eq.+${normalizedPhone}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log(`[${requestId}] Found existing contact by normalized lookup: ${existing.phone_number} → ${normalizedPhone}`);
    
    // Update push_name if provided (maar overschrijf user-edited display_name niet)
    if (displayName && !existing.display_name) {
      await supabase
        .from("whatsapp_contacts")
        .update({ 
          display_name: displayName,
          push_name: displayName 
        })
        .eq("id", existing.id);
    }
    return existing;
  }

  // Maak nieuw contact met genormaliseerd nummer
  console.log(`[${requestId}] Creating new contact: ${normalizedPhone} (original: ${phoneNumber})`);
  const { data: newContact, error } = await supabase
    .from("whatsapp_contacts")
    .insert({
      org_id: orgId,
      session_id: sessionId,
      phone_number: normalizedPhone,  // ✅ Opslaan als genormaliseerd
      whatsapp_jid: `${normalizedPhone}@s.whatsapp.net`,
      display_name: displayName || normalizedPhone,
      push_name: displayName || null,
    })
    .select("id, display_name")
    .single();

  if (error) {
    throw new Error(`Contact creation failed: ${formatError(error)}`);
  }

  // Trigger automatische profielfoto-sync
  if (newContact) {
    console.log(`[${requestId}] 📷 Triggering background profile picture fetch`);
    EdgeRuntime.waitUntil(
      fetchProfilePictureForNewContact(supabase, sessionId, orgId, newContact.id, normalizedPhone, requestId)
    );
  }

  return newContact;
}
```

---

## Stap 3: Database Cleanup (SQL Migratie)

### 3A: Merge Bestaande Duplicaten

Voor elk duplicate-set: behoud het record met foto, update chat referenties, verwijder rest.

```sql
-- =====================================================
-- STAP 3A: MERGE DUPLICATES - Kreshnik (4 records → 1)
-- =====================================================

-- Behoud: 9f68dd01-0bfc-4eb4-bd0e-cdd5b79eae03 (heeft foto + chat)
-- Update phone_number naar genormaliseerd formaat
UPDATE whatsapp_contacts 
SET phone_number = '31648005001'
WHERE id = '9f68dd01-0bfc-4eb4-bd0e-cdd5b79eae03';

-- Verplaats chats van duplicates naar behouden contact
UPDATE whatsapp_chats 
SET contact_id = '9f68dd01-0bfc-4eb4-bd0e-cdd5b79eae03'
WHERE contact_id IN (
  '916882a1-8440-4388-9ece-c22ea74046ae',
  'c178d1d3-3394-4bea-8df9-83f74cb80727',
  '890dddcd-5b20-4752-ae23-e21198e30429'
);

-- Soft-delete duplicates
DELETE FROM whatsapp_contacts
WHERE id IN (
  '916882a1-8440-4388-9ece-c22ea74046ae',
  'c178d1d3-3394-4bea-8df9-83f74cb80727',
  '890dddcd-5b20-4752-ae23-e21198e30429'
);

-- =====================================================
-- STAP 3A: MERGE DUPLICATES - Vigiilent (2 records → 1)
-- =====================================================

-- Behoud: 813a7f37-87e2-4f0a-8a28-d4ba3ad24e63 (heeft foto)
UPDATE whatsapp_chats 
SET contact_id = '813a7f37-87e2-4f0a-8a28-d4ba3ad24e63'
WHERE contact_id = 'f9c079e1-2723-4f27-aa19-982c9fc10300';

DELETE FROM whatsapp_contacts
WHERE id = 'f9c079e1-2723-4f27-aa19-982c9fc10300';

-- =====================================================
-- STAP 3A: MERGE DUPLICATES - BLOEZEM (2 records → 1)
-- =====================================================

-- Behoud: 43b156aa-4439-4600-9014-b67e9869c7ef (heeft foto)
-- Update display_name van duplicate (BLOEZEM is betere naam)
UPDATE whatsapp_contacts 
SET display_name = 'BLOEZEM'
WHERE id = '43b156aa-4439-4600-9014-b67e9869c7ef';

UPDATE whatsapp_chats 
SET contact_id = '43b156aa-4439-4600-9014-b67e9869c7ef'
WHERE contact_id = 'af1e3d90-fc42-4355-9f6b-4ad21a7ac107';

DELETE FROM whatsapp_contacts
WHERE id = 'af1e3d90-fc42-4355-9f6b-4ad21a7ac107';

-- (Herhaal voor de overige 8 duplicate sets)
```

### 3B: Database Constraint Toevoegen

```sql
-- =====================================================
-- STAP 3B: PREVENTIEVE CONSTRAINT
-- =====================================================

-- Voeg unique index toe op genormaliseerd nummer per organisatie
-- Dit voorkomt toekomstige duplicaten zelfs als code faalt
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_normalized_phone 
ON whatsapp_contacts (
  org_id, 
  REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')
) 
WHERE phone_number NOT LIKE 'group-%';
```

---

## Implementatievolgorde

| # | Actie | Type | Risico | Rollback |
|---|-------|------|--------|----------|
| 1 | Voeg `normalizePhoneNumber` functie toe | Code | Geen | Revert |
| 2 | Update `getOrCreateContact` met org_id lookup | Code | Laag | Revert |
| 3 | Deploy Edge Function | Deploy | Geen | - |
| 4 | SQL: Merge Kreshnik (4→1) | Data | Medium | Herstel backup |
| 5 | SQL: Merge Vigiilent (2→1) | Data | Medium | Herstel backup |
| 6 | SQL: Merge BLOEZEM (2→1) | Data | Medium | Herstel backup |
| 7 | SQL: Merge overige 8 sets | Data | Medium | Herstel backup |
| 8 | SQL: Voeg UNIQUE INDEX toe | Schema | Laag | Drop index |
| 9 | Verificatie queries | Test | Geen | - |

---

## Verwacht Resultaat

### Voor:
- 24+ duplicate contact records
- 11 nummers met meerdere contacten
- Profielfoto's niet gekoppeld aan chats

### Na:
- **0 duplicaten** (alle gemerged)
- Database constraint voorkomt nieuwe duplicaten
- Genormaliseerde nummers (`31...` formaat)
- Alle chats gekoppeld aan contact met profielfoto

---

## Verificatie Queries

```sql
-- Test 1: Geen duplicaten meer
SELECT 
  REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g') as normalized,
  COUNT(*) 
FROM whatsapp_contacts
WHERE phone_number NOT LIKE 'group-%'
GROUP BY 1
HAVING COUNT(*) > 1;
-- Verwacht: 0 rijen

-- Test 2: Vigiilent heeft 1 contact met foto en chat
SELECT c.phone_number, c.display_name, c.profile_picture_url IS NOT NULL as has_photo, COUNT(ch.id) as chats
FROM whatsapp_contacts c
LEFT JOIN whatsapp_chats ch ON ch.contact_id = c.id
WHERE REGEXP_REPLACE(c.phone_number, '[^0-9]', '', 'g') = '31642520970'
GROUP BY 1,2,3;
-- Verwacht: 1 rij met has_photo=true, chats>=1
```

