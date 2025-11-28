import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface EmailTemplate {
  title: string;
  subject: string;
  body: string;
  stage: string;
}

interface EmailTemplateSelectorProps {
  pipelineStage: string;
  candidateName: string;
  functieNiveau?: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  // Nieuw stage
  {
    title: "Ontvangstbevestiging",
    subject: "Bevestiging ontvangst sollicitatie",
    body: `Beste {{naam}},

Hartelijk dank voor je sollicitatie voor de functie van {{functie_niveau}}.

We hebben je sollicitatie in goede orde ontvangen en zullen deze zorgvuldig bekijken. Je kunt binnen 3-5 werkdagen een reactie van ons verwachten.

Mocht je vragen hebben, neem dan gerust contact met ons op.

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "nieuw",
  },
  // Screening stage
  {
    title: "Uitnodiging telefonisch kennismakingsgesprek",
    subject: "Uitnodiging kennismakingsgesprek",
    body: `Beste {{naam}},

Naar aanleiding van je sollicitatie willen we graag telefonisch kennismaken.

Zou je beschikbaar zijn voor een gesprek van ongeveer 15-20 minuten? We stellen voor:
- {{datum_optie_1}}
- {{datum_optie_2}}
- {{datum_optie_3}}

Laat ons weten welk moment jou het beste uitkomt, of stel zelf een alternatief voor.

We kijken ernaar uit om met je in gesprek te gaan!

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "screening",
  },
  {
    title: "Verzoek aanvullende informatie",
    subject: "Aanvullende informatie gevraagd",
    body: `Beste {{naam}},

Bedankt voor je sollicitatie. Om je aanmelding compleet te maken, hebben we graag de volgende informatie van je:

- {{ontbrekende_info_1}}
- {{ontbrekende_info_2}}
- {{ontbrekende_info_3}}

Kun je deze gegevens zo spoedig mogelijk aan ons toesturen? Dan kunnen we je sollicitatie verder in behandeling nemen.

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "screening",
  },
  // Interview stage
  {
    title: "Uitnodiging gesprek op locatie",
    subject: "Uitnodiging voor persoonlijk gesprek",
    body: `Beste {{naam}},

We zijn enthousiast over je profiel en nodigen je graag uit voor een persoonlijk gesprek.

**Details:**
- Datum: {{datum_interview}}
- Tijd: {{tijd_interview}}
- Locatie: {{locatie}}
- Contactpersoon: {{naam_recruiter}} ({{telefoon_recruiter}})

We bespreken dan je achtergrond, ervaring en onze samenwerkingsmogelijkheden. Het gesprek duurt ongeveer {{duur_interview}} minuten.

Graag ontvangen we een bevestiging van je aanwezigheid.

We zien je graag!

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "interview",
  },
  {
    title: "Bevestiging interview afspraak",
    subject: "Bevestiging interview {{datum_interview}}",
    body: `Beste {{naam}},

Hierbij bevestigen we onze afspraak:

**Interview details:**
- Datum: {{datum_interview}}
- Tijd: {{tijd_interview}}
- Locatie: {{locatie}}
- Adres: {{adres}}

**Wat neem je mee:**
- Een geldig legitimatiebewijs
- {{extra_documenten}}

**Routebeschrijving:**
{{routebeschrijving}}

Kun je niet op het afgesproken tijdstip? Neem dan zo snel mogelijk contact met ons op via {{telefoon}}.

Tot {{datum_interview}}!

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "interview",
  },
  // Goedgekeurd stage
  {
    title: "Positieve terugkoppeling na gesprek",
    subject: "Vervolgstap na ons gesprek",
    body: `Beste {{naam}},

Bedankt voor het prettige gesprek van afgelopen {{datum_interview}}. 

We zijn enthousiast over jouw achtergrond en ervaring. We zien graag mogelijkheden voor samenwerking en willen de volgende stap zetten.

**Vervolgacties:**
- {{actie_1}}
- {{actie_2}}
- {{actie_3}}

We nemen binnen {{aantal_dagen}} werkdagen contact met je op om de vervolgstappen te bespreken.

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "goedgekeurd",
  },
  {
    title: "Contract/opdrachtbevestiging voorbereiding",
    subject: "Voorbereiding contractafspraken",
    body: `Beste {{naam}},

Fijn dat we tot samenwerking gaan komen!

Om de contractzaken te regelen, hebben we de volgende gegevens van je nodig:

**Voor ZZP/Eenmanszaak:**
- KvK-nummer
- BTW-nummer (indien van toepassing)
- Rekeningnummer (IBAN)
- Kopie identiteitsbewijs

**Algemeen:**
- Gewenst uurtarief
- Beschikbaarheid per week
- {{extra_info}}

Kun je deze gegevens aanleveren? Dan kunnen we de contractafspraken verder voorbereiden.

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "goedgekeurd",
  },
  // Geplaatst stage
  {
    title: "Welkom bij de organisatie",
    subject: "Welkom bij {{klant_naam}}",
    body: `Beste {{naam}},

Van harte welkom! We zijn blij dat je bij {{klant_naam}} aan de slag gaat als {{functie_niveau}}.

**Startdetails:**
- Startdatum: {{startdatum}}
- Locatie: {{locatie_klant}}
- Contactpersoon klant: {{contactpersoon_klant}} ({{telefoon_klant}})

**Voor je eerste werkdag:**
- Meld je om {{starttijd}} bij de receptie
- Neem een geldig legitimatiebewijs mee
- {{extra_voorbereidingen}}

**Jouw contactpersoon bij {{bureau}}:**
- {{naam_recruiter}}
- {{telefoon_recruiter}}
- {{email_recruiter}}

Succes met je nieuwe opdracht! We blijven graag in contact.

Met vriendelijke groet,
{{naam_recruiter}}
{{bureau}}`,
    stage: "geplaatst",
  },
];

export function EmailTemplateSelector({ 
  pipelineStage, 
  candidateName,
  functieNiveau 
}: EmailTemplateSelectorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const templates = EMAIL_TEMPLATES.filter(t => t.stage === pipelineStage);

  const copyToClipboard = async (template: EmailTemplate) => {
    const personalized = `Onderwerp: ${template.subject}\n\n${template.body}`
      .replace(/{{naam}}/g, candidateName)
      .replace(/{{functie_niveau}}/g, functieNiveau || "[Functieniveau]");

    try {
      await navigator.clipboard.writeText(personalized);
      setCopiedId(template.title);
      toast.success("Email template gekopieerd naar klembord");
      
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error("Kon niet kopiëren naar klembord");
    }
  };

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Email Templates</h3>
        <Badge variant="outline" className="text-xs">
          {templates.length} beschikbaar
        </Badge>
      </div>

      <div className="grid gap-3">
        {templates.map((template) => (
          <Card key={template.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">
                    {template.title}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    <span className="font-medium">Onderwerp:</span> {template.subject}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(template)}
                  className="ml-2"
                >
                  {copiedId === template.title ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-600" />
                      Gekopieerd
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Kopieer
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 max-h-[120px] overflow-y-auto whitespace-pre-line">
                {template.body
                  .replace(/{{naam}}/g, candidateName)
                  .replace(/{{functie_niveau}}/g, functieNiveau || "[Functieniveau]")
                  .split('\n')
                  .slice(0, 6)
                  .join('\n')}
                {template.body.split('\n').length > 6 && '\n...'}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
