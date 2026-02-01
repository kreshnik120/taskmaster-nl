

# WhatsApp Contacten Zoekfunctie - Implementatieplan

## Overzicht

Geavanceerde zoekfunctie waarmee gebruikers WhatsApp contacten kunnen zoeken op naam of telefoonnummer. Zoekresultaten tonen als overlay boven de chatlijst.

---

## Te Maken Bestanden

### 1. `src/hooks/whatsapp/useSearchContacts.ts`

Hook voor het zoeken van contacten met 300ms debouncing. Zoekt in `whatsapp_contacts` tabel op `display_name` en `phone_number` met ILIKE query, max 20 resultaten.

### 2. `src/components/whatsapp/WhatsAppContactSearchResults.tsx`

Overlay component met:
- Skeleton loading state
- Empty state bij geen resultaten  
- Per resultaat: avatar, naam, telefoonnummer, business badge
- Keyboard navigatie (Arrow keys, Enter, ESC)
- Click-outside sluit overlay

---

## Aan Te Passen Bestanden

### 3. `src/components/whatsapp/WhatsAppChatList.tsx`

- State voor `isContactSearchMode`
- Integreer `useSearchContacts` hook
- Toon overlay wanneer query >= 2 karakters
- Nieuwe prop: `onSelectContact`

### 4. `src/pages/WhatsApp.tsx`

- `handleSelectContact` callback
- Logica: zoek bestaande chat OF toon melding voor nieuwe chat

---

## Implementatie Stappen

| # | Taak | Bestand |
|---|------|---------|
| 1 | Maak search hook | `useSearchContacts.ts` |
| 2 | Maak results overlay component | `WhatsAppContactSearchResults.tsx` |
| 3 | Integreer in chat list | `WhatsAppChatList.tsx` |
| 4 | Voeg contact handler toe | `WhatsApp.tsx` |

---

## Keyboard Shortcuts

| Toets | Actie |
|-------|-------|
| Arrow Down/Up | Navigeer door resultaten |
| Enter | Selecteer gefocust resultaat |
| Escape | Sluit zoekresultaten |

