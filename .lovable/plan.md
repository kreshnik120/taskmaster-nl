

# Taak Acceptatie Zichtbaar Maken

## Probleem
De "Accepteren" actie zit verstopt in een dropdown menu (drie puntjes) dat pas verschijnt als je over een taakkaart hovert. Leonie ziet wel de badge "Wacht op acceptatie" maar kan de actie niet vinden. Op mobiel is hover helemaal niet mogelijk.

## Oplossing
Een duidelijke "Accepteren" knop direct op de TaskCard tonen wanneer een taak wacht op acceptatie, zodat het meteen zichtbaar en klikbaar is -- zonder in een menu te hoeven zoeken.

## Technische wijzigingen

### Bestand: `src/components/TaskCard.tsx`

**Wat**: Een `onAccept` callback prop toevoegen en een prominente "Accepteren" knop direct op de kaart renderen wanneer `isPendingAcceptance(task)` true is.

- Nieuwe prop `onAccept?: (taskId: string) => void` toevoegen aan `TaskCardProps`
- Direct onder de bestaande "Wacht op acceptatie" badge een compacte groene "Accepteren" knop plaatsen
- De knop stopt event propagation zodat de kaart niet opent bij klikken
- Knop alleen tonen als `onAccept` is meegegeven (zodat het kanban-bord van de manager geen accept-knop toont)

### Bestand: `src/components/dashboard/MyTasksFlowSection.tsx`

**Wat**: De `onAccept` prop doorgeven aan TaskCard zodat de knop werkt.

- Bij de `<TaskCard>` render (rond regel 823) de bestaande `handleAcceptTask` functie doorgeven als `onAccept` prop
- De dropdown "Accepteren" optie blijft bestaan als alternatief

### Resultaat
- Leonie ziet direct een groene "Accepteren" knop op haar taakkaarten
- Werkt op zowel desktop als mobiel (geen hover nodig)
- Bestaande dropdown-optie blijft als fallback
- Geen database wijzigingen nodig

