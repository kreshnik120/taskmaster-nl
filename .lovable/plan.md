
# Console.log Cleanup - Gecorrigeerd Plan

## Audit Resultaten

Na grondige controle van alle bestanden zijn de **exacte locaties** geïdentificeerd:

---

## Bestanden en Correcte Lijnnummers

### 1. `src/pages/Bijlagen.tsx` (5 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 120 | `console.log('[Bijlagen] Realtime update:', ...)` | → `log.debug()` |
| 128 | `console.log('[Bijlagen] Invalidating cache...')` | → `log.debug()` |
| 135 | `console.log('[Bijlagen] Realtime channel subscribed')` | → `log.log()` |
| 138 | `console.error('[Bijlagen] Realtime channel error')` | ✅ Behouden (error) |
| 147 | `console.log('[Bijlagen] Unsubscribing...')` | → `log.debug()` |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('Bijlagen')`

---

### 2. `src/pages/VerwijderdeTaken.tsx` (2 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 84 | `console.log('[VerwijderdeTaken] Realtime update:', ...)` | → `log.debug()` |
| 125 | `console.error("Error fetching deleted tasks:", ...)` | ✅ Behouden (error) |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('VerwijderdeTaken')`

---

### 3. `src/pages/AfgerondeTaken.tsx` (2 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 75 | `console.log('[AfgerondeTaken] Realtime update:', ...)` | → `log.debug()` |
| 118 | `console.error("Error fetching completed tasks:", ...)` | ✅ Behouden (error) |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('AfgerondeTaken')`

---

### 4. `src/components/TaskListView/TaskListView.tsx` (5 statements - VERWIJDEREN)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 180 | `console.log('Bulk status change:', ...)` | ❌ Verwijderen (TODO) |
| 186 | `console.log('Bulk priority change:', ...)` | ❌ Verwijderen (TODO) |
| 192 | `console.log('Bulk delete:', ...)` | ❌ Verwijderen (TODO) |
| 278 | `console.log('Edit task:', ...)` | ❌ Verwijderen (TODO) |
| 282 | `console.log('Delete task:', ...)` | ❌ Verwijderen (TODO) |

**Actie**: Vervang alle 5 `console.log()` met `// Placeholder - will be replaced with actual implementation`

---

### 5. `src/components/NewApplicationDialog.tsx` (1 statement)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 428 | `console.log("🔍 CV Upload Check:", {...})` | → `log.debug()` |

**Noot**: Component heeft al `const log = logger.create('NewApplicationDialog')`, alleen console.log vervangen

---

### 6. `src/components/ActionTimeline.tsx` (1 statement)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 585 | `console.warn('Could not save filter state...', error)` | → `logger.warn()` |

**Toevoegen**: `import { logger } from '@/lib/logger'`

---

### 7. `src/hooks/whatsapp/useWhatsAppSendMessage.ts` (2 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 32 | `console.log('[useWhatsAppSendMessage] Sending via MCP...')` | → `log.debug()` |
| 58 | `console.log('[useWhatsAppSendMessage] Message sent successfully...')` | → `log.debug()` |

**Behouden**: Lines 47, 54, 128 zijn `console.error()` - blijven staan

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('useWhatsAppSendMessage')`

---

### 8. `src/hooks/whatsapp/useWhatsAppChats.ts` (2 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 88 | `console.error('[useWhatsAppChats] MCP proxy error:', ...)` | ✅ Behouden (error) |
| 97 | `console.log('[useWhatsAppChats] Received X chats from MCP')` | → `log.debug()` |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('useWhatsAppChats')`

---

### 9. `src/hooks/whatsapp/useWhatsAppMessages.ts` (4 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 215 | `console.log('[useWhatsAppMessages] Skipping exact duplicate:', ...)` | → `log.debug()` |
| 221 | `console.log('[useWhatsAppMessages] Replacing optimistic message...', ...)` | → `log.debug()` |
| 281 | `console.log('[useWhatsAppMessages] Message status updated:', ...)` | → `log.debug()` |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('useWhatsAppMessages')`

---

### 10. `src/hooks/useVogVerificationNotifications.ts` (6 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 43 | `console.debug('[useVogVerificationNotifications] No auth session...')` | → `log.debug()` |
| 47 | `console.log('[useVogVerificationNotifications] Setting up...')` | → `log.debug()` |
| 61 | `console.log('[useVogVerificationNotifications] Received notification:', ...)` | → `log.debug()` |
| 65 | `console.log('[useVogVerificationNotifications] Duplicate notification...')` | → `log.debug()` |
| 101 | `console.log('[useVogVerificationNotifications] Subscription status:', ...)` | → `log.debug()` |
| 109 | `console.log('[useVogVerificationNotifications] Cleaning up...')` | → `log.debug()` |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('VogVerification')`

