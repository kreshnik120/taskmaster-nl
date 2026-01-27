
# Fase 7D: Intelligent Task Creation - Enterprise Niveau

## Overzicht

Deze fase breidt de Notulen Assistent uit met enterprise-niveau taken creatie:
- Rijke AI-gegenereerde context per actiepunt
- Slimme assignee matching met organisatie-medewerkers
- Voorgestelde actieplannen en suggesties
- Volledige traceerbaarheid van bron naar taak

---

## Stap 1: Database Uitbreiding

**Bestand:** Database migratie

**Wijzigingen:**
- Voeg `ai_context` JSONB kolom toe aan `tasks` tabel
- Documentatie comment toevoegen

```sql
ALTER TABLE tasks
ADD COLUMN ai_context JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tasks.ai_context IS
'AI-gegenereerde context: actieplan, suggestie, betrokkenen, bron info';
```

**ai_context Structuur:**
```json
{
  "onderwerp": "string",
  "doelgroep": "string",
  "actie_type": "Communicatie|Administratie|Planning|...",
  "betrokkenen": [
    {"naam": "string", "rol": "string?", "relatie": "assignee|uitleg_ontvanger|stakeholder"}
  ],
  "externe_partij": {"naam": "string", "type": "klant|zzper|locatie|leverancier"},
  "actieplan": ["string", "string", ...],
  "suggestie": "string",
  "bron": {
    "notule_titel": "string",
    "notule_datum": "string",
    "citaat": "string",
    "meeting_minute_id": "uuid"
  },
  "ai_metadata": {
    "confidence": 0.0-1.0,
    "classificatie": "TAAK|IDEE|INFORMATIE",
    "extraction_version": "7D"
  }
}
```

---

## Stap 2: Interface Uitbreiding

**Bestand:** `src/hooks/useMeetingMinutes.ts`

**Wijzigingen:**
Breid `ActionItem` interface uit met Fase 7D velden:

```typescript
export interface ActionItem {
  // Bestaand (Fase 7C)
  action: string;
  assignee: string | null;
  deadline: string | null;
  classification?: 'TAAK' | 'IDEE' | 'INFORMATIE';
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  source_quote?: string;
  confidence?: number;
  
  // NIEUW - Fase 7D
  onderwerp?: string;
  doelgroep?: string;
  actie_type?: 'Communicatie' | 'Administratie' | 'Planning' | 'Onderzoek' | 'Beslissing' | 'Overig';
  achtergrond?: string;
  betrokkenen?: Array<{
    naam: string;
    rol?: string;
    relatie: 'assignee' | 'uitleg_ontvanger' | 'stakeholder';
  }>;
  externe_partij?: {
    naam: string;
    type: 'klant' | 'zzper' | 'locatie' | 'leverancier';
  };
  actieplan?: string[];
  suggestie?: string;
}
```

**Bestand:** `src/hooks/notulen/useAIExtractMeeting.ts`

**Wijzigingen:**
Synchroniseer interface met de uitgebreide `ActionItem`

---

## Stap 3: AI Prompt Uitbreiding

**Bestand:** `supabase/functions/ai-extract-meeting-minute/index.ts`

**Wijzigingen:**
1. Update `ExtractedMeetingData` interface met nieuwe velden
2. Breid multimodal prompt uit met uitgebreide extractie instructies
3. Breid system prompt uit met dezelfde instructies
4. Update normalisatie functies om nieuwe velden te verwerken

