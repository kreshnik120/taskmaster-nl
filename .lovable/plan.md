

# Bevindingen: Wat Werkt Niet Goed

## Overzicht

Na grondig onderzoek van de codebase, build logs, runtime errors, en console logs is er **1 actief bug** gevonden en **0 build errors**.

---

## BUG: Realtime Subscriptions Loopen (Ernst: MEDIUM)

### Probleem
De console logs tonen dat `DiplomaUpgrade` en `VogVerification` realtime subscriptions zich **continu opnieuw instellen** — setup → CLOSED → CHANNEL_ERROR → setup → SUBSCRIBED → cleanup → setup, in een eindeloze loop.

### Oorzaak
In `src/pages/Sollicitaties.tsx` regel 133-139 wordt `handleNotificationClick` als gewone functie gedefinieerd (niet met `useCallback`). Omdat Sollicitaties bij elke render een nieuwe functie-referentie maakt, en alle 3 hooks (`useDiplomaUpgradeNotifications`, `useVogVerificationNotifications`, `useProactiveMatchNotifications`) die callback als dependency hebben in hun `useEffect`, worden de subscriptions elke render afgebroken en opnieuw opgezet.

Dit veroorzaakt:
- **Onnodige Supabase realtime verbindingen** (meerdere per seconde)
- **CHANNEL_ERROR logs** in de console
- **Potentieel gemiste notificaties** tijdens reconnects

### Fix
1. **Sollicitaties.tsx**: Wrap `handleNotificationClick` in `useCallback` met `[applications]` als dependency
2. **Alternatief (robuuster)**: In alle 3 hooks, gebruik een `useRef` voor de callback i.p.v. het als useEffect-dependency te gebruiken — dan wordt de subscription nooit opnieuw opgezet

De robuustere aanpak is optie 2: gebruik `useRef` in elke hook om de callback op te slaan, zodat de `useEffect` dependency array leeg is en de subscription stabiel blijft.

### Bestanden
| Bestand | Wijziging |
|---|---|
| `src/pages/Sollicitaties.tsx` | `useCallback` wrapper rond `handleNotificationClick` |
| `src/hooks/useDiplomaUpgradeNotifications.ts` | Callback via `useRef` i.p.v. dependency |
| `src/hooks/useVogVerificationNotifications.ts` | Callback via `useRef` i.p.v. dependency |
| `src/hooks/useProactiveMatchNotifications.ts` | Callback via `useRef` i.p.v. dependency |

---

## Overige Status

- **Build**: Geen errors, alleen 1 cosmetische CSS warning
- **Deleted files**: Geen leftover imports gevonden — alle 16 verwijderde bestanden zijn schoon opgeruimd
- **Dashboard refactor**: Tabs, KPICards, Progress bars, empty states — alles werkt correct
- **BeschikbaarheidTab**: Correct gekoppeld via lazy import in Planning.tsx, alle sub-componenten bestaan

