
# Fix: ExtractedDataPreview Scrollbaar Maken met Sticky Buttons

## 1. Probleem Samenvatting

| Aspect | Huidige Status |
|--------|---------------|
| **Scrollable content** | Geen `overflow-y-auto` of `max-height` |
| **Button positie** | Inline in content, verdwijnt bij veel data |
| **Structuur** | Flat layout zonder flex container |
| **Gevolg** | Gebruiker kan niet alle data controleren |

## 2. Huidige Layout Structuur

```text
<Card>
  <CardHeader> (header met titel)
  <CardContent className="space-y-4"> (GEEN scroll, GEEN max-height)
    - Basic Info (5 velden)
    - Participants sectie
    - Agenda sectie  
    - Decisions sectie
    - Summary sectie
    - Warning sectie
    - Buttons (NIET sticky - verdwijnt onder fold)
  </CardContent>
</Card>
```

## 3. Gewenste Layout Structuur

```text
<Card className="flex flex-col max-h-[60vh]">
  <CardHeader> (header met titel - fixed)
  <CardContent className="flex flex-col min-h-0 flex-1 p-0">
    
    <!-- Scrollable content area -->
    <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
      - Basic Info
      - Participants sectie
      - Agenda sectie  
      - Decisions sectie
      - Summary sectie
      - Warning sectie
    </div>
    
    <!-- Sticky buttons - altijd zichtbaar -->
    <div className="shrink-0 border-t px-6 py-4 bg-background">
      [Negeren] [Toepassen]
    </div>
    
  </CardContent>
</Card>
```

## 4. Technische Wijzigingen

### Bestand: `src/components/notulen/ExtractedDataPreview.tsx`

**Wijziging 1**: Card container met max-height en flex layout (regel 54)
```typescript
// Huidige code:
<Card className="border-primary/50">

// Nieuwe code:
<Card className="border-primary/50 flex flex-col max-h-[60vh]">
```

**Wijziging 2**: CardContent als flex container (regel 67)
```typescript
// Huidige code:
<CardContent className="space-y-4">

// Nieuwe code:
<CardContent className="flex flex-col min-h-0 flex-1 p-0">
```

**Wijziging 3**: Wrap content in scrollable div (na regel 67, voor Basic Info)
```typescript
{/* Scrollable content area */}
<div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
  {/* Basic Info */}
  <div className="space-y-1">
    ... alle FieldRow componenten
  </div>

  {/* Participants */}
  ...

  {/* Agenda */}
  ...

  {/* Decisions */}
  ...

  {/* Summary */}
  ...

  {/* Low confidence warning */}
  ...
</div>
```

**Wijziging 4**: Sticky button bar (vervang huidige buttons sectie, regel 166-185)
```typescript
{/* Sticky button bar - altijd zichtbaar */}
<div className="shrink-0 border-t px-6 py-4 bg-background">
  <div className="flex gap-2">
    <Button 
      variant="outline" 
      size="sm" 
      onClick={onCancel}
      disabled={isApplying}
    >
      <X className="h-3.5 w-3.5 mr-1" />
      Negeren
    </Button>
    <Button 
      size="sm" 
      onClick={onApply}
      disabled={isApplying}
    >
      <Check className="h-3.5 w-3.5 mr-1" />
      Toepassen
    </Button>
  </div>
</div>
```

## 5. Volledige Nieuwe Component Structuur

```tsx
export function ExtractedDataPreview({ data, onApply, onCancel, isApplying }: Props) {
  const overallConfidence = data.confidence_scores?.overall || 0;
  
  return (
    <Card className="border-primary/50 flex flex-col max-h-[60vh]">
      {/* Fixed header */}
      <CardHeader className="pb-3 shrink-0">
        ...titel en overall confidence...
      </CardHeader>
      
      <CardContent className="flex flex-col min-h-0 flex-1 p-0">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {/* Basic Info */}
          {/* Participants */}
          {/* Agenda */}
          {/* Decisions */}
          {/* Summary */}
          {/* Warning */}
        </div>
        
        {/* Sticky buttons */}
        <div className="shrink-0 border-t px-6 py-4 bg-background">
          <div className="flex gap-2">
            <Button variant="outline" ...>Negeren</Button>
            <Button ...>Toepassen</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

## 6. CSS Uitleg

| Class | Functie |
|-------|---------|
| `max-h-[60vh]` | Beperkt card hoogte tot 60% van viewport |
| `flex flex-col` | Verticale flex layout |
| `min-h-0` | Essentieel voor flexbox scrolling (voorkomt overflow) |
| `flex-1` | Neemt beschikbare ruimte |
| `overflow-y-auto` | Toont scrollbar wanneer nodig |
| `shrink-0` | Voorkomt dat element krimpt (buttons blijven zichtbaar) |
| `border-t` | Visuele scheiding tussen content en buttons |

## 7. Acceptatie Criteria

| Criterium | Verificatie |
|-----------|-------------|
| Content scrollt bij veel data | Visuele test met 23 beslissingen |
| Alle deelnemers bereikbaar | Scroll naar bottom |
| Alle agenda items bereikbaar | Scroll door lijst |
| Alle beslissingen bereikbaar | Scroll naar #23 |
| Buttons altijd zichtbaar | Check bij scroll |
| Smooth scroll | Test scroll behavior |
| Mobile responsive | Check op 375px breed |
| Geen console errors | Browser DevTools |

## 8. Implementatie Volgorde

| Stap | Wijziging |
|------|-----------|
| 1 | Update Card className met flex en max-height |
| 2 | Update CardContent className |
| 3 | Wrap content sections in scrollable div |
| 4 | Move buttons to sticky footer div |
| 5 | Test met veel data |

## 9. Bestandsoverzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/notulen/ExtractedDataPreview.tsx` | Layout restructure (~20 regels aangepast) |

Geen andere bestanden hoeven gewijzigd te worden.