**Uitgebreide AI Instructies:**
```text
VOOR ELKE ACTION ITEM, EXTRAHEER:

1. BASIS
   - action: Wat moet er gebeuren?
   - assignee: Wie is verantwoordelijk? (alleen naam, NIET "team")
   - deadline: Wanneer?

2. CONTEXT
   - onderwerp: Waar gaat dit over?
   - doelgroep: Voor wie is dit?
   - actie_type: "Communicatie" | "Administratie" | "Planning" | etc.
   - achtergrond: Waarom moet dit gebeuren?

3. BETROKKENEN
   - Lijst van namen die betrokken zijn
   - Per naam: rol indien bekend
   - Onderscheid: assignee vs uitleg_ontvanger vs stakeholder

4. EXTERNE PARTIJEN
   - Markeer klanten (IrisZorg, Bloezem, etc.)
   - Markeer ZZP'ers
   - Markeer locaties

5. ACTIEPLAN
   - Genereer 2-4 concrete stappen
   - Begin elke stap met werkwoord
   - Wees specifiek

6. SUGGESTIE
   - Eén concrete zin die de assignee direct kan gebruiken

CLASSIFICATIE REGELS:
- "team" → Interpreteer als: alle ABCITO.IO medewerkers
- Als assignee "team" is → GEEN assignee, wel in betrokkenen
```

---

## Stap 4: Assignee Matching Functie

**Bestand:** `src/hooks/notulen/useCreateTasksFromItems.ts`

**Nieuwe functie toevoegen:**

```typescript
interface AssigneeMatch {
  userId: string | null;
  matched: boolean;
  warning?: string;
}

async function matchAssignee(
  naam: string | null,
  orgId: string
): Promise<AssigneeMatch> {
  if (!naam) return { userId: null, matched: false };
  
  // "team" kan niet gekoppeld worden
  if (naam.toLowerCase() === 'team') {
    return {
      userId: null,
      matched: false,
      warning: '"Team" kan niet als assignee gekoppeld worden'
    };
  }
  
  // Zoek in profiles via user_organizations
  const { data: orgUsers } = await supabase
    .from('user_organizations')
    .select('user_id')
    .eq('org_id', orgId);
    
  const userIds = orgUsers?.map(u => u.user_id).filter(Boolean) as string[];
  
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', userIds)
    .ilike('name', `%${naam}%`);
  
  if (!profiles?.length) {
    return {
      userId: null,
      matched: false,
      warning: `"${naam}" niet gevonden - mogelijk externe partij`
    };
  }
  
  if (profiles.length === 1) {
    return { userId: profiles[0].id, matched: true };
  }
  
  return {
    userId: profiles[0].id,
    matched: true,
    warning: `Meerdere matches voor "${naam}"`
  };
}
```

---

## Stap 5: Rijke Beschrijving Generator

**Bestand:** `src/hooks/notulen/useCreateTasksFromItems.ts`

**Nieuwe functie:**

```typescript
function generateTaskDescription(
  item: ActionItem, 
  meetingMinute: MeetingMinute
): string {
  const lines: string[] = [];

  // Opdracht sectie
  lines.push('📋 OPDRACHT');
  lines.push('─'.repeat(40));
  lines.push(item.achtergrond || item.action);
  lines.push('');
  
  // Details
  if (item.onderwerp) lines.push(`ONDERWERP: ${item.onderwerp}`);
  if (item.doelgroep) lines.push(`DOELGROEP: ${item.doelgroep}`);
  if (item.actie_type) lines.push(`ACTIE TYPE: ${item.actie_type}`);
  lines.push('');
  
  // Betrokkenen
  if (item.betrokkenen?.length) {
    lines.push('👥 BETROKKENEN');
    lines.push('─'.repeat(40));
    item.betrokkenen.forEach(b => {
      const rolStr = b.rol ? ` (${b.rol})` : '';
      const relatieStr = b.relatie === 'uitleg_ontvanger' ? ' - ontvangt uitleg' : '';
      lines.push(`• ${b.naam}${rolStr}${relatieStr}`);
    });
    lines.push('');
  }
  
  // Externe partij
  if (item.externe_partij) {
    lines.push(`🏢 BETREFT: ${item.externe_partij.naam} (${item.externe_partij.type})`);
    lines.push('');
  }
  
  // Actieplan
  if (item.actieplan?.length) {
    lines.push('🎯 VOORGESTELD ACTIEPLAN');
    lines.push('─'.repeat(40));
    item.actieplan.forEach((stap, i) => {
      lines.push(`${i + 1}. ☐ ${stap}`);
    });
    lines.push('');
  }
  
  // Suggestie
  if (item.suggestie) {
    lines.push('💡 SUGGESTIE');
    lines.push('─'.repeat(40));
    lines.push(`"${item.suggestie}"`);
    lines.push('');
  }
  
  // Bron
  lines.push('📄 BRON');
  lines.push('─'.repeat(40));
  lines.push(`Notule: ${meetingMinute.tasks?.title || 'Onbekend'}`);
  if (meetingMinute.tasks?.start_at) {
    lines.push(`Datum: ${new Date(meetingMinute.tasks.start_at).toLocaleDateString('nl-NL')}`);
  }
  if (item.source_quote) {
    lines.push(`Citaat: "${item.source_quote}"`);
  }
  lines.push('');
  
  // AI Metadata
  lines.push('🤖 AI INFO');
  lines.push('─'.repeat(40));
  lines.push(`Confidence: ${Math.round((item.confidence || 0) * 100)}%`);
  lines.push(`Classificatie: ${item.classification || 'TAAK'}`);
  
  return lines.join('\n');
}
```