---

### 11. `src/hooks/useDiplomaUpgradeNotifications.ts` (6 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 42 | `console.debug('[useDiplomaUpgradeNotifications] No auth session...')` | → `log.debug()` |
| 46 | `console.log('[useDiplomaUpgradeNotifications] Setting up...')` | → `log.debug()` |
| 60 | `console.log('[useDiplomaUpgradeNotifications] Received notification:', ...)` | → `log.debug()` |
| 64 | `console.log('[useDiplomaUpgradeNotifications] Duplicate notification...')` | → `log.debug()` |
| 95 | `console.log('[useDiplomaUpgradeNotifications] Subscription status:', ...)` | → `log.debug()` |
| 103 | `console.log('[useDiplomaUpgradeNotifications] Cleaning up subscription')` | → `log.debug()` |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('DiplomaUpgrade')`

---

### 12. `src/hooks/useOAuthGuard.ts` (1 statement)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 37 | `console.warn('OAuth user blocked - no profile found')` | → `logger.warn()` |

**Behouden**: Line 35 `console.error('Error checking profile:', ...)` - blijft staan

**Toevoegen**: `import { logger } from '@/lib/logger'`

---

### 13. `src/hooks/notulen/useDeleteMeetingMinute.ts` (2 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 59 | `console.warn('Could not update task:', ...)` | → `log.warn()` |
| 81 | `console.warn('Could not delete linked task:', ...)` | → `log.warn()` |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('DeleteMeetingMinute')`

---

### 14. `src/hooks/notulen/useAIExtractMeeting.ts` (4 statements)

| Lijn | Huidige Code | Actie |
|------|--------------|-------|
| 117 | `console.error('Edge function invoke error:', ...)` | ✅ Behouden (error) |
| 122 | `console.error('Extraction error from edge function:', ...)` | ✅ Behouden (error) |
| 129 | `console.error('No data returned from edge function')` | ✅ Behouden (error) |
| 134 | `console.log('✅ Extraction successful via...')` | → `log.log()` |
| 142 | `console.error('AI extraction error:', ...)` | ✅ Behouden (error) |

**Toevoegen**: `import { logger } from '@/lib/logger'` + `const log = logger.create('AIExtractMeeting')`

---

## Samenvatting

| Actie | Aantal | Beschrijving |
|-------|--------|--------------|
| Migreer naar `logger.debug()` | **24** | Realtime updates, subscriptions |
| Migreer naar `logger.log()` | **2** | Success messages |
| Migreer naar `logger.warn()` | **4** | Warning messages |
| Volledig verwijderen | **5** | TODO placeholders in TaskListView |
| **Behouden** | **12** | console.error() statements (blijven altijd actief) |
| **Totaal gewijzigd** | **35** | |

---

## Bestanden per Batch

**Batch 1 - Pages** (3 bestanden):
- `src/pages/Bijlagen.tsx`
- `src/pages/VerwijderdeTaken.tsx`
- `src/pages/AfgerondeTaken.tsx`

**Batch 2 - Components** (2 bestanden):
- `src/components/TaskListView/TaskListView.tsx`
- `src/components/ActionTimeline.tsx`

**Batch 3 - WhatsApp hooks** (3 bestanden):
- `src/hooks/whatsapp/useWhatsAppSendMessage.ts`
- `src/hooks/whatsapp/useWhatsAppChats.ts`
- `src/hooks/whatsapp/useWhatsAppMessages.ts`

**Batch 4 - Notification hooks** (3 bestanden):
- `src/hooks/useVogVerificationNotifications.ts`
- `src/hooks/useDiplomaUpgradeNotifications.ts`
- `src/hooks/useOAuthGuard.ts`

**Batch 5 - Notulen hooks** (2 bestanden):
- `src/hooks/notulen/useDeleteMeetingMinute.ts`
- `src/hooks/notulen/useAIExtractMeeting.ts`

**Batch 6 - Component (apart)**:
- `src/components/NewApplicationDialog.tsx` (heeft al logger, alleen console.log vervangen)

---

## Verificatie Checklist

| Test | Verwacht Resultaat |
|------|-------------------|
| Build succesvol | Geen TypeScript errors |
| Console in productie | Geen logs zichtbaar (behalve errors) |
| `__enableDebug()` in browser console | Alle logs weer zichtbaar |
| Error logging werkt | Errors blijven altijd in console |
