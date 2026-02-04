
# Plan: Complete Border-Radius Consistentie in Sidebar

## Overzicht
Update de laatste 5 `rounded-md` instances in `sidebar.tsx` naar `rounded-lg` voor 100% border-radius consistentie binnen de gehele applicatie.

---

## Wijzigingen

### Bestand: `src/components/ui/sidebar.tsx`

| Regel | Component | Wijziging |
|-------|-----------|-----------|
| 491 | `SidebarMenuAction` | `rounded-md` → `rounded-lg` |
| 514 | `SidebarMenuBadge` | `rounded-md` → `rounded-lg` |
| 543 | `SidebarMenuSkeleton` container | `rounded-md` → `rounded-lg` |
| 546 | `SidebarMenuSkeleton` icon | `rounded-md` → `rounded-lg` |
| 599 | `SidebarMenuSubButton` | `rounded-md` → `rounded-lg` |

---

## Impact

- **Visuele Consistentie**: Alle sidebar elementen gebruiken nu dezelfde border-radius familie
- **Design System Compliance**: Volledige naleving van de 8px (rounded-lg) standaard voor interactieve elementen
- **Zero Breaking Changes**: Alleen cosmetische aanpassingen, geen functionele impact

---

## Verwacht Resultaat

Na implementatie heeft de gehele sidebar component 100% border-radius consistentie:
- Alle menu buttons: `rounded-lg`
- Alle action buttons: `rounded-lg`
- Alle badges: `rounded-lg`
- Alle sub-buttons: `rounded-lg`
- Alle skeleton loaders: `rounded-lg`