---

## Stap 6: Update Task Insert

**Bestand:** `src/hooks/notulen/useCreateTasksFromItems.ts`

**Wijzigingen:**

Pas de `createTasks` functie aan om:
1. Meeting minute data op te halen voor beschrijving generatie
2. Assignee matching uit te voeren
3. Rijke beschrijving te genereren
4. `ai_context` JSONB op te slaan
5. Eventuele assignee warnings te tracken

```typescript
const createTasks = async (
  items: ActionItem[],
  meetingMinuteId: string
): Promise<CreateTasksResult> => {
  // ... existing setup ...
  
  // Haal meeting minute op voor context
  const { data: meetingMinute } = await supabase
    .from('meeting_minutes')
    .select('*, tasks!meeting_minutes_task_id_fkey(id, title, start_at)')
    .eq('id', meetingMinuteId)
    .single();
  
  // Process items met assignee matching
  const processedItems = await Promise.all(items.map(async (item) => {
    const assigneeMatch = await matchAssignee(item.assignee, userOrg.org_id);
    return { item, assigneeMatch };
  }));
  
  // Build tasks met rijke context
  const tasksToInsert = processedItems.map(({ item, assigneeMatch }) => ({
    org_id: userOrg.org_id,
    title: item.action.substring(0, 100),
    description: generateTaskDescription(item, meetingMinute),
    priority: mapPriority(item.urgency),
    due_at: item.deadline ? new Date(item.deadline).toISOString() : null,
    assignee_id: assigneeMatch.userId,
    category: 'action_item',
    source_meeting_minute_id: meetingMinuteId,
    ai_context: {
      onderwerp: item.onderwerp || null,
      doelgroep: item.doelgroep || null,
      actie_type: item.actie_type || null,
      betrokkenen: item.betrokkenen || [],
      externe_partij: item.externe_partij || null,
      actieplan: item.actieplan || [],
      suggestie: item.suggestie || null,
      bron: {
        notule_titel: meetingMinute?.tasks?.title || null,
        notule_datum: meetingMinute?.tasks?.start_at || null,
        citaat: item.source_quote || null,
        meeting_minute_id: meetingMinuteId
      },
      ai_metadata: {
        confidence: item.confidence || 0,
        classificatie: item.classification || 'TAAK',
        extraction_version: '7D'
      }
    }
  }));
  
  // ... insert and return ...
};
```

---

## Stap 7: UI Update - Uitgebreide Item Weergave

**Bestand:** `src/components/notulen/NotulenAssistent.tsx`

**Wijzigingen:**

