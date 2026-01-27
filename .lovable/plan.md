

# Fix: Deelnemers Worden Niet Opgeslagen - Database Constraint Mismatch

## 1. Root Cause Analyse

| Aspect | Detail |
|--------|--------|
| **Probleem** | Database CHECK constraint accepteert `'gast'` NIET |
| **Database accepteert** | `voorzitter`, `notulist`, `deelnemer`, `afwezig` |
| **Code stuurt** | `gast` als fallback (regel 105) |
| **Gevolg** | INSERT faalt silently, 0 attendees opgeslagen |

### Bewijs - Database Constraint
```sql
CHECK ((role = ANY (ARRAY['voorzitter', 'notulist', 'deelnemer', 'afwezig'])))
```

### Bewijs - Code met verkeerde waarde
```typescript
// useCreateMeetingMinute.ts regel 105
role: (p.role as 'voorzitter' | 'notulist' | 'deelnemer' | 'gast') || 'deelnemer',
//                                                        ^^^^^^ FOUT!
```

---

## 2. Waarom Decisions WEL Werken

| Component | Storage Type | Constraint |
|-----------|--------------|------------|
| Decisions | JSONB in `meeting_minutes.decisions` | Geen CHECK constraint |
| Attendees | Separate `meeting_attendees` tabel | CHECK constraint op `role` |

Decisions worden opgeslagen als JSONB in dezelfde tabel - geen foreign keys, geen constraints.  
Attendees vereisen een INSERT in aparte tabel met strikte `role` constraint.

---

## 3. Oplossing

### Stap 1: Fix `useCreateMeetingMinute.ts`

**Locatie**: Regel 100-113

**Huidige code** (met bugs):
```typescript
if (input.participants && input.participants.length > 0) {
  const attendeesToInsert = input.participants.map(p => ({
    meeting_id: minute.id,
    external_name: p.name,
    role: (p.role as 'voorzitter' | 'notulist' | 'deelnemer' | 'gast') || 'deelnemer',
    attended: p.present ?? true,
    user_id: null,
  }));
  
  await supabase
    .from('meeting_attendees')
    .insert(attendeesToInsert);
}
```

**Correcte code**:
```typescript
if (input.participants && input.participants.length > 0) {
  // Map AI-extracted roles to valid database values
  const validRoles = ['voorzitter', 'notulist', 'deelnemer', 'afwezig'] as const;
  type ValidRole = typeof validRoles[number];
  
  const mapRole = (role: string | null | undefined): ValidRole => {
    if (!role) return 'deelnemer';
    const lowerRole = role.toLowerCase();
    // Direct match
    if (validRoles.includes(lowerRole as ValidRole)) {
      return lowerRole as ValidRole;
    }
    // Common mappings
    if (lowerRole.includes('voorzitter') || lowerRole.includes('chair')) return 'voorzitter';
    if (lowerRole.includes('notulist') || lowerRole.includes('secretaris')) return 'notulist';
    if (lowerRole.includes('afwezig') || lowerRole.includes('absent')) return 'afwezig';
    // Default
    return 'deelnemer';
  };

  const attendeesToInsert = input.participants.map(p => ({
    meeting_id: minute.id,
    external_name: p.name,
    role: mapRole(p.role),
    attended: p.present ?? true,
    user_id: null,
  }));
  
  const { error: attendeesError } = await supabase
    .from('meeting_attendees')
    .insert(attendeesToInsert);
  
  if (attendeesError) {
    console.error('Failed to insert attendees:', attendeesError);
    // Don't throw - attendees are secondary, meeting is created successfully
  }
}
```

### Stap 2: Update TypeScript Types (optioneel maar aanbevolen)

**Bestand**: `src/hooks/notulen/useManageAttendees.ts` regel 7

**Wijziging**:
```typescript
// Huidige (incorrect):
export type AttendeeRole = 'voorzitter' | 'notulist' | 'deelnemer' | 'gast';

// Correct (match database):
export type AttendeeRole = 'voorzitter' | 'notulist' | 'deelnemer' | 'afwezig';
```

---

## 4. Implementatie Volgorde

| Stap | Bestand | Wijziging |
|------|---------|-----------|
| 1 | `useCreateMeetingMinute.ts` | Fix role mapping + add error handling |
| 2 | `useManageAttendees.ts` | Update AttendeeRole type |

---

## 5. Data Flow Na Fix

```text
PDF Upload
    ↓
Gemini extraheert: participants: [
  { name: "Leonie", role: "Projectleider", present: true },
  { name: "Erik", role: "Voorzitter", present: true }
]
    ↓
mapRole("Projectleider") → "deelnemer"
mapRole("Voorzitter") → "voorzitter"
    ↓
INSERT INTO meeting_attendees (role = 'deelnemer') ✅
INSERT INTO meeting_attendees (role = 'voorzitter') ✅
    ↓
Database: 10 attendees opgeslagen!
```

---

## 6. Technische Details

### Gewijzigde Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `src/hooks/useCreateMeetingMinute.ts` | +mapRole functie, +error handling (~20 regels) |
| `src/hooks/notulen/useManageAttendees.ts` | Fix AttendeeRole type (1 regel) |

---

## 7. Acceptatie Criteria

| Criterium | Verificatie |
|-----------|-------------|
| PDF import met 10 deelnemers | Check `meeting_attendees` tabel = 10 rijen |
| Onbekende rollen worden 'deelnemer' | Test met "Projectleider" rol |
| "Voorzitter" wordt correct gemapt | Check database waarde |
| Error handling logt failures | Check console bij INSERT error |
| Bestaande functionaliteit blijft werken | Test handmatig toevoegen deelnemer |

