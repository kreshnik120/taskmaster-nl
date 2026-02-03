import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  Mail,
  AlertTriangle,
  Info,
} from "lucide-react";

import { useSendHerinnering } from "@/hooks/facturatie";
import type { HerinneringNiveau } from "@/types/facturatie";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

const EMAIL_TEMPLATES: Record<HerinneringNiveau, {
  subject: string;
  intro: string;
  tone: string;
  toneColor: string;
}> = {
  1: {
    subject: "Herinnering: Factuur {nummer} nog niet ontvangen",
    intro: "Graag willen wij u vriendelijk herinneren aan onderstaande openstaande factuur. Mogelijk is deze aan uw aandacht ontsnapt.",
    tone: "Vriendelijk",
    toneColor: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  2: {
    subject: "Tweede herinnering: Factuur {nummer} - betaling nog niet ontvangen",
    intro: "Ondanks onze eerdere herinnering hebben wij nog geen betaling ontvangen voor onderstaande factuur. Wij verzoeken u vriendelijk doch dringend om deze alsnog te voldoen.",
    tone: "Formeel",
    toneColor: "bg-orange-100 text-orange-700 border-orange-200",
  },
  3: {
    subject: "LAATSTE HERINNERING: Factuur {nummer} - directe actie vereist",
    intro: "Ondanks meerdere herinneringen is de betaling van onderstaande factuur nog niet door ons ontvangen. Indien wij binnen 7 dagen geen betaling ontvangen, zijn wij genoodzaakt verdere stappen te ondernemen.",
    tone: "Escalatie",
    toneColor: "bg-red-100 text-red-700 border-red-200",
  },
};

interface HerinneringVersturenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factuurId: string;
  factuurNummer: string;
  niveau: HerinneringNiveau;
  openstaandBedrag: number;
  defaultEmail: string;
}

export function HerinneringVersturenDialog({
  open,
  onOpenChange,
  factuurId,
  factuurNummer,
  niveau,
  openstaandBedrag,
  defaultEmail,
}: HerinneringVersturenDialogProps) {
  const { sendHerinnering, isSending } = useSendHerinnering();

  const [email, setEmail] = useState(defaultEmail);
  const [ccEmail, setCcEmail] = useState("");

  const template = EMAIL_TEMPLATES[niveau];

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
      setCcEmail("");
    }
  }, [open, defaultEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      await sendHerinnering({
        factuurId,
        niveau,
        email,
        openstaandBedrag,
      });
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  const isValidEmail = (emailValue: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  };

  const canSubmit = email && isValidEmail(email) && !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Herinnering niveau {niveau} versturen
          </DialogTitle>
          <DialogDescription>
            Factuur {factuurNummer}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className={template.toneColor}>
                {template.tone}
              </Badge>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Openstaand bedrag</p>
                <p className="font-semibold">{formatCurrency(openstaandBedrag)}</p>
              </div>
            </div>

            {niveau === 3 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Laatste herinnering</AlertTitle>
                <AlertDescription>
                  Dit is de laatste herinnering. De toon is formeel en vermeldt mogelijke vervolgstappen.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">E-mail preview</Label>
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-sm font-medium">
                  Onderwerp: {template.subject.replace("{nummer}", factuurNummer)}
                </p>
                <Separator />
                <p className="text-sm text-muted-foreground">{template.intro}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Verzenden naar *
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="factuur@bedrijf.nl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {email && !isValidEmail(email) && (
                <p className="text-xs text-destructive">Voer een geldig e-mailadres in</p>
              )}
            </div>

            {niveau === 3 && (
              <div className="space-y-2">
                <Label htmlFor="cc-email" className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  CC (optioneel - bijv. manager)
                </Label>
                <Input
                  id="cc-email"
                  type="email"
                  placeholder="manager@bedrijf.nl"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                />
              </div>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Na het versturen wordt de factuurstatus automatisch bijgewerkt naar "Herinnering {niveau}".
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Versturen...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Herinnering versturen
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
