
# Fix: Archief 404 — Route mismatch

## Probleem
De sidebar (`AppSidebar.tsx` regel 86) linkt naar `/sollicitaties-archief`, maar de route in `App.tsx` (regel 106) is gedefinieerd als `/sollicitaties/archief`. Dit veroorzaakt een 404.

## Oplossing
Twee bestanden aanpassen zodat ze dezelfde URL gebruiken (`/sollicitaties/archief`):

1. **`src/components/AppSidebar.tsx`** — Wijzig URL van `/sollicitaties-archief` naar `/sollicitaties/archief`
2. **`src/components/AIAssistant/ChatWidget.tsx`** — Wijzig de key van `/sollicitaties-archief` naar `/sollicitaties/archief`

Geen andere wijzigingen nodig — de route en pagina-component bestaan al correct.