1. **Imports toevoegen:**
   - `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
   - `AlertTriangle` icon
   - `useOrgMembers` hook
   - `useQuery` voor team members

2. **State voor assignee overrides:**
```typescript
const [assigneeOverrides, setAssigneeOverrides] = useState<Map<number, string>>(new Map());
```

3. **Team members ophalen:**
```typescript
const { data: teamMembers = [] } = useOrgMembers();
```

4. **ActionItemRow component uitbreiden:**
   - Toon onderwerp en doelgroep
   - Toon betrokkenen met badges
   - Toon externe partij waarschuwing (amber)
   - Toon actieplan preview (eerste 2 stappen)
   - Toon suggestie met 💡 icoon
   - Assignee matching warnings met dropdown voor handmatige selectie

5. **Helper functie voor assignee check:**
```typescript
const isAssigneeInSystem = (naam: string | null): boolean => {
  if (!naam) return true;
  if (naam.toLowerCase() === 'team') return false;
  return teamMembers.some(m => 
    m.name.toLowerCase().includes(naam.toLowerCase())
  );
};
```

---

## Stap 8: Passing MeetingMinute aan createTasks

**Bestand:** `src/hooks/notulen/useCreateTasksFromItems.ts`

**Update interface:**

```typescript
const createTasks = async (
  items: ActionItem[],
  meetingMinuteId: string,
  meetingMinute?: MeetingMinute  // Optioneel meegeven vanuit UI
): Promise<CreateTasksResult>
```

---

## Bestandswijzigingen Overzicht

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| Database migratie | CREATE | `ai_context` JSONB kolom |
| `useMeetingMinutes.ts` | UPDATE | Uitgebreide ActionItem interface |
| `useAIExtractMeeting.ts` | UPDATE | Synchroniseer interface |
| `ai-extract-meeting-minute/index.ts` | UPDATE | Uitgebreide AI prompts + normalisatie |
| `useCreateTasksFromItems.ts` | UPDATE | Assignee matching, beschrijving generator, ai_context |
| `NotulenAssistent.tsx` | UPDATE | Uitgebreide item weergave, warnings, dropdowns |

---

## Verwacht Resultaat

Na implementatie ziet een taak aangemaakt via de Notulen Assistent er zo uit:

```text
TITEL: Uitleg geven over begeleidersdiensten
TOEGEWEZEN AAN: Erik ✓
PRIORITEIT: HIGH

📋 OPDRACHT
────────────────────────────────────────
Erik moet uitleg geven aan het team over hoe
begeleidersdiensten voor IrisZorg uitgezet worden.

ONDERWERP: Begeleidersdiensten uitzetten
DOELGROEP: ABCITO.IO team (CitoZorg + ABCzorg)
ACTIE TYPE: Communicatie

👥 BETROKKENEN
────────────────────────────────────────
• Erik - verantwoordelijk
• Leonie (teamleider) - ontvangt uitleg
• Dilmar (planner) - ontvangt uitleg

🏢 BETREFT: IrisZorg (klant)

🎯 VOORGESTELD ACTIEPLAN
────────────────────────────────────────
1. ☐ Plan meeting met Leonie en Dilmar
2. ☐ Bereid uitleg voor over begeleidersdiensten
3. ☐ Geef uitleg tijdens meeting
4. ☐ Documenteer proces

💡 SUGGESTIE
────────────────────────────────────────
"Plan zo snel mogelijk een meeting met Leonie 
en Dilmar om uit te leggen hoe begeleidersdiensten 
voor IrisZorg uitgezet moeten worden."

📄 BRON
────────────────────────────────────────
Notule: Notulen overleg ZZP 26-01-2026
Datum: 26 januari 2026
Citaat: "IrisZorg: mail uitzendkrachten +
        begeleidersdiensten uitzetten (met uitleg Erik)"

🤖 AI INFO
────────────────────────────────────────
Confidence: 92%
Classificatie: TAAK
```

---

## Technische Notities

1. **Database**: Supabase types worden automatisch geregenereerd na migratie
2. **Backwards Compatibility**: Bestaande taken behouden lege `ai_context`
3. **Assignee Matching**: Werkt via `user_organizations` → `profiles` join
4. **Performance**: Assignee matching is parallel per item
5. **Edge Function Deploy**: Automatisch na code wijziging
