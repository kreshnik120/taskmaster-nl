

# Plan: Voltooiing TaskListView Medewerker-Kleuren

## Doel

De **laatste 3 ontbrekende componenten** aanpassen om het consistente medewerker-kleursysteem volledig te implementeren. Na deze wijzigingen zijn **alle 11 componenten** klaar.

---

## Wijzigingen

### 1. TaskListTable.tsx

**Locatie:** Regels 170-175

**Actie:**
- Import toevoegen: `import { getAssigneeColor } from "@/hooks/useAssigneeColor";`
- AvatarFallback styling aanpassen met dynamische kleuren

**Van:**
```tsx
<Avatar className="h-6 w-6">
  <AvatarFallback className="text-xs">
    {getInitials(task.profiles?.name)}
  </AvatarFallback>
</Avatar>
```

**Naar:**
```tsx
<Avatar className="h-6 w-6">
  <AvatarFallback className={cn(
    "text-xs",
    getAssigneeColor(task.assignee_id).avatarBg,
    getAssigneeColor(task.assignee_id).avatarText
  )}>
    {getInitials(task.profiles?.name)}
  </AvatarFallback>
</Avatar>
```

---

### 2. TaskListVirtualized.tsx

**Locatie:** Regels 217-223

**Actie:**
- Import toevoegen: `import { getAssigneeColor } from "@/hooks/useAssigneeColor";`
- Identieke styling-aanpassing als TaskListTable

**Van:**
```tsx
<Avatar className="h-6 w-6">
  <AvatarFallback className="text-xs">
    {getInitials(task.profiles?.name)}
  </AvatarFallback>
</Avatar>
```

**Naar:**
```tsx
<Avatar className="h-6 w-6">
  <AvatarFallback className={cn(
    "text-xs",
    getAssigneeColor(task.assignee_id).avatarBg,
    getAssigneeColor(task.assignee_id).avatarText
  )}>
    {getInitials(task.profiles?.name)}
  </AvatarFallback>
</Avatar>
```

---

### 3. TaskListSidePanel.tsx

**Locatie:** Regels 177-182

**Actie:**
- Import toevoegen: `import { getAssigneeColor } from "@/hooks/useAssigneeColor";`
- Identieke styling-aanpassing

**Van:**
```tsx
<Avatar className="h-6 w-6">
  <AvatarFallback className="text-xs">
    {getInitials(task.profiles?.name)}
  </AvatarFallback>
</Avatar>
```

**Naar:**
```tsx
<Avatar className="h-6 w-6">
  <AvatarFallback className={cn(
    "text-xs",
    getAssigneeColor(task.assignee_id).avatarBg,
    getAssigneeColor(task.assignee_id).avatarText
  )}>
    {getInitials(task.profiles?.name)}
  </AvatarFallback>
</Avatar>
```

---

## Technische Details

| Aspect | Waarde |
|--------|--------|
| **ID-veld gebruikt** | `task.assignee_id` (string \| null) |
| **Fallback bij null** | Grijze UNASSIGNED_COLOR |
| **Dark mode** | Automatisch via hook |
| **Bestaande cn() import** | Ja, aanwezig in alle 3 bestanden |

---

## Resultaat Na Implementatie

| Component | Status |
|-----------|--------|
| useAssigneeColor.ts | ✅ Klaar |
| TaskCard.tsx | ✅ Klaar |
| ApplicationCard.tsx | ✅ Klaar |
| EmbeddedListView.tsx | ✅ Klaar |
| AssigneeProgress.tsx | ✅ Klaar |
| AppSidebar.tsx | ✅ Klaar |
| ApplicationNotes.tsx | ✅ Klaar |
| RecentClientsWidget.tsx | ✅ Klaar |
| RecentMovementsWidget.tsx | ✅ Klaar |
| **TaskListTable.tsx** | 🔄 → ✅ |
| **TaskListVirtualized.tsx** | 🔄 → ✅ |
| **TaskListSidePanel.tsx** | 🔄 → ✅ |

**Totaal: 3 bestanden, 3 imports, 3 styling-wijzigingen**

