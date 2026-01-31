
# Plan: Fix Priority Filter Bug in ABCzorg Assistent

## Probleem Analyse

De AI Assistent genereert soms queries met meerdere prioriteit waarden als comma-separated string (bijv. `"CRITICAL,HIGH"`), maar de database verwacht individuele enum waarden.

**Huidige code:**
```typescript
// Line 5168-5170 in ai-chat/index.ts
if (args.filter?.priority) {
  tasksQuery = tasksQuery.eq('priority', args.filter.priority);
}
```

**Foutmelding:**
```
invalid input value for enum priority: CRITICAL,HIGH
```

---

## Getroffen Bestanden

| Bestand | Regel | Probleem |
|---------|-------|----------|
| `supabase/functions/ai-chat/index.ts` | 5168-5170 | `.eq()` werkt niet met meerdere waarden |
| `supabase/functions/react-agent/index.ts` | 293 | Zelfde bug |
| Tool schema (ai-chat) | 3952-3956 | Schema laat geen arrays toe |

---

## Oplossing

### 1. Update Tool Schema (ai-chat/index.ts ~3952)

Wijzig de priority filter definitie van single enum naar `oneOf` die zowel single values als arrays accepteert:

```typescript
// VOOR:
priority: { 
  type: "string", 
  enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  description: "Filter op prioriteit" 
}

// NA:
priority: { 
  oneOf: [
    { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    { 
      type: "array", 
      items: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }
    }
  ],
  description: "Filter op prioriteit (enkele waarde of array voor meerdere prioriteiten)" 
}
```

### 2. Update Query Logic (ai-chat/index.ts ~5168)

Voeg smart detection toe voor single vs. multiple values:

```typescript
// VOOR:
if (args.filter?.priority) {
  tasksQuery = tasksQuery.eq('priority', args.filter.priority);
}

// NA:
if (args.filter?.priority) {
  // Handle both string and array formats
  let priorities: string[];
  
  if (Array.isArray(args.filter.priority)) {
    priorities = args.filter.priority;
  } else if (typeof args.filter.priority === 'string') {
    // Split comma-separated string into array
    priorities = args.filter.priority.split(',').map(p => p.trim().toUpperCase());
  } else {
    priorities = [];
  }
  
  // Validate priorities
  const validPriorities = priorities.filter(p => 
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p)
  );
  
  if (validPriorities.length === 1) {
    tasksQuery = tasksQuery.eq('priority', validPriorities[0]);
  } else if (validPriorities.length > 1) {
    tasksQuery = tasksQuery.in('priority', validPriorities);
  }
}
```

### 3. Update React Agent (react-agent/index.ts ~293)

Zelfde fix voor de react-agent:

```typescript
// VOOR:
if (params.priority) query = query.eq('priority', params.priority);

// NA:
if (params.priority) {
  const priorities = Array.isArray(params.priority) 
    ? params.priority 
    : params.priority.split(',').map((p: string) => p.trim());
  
  if (priorities.length === 1) {
    query = query.eq('priority', priorities[0]);
  } else {
    query = query.in('priority', priorities);
  }
}
```

---

## Samenvatting Wijzigingen

1. **supabase/functions/ai-chat/index.ts**
   - Regel ~3952-3956: Update tool schema voor priority filter
   - Regel ~5168-5170: Smart priority filter met `.in()` support

2. **supabase/functions/react-agent/index.ts**
   - Regel ~293: Zelfde fix voor react-agent tool

---

## Test Scenarios

Na implementatie:

| Query | Verwacht Resultaat |
|-------|-------------------|
| `priority: "HIGH"` | `.eq('priority', 'HIGH')` |
| `priority: "CRITICAL,HIGH"` | `.in('priority', ['CRITICAL', 'HIGH'])` |
| `priority: ["LOW", "MEDIUM"]` | `.in('priority', ['LOW', 'MEDIUM'])` |
| `priority: "INVALID"` | Geen filter (gefilterd uit) |
