

# Fix: Edge Function Deployment Error

## Probleem

De edge function `cleanup-low-stability-knowledge` kan niet worden gedeployed met de fout: "The server is temporarily unavailable due to an internal error."

## Oorzaak

De `deno.lock` file heeft **versie 5**, wat niet compatibel is met de edge-runtime. Dit is een bekende issue waarbij nieuwere Deno lockfile formaten niet worden ondersteund door Supabase edge-runtime.

## Oplossing

Verwijder of hernoem de `deno.lock` file. De edge-runtime zal automatisch dependencies opnieuw resolven bij deployment.

## Implementatie

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| DELETE | `deno.lock` | Verwijder incompatibele lockfile |

Na het verwijderen zal de volgende deployment automatisch slagen.

## Verificatie

Na de fix worden alle edge functions opnieuw gedeployed. Controleer dat `cleanup-low-stability-knowledge` succesvol is.

