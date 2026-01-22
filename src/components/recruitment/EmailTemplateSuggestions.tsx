import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Mail, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface EmailTemplate {
  title: string;
  subject: string;
  body: string;
  stage: string;
}

interface EmailTemplateSuggestionsProps {
  pipelineStage: string;
  candidateName: string;
  functieNiveau?: string;
}

export function EmailTemplateSuggestions({ 
  pipelineStage, 
  candidateName,
  functieNiveau 
}: EmailTemplateSuggestionsProps) {
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  const getTemplatesForStage = (): EmailTemplate[] => {
    const templates: Record<string, EmailTemplate[]> = {
      nieuw: [
        {
          title: "Ontvangstbevestiging",
          subject: "Bevestiging sollicitatie ontvangen",
          body: `Beste ${candidateName},

Hartelijk dank voor je sollicitatie! We hebben je gegevens in goede orde ontvangen en zullen deze de komende dagen beoordelen.

Je hoort binnen 3 werkdagen van ons.

Met vriendelijke groet,
Het recruitmentteam`,
          stage: "nieuw"
        }
      ],
      screening: [
        {
          title: "Uitnodiging telefonisch gesprek",
          subject: "Uitnodiging telefonisch kennismakingsgesprek",
          body: `Beste ${candidateName},

Je profiel als ${functieNiveau || 'zorgprofessional'} spreekt ons aan! We willen graag telefonisch kennismaken.

Kun je aangeven wanneer het jou uitkomt?

Met vriendelijke groet,
Het recruitmentteam`,
          stage: "screening"
        },
        {
          title: "Verzoek aanvullende informatie",
          subject: "Aanvullende informatie nodig",
          body: `Beste ${candidateName},

Graag ontvangen we nog de volgende gegevens om je sollicitatie compleet te maken:

- [Specificeer welke informatie]

Dit helpt ons om je profiel goed te kunnen beoordelen.

Met vriendelijke groet,
Het recruitmentteam`,
          stage: "screening"
        }
      ],
      interview: [
        {
          title: "Bevestiging interview",
          subject: "Bevestiging interview afspraak",
          body: `Beste ${candidateName},

Hierbij bevestigen we de interview afspraak:

Datum: [DATUM]
Tijd: [TIJD]
Locatie: [LOCATIE / Teams link]

We kijken ernaar uit om je te ontmoeten!

Met vriendelijke groet,
Het recruitmentteam`,
          stage: "interview"
        },
        {
          title: "Reminder interview",
          subject: "Herinnering interview morgen",
          body: `Beste ${candidateName},

Dit is een vriendelijke herinnering voor ons interview morgen:

Tijd: [TIJD]
Locatie: [LOCATIE / Teams link]

Tot morgen!

Met vriendelijke groet,
Het recruitmentteam`,
          stage: "interview"
        }
      ],
      goedgekeurd: [
        {
          title: "Positieve beslissing",
          subject: "Goed nieuws over je sollicitatie!",
          body: `Beste ${candidateName},

Goed nieuws! Na het interview zijn we enthousiast over je profiel en willen we graag met je verder.

We nemen binnenkort contact op voor de vervolgstappen en contractbespreking.

Met vriendelijke groet,
Het recruitmentteam`,
          stage: "goedgekeurd"
        }
      ],
      geplaatst: [
        {
          title: "Welkom bij de organisatie",
          subject: "Welkom bij ABCzorg/CitoZorg!",
          body: `Beste ${candidateName},

Van harte welkom bij ons team! We zijn blij dat je er bent.

Je ontvangt binnenkort:
- Contract en administratieve documenten
- Informatie over je startdatum
- Onboarding planning

Bij vragen kun je altijd contact opnemen.

Met vriendelijke groet,
Het recruitmentteam`,
          stage: "geplaatst"
        }
      ]
    };

    return templates[pipelineStage] || [];
  };

  const copyToClipboard = async (template: EmailTemplate) => {
    const fullEmail = `Onderwerp: ${template.subject}\n\n${template.body}`;
    
    try {
      await navigator.clipboard.writeText(fullEmail);
      setCopiedTemplate(template.title);
      toast.success("Email template gekopieerd");
      
      setTimeout(() => setCopiedTemplate(null), 2000);
    } catch (error) {
      toast.error("Kon niet kopiëren naar clipboard");
    }
  };

  const templates = getTemplatesForStage();

  if (templates.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" />
          Email Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.map((template) => (
          <Card key={template.title} className="border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{template.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Onderwerp: {template.subject}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(template)}
                  className="h-8"
                >
                  {copiedTemplate === template.title ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                      <span className="text-xs">Gekopieerd</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      <span className="text-xs">Kopieer</span>
                    </>
                  )}
                </Button>
              </div>
              
              <div className="p-2 bg-muted/50 rounded text-xs whitespace-pre-line font-mono">
                {template.body}
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
