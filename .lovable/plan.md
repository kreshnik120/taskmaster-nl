

# Diagnose: Waarom minder diensten in het systeem dan in Bendy

## Root Cause gevonden

Het probleem zit **niet** in open→assigned status-updates. Het zit in **52 diensten die onterecht op "geannuleerd" staan**.

### Bewijs uit de data:
- **Bendy** zegt: 194 ingepland + 6 open = 200 diensten, 1373.25 uur
- **Systeem** zegt: 187 ingepland + 42 open + **54 geannuleerd** = 283 diensten, 1314.25 uur
- Van die 54 geannuleerde diensten staan **52 in Bendy nog als "open"** (niet cancelled)
- Slechts 2 zijn in Bendy daadwerkelijk "closed"

### Hoe is dit gebeurd?
Een **oude stale cleanup** (nu uitgeschakeld) heeft op **23 maart om 13:00** in één bulk 32 diensten op "geannuleerd" gezet. Eerdere runs op 13 en 16 maart deden hetzelfde met nog eens 21 diensten. Deze diensten waren in Bendy gewoon nog open/assigned.

### Waarom herstelt de sync dit niet?
De code op **regel 236-243** blokkeert expliciet status-updates van `geannuleerd` naar iets anders — behalve als `source === 'assigned'`. Dus:
- `geannuleerd` → `open` (van open endpoint): **GEBLOKKEERD**
- `geannuleerd` → `volledig_bezet` (van assigned endpoint): **WEL TOEGESTAAN**

Maar deze 52 diensten staan in Bendy als "open", dus ze komen van het **open endpoint** en worden geblokkeerd.

## Oplossing

### Code-wijziging in `bendy-sync-requisitions.ts` (regel 236-243)

**Huidige logica:**
```typescript
if (existingDienst.status === 'geannuleerd' && source === 'assigned') {
  updateData.status = newStatus;  // alleen assigned mag herstellen
} else if (existingDienst.status !== 'geannuleerd') {
  updateData.status = newStatus;  // geannuleerd wordt nooit overschreven door open
}
```

**Nieuwe logica:**
```typescript
// Bendy is leidend: als een dienst in Bendy bestaat (open of assigned),
// mag de status altijd hersteld worden — ook vanuit geannuleerd
if (existingDienst.status !== 'geannuleerd') {
  updateData.status = newStatus;
} else {
  // geannuleerd → herstel als Bendy het record nog kent
  updateData.status = newStatus;
}
```

Vereenvoudigd: **verwijder de geannuleerd-blokkade volledig**. Als een dienst in Bendy op het open of assigned endpoint staat, is het niet geannuleerd — Bendy is leidend. De enige status die niet overschreven mag worden is `voltooid` (dat is al afgehandeld op regel 237).

### Vereenvoudigde wijziging (regels 235-244):
```typescript
if (existingDienst.status !== newStatus &&
    existingDienst.status !== 'voltooid') {
  updateData.status = newStatus;
}
```

Dit vervangt de complexe if/else boom met een simpele regel: alles behalve `voltooid` mag overschreven worden door Bendy.

### Verwacht resultaat na volgende sync-run
- 52 diensten gaan van `geannuleerd` → `open` (ze staan op Bendy's open endpoint)
- Als sommige inmiddels ook op het assigned endpoint staan, worden ze `volledig_bezet`
- Het uren-verschil van ~59 uur wordt (grotendeels) opgelost
- Het verschil van 194 vs 187 ingeplande diensten wordt kleiner

### Geen andere wijzigingen
- Database schema: ongewijzigd
- Frontend: ongewijzigd
- pg_cron: ongewijzigd
- Andere sync-modules: ongewijzigd

