import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Mail,
  Calendar,
} from "lucide-react";

import { useHerinneringen } from "@/hooks/facturatie";
import type { FactuurStatus, HerinneringNiveau } from "@/types/facturatie";
import { HerinneringVersturenDialog } from "./HerinneringVersturenDialog";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

const HERINNERING_INFO: Record<HerinneringNiveau, {
  label: string;
  toon: string;
  color: string;
  dagen: number;
}> = {
  1: {
    label: "Eerste herinnering",
    toon: "Vriendelijk",
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    dagen: 14,
  },
  2: {
    label: "Tweede herinnering",
    toon: "Formeel",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    dagen: 28,
  },
  3: {
    label: "Laatste herinnering",
    toon: "Escalatie",
    color: "bg-red-100 text-red-700 border-red-200",
    dagen: 42,
  },
};

interface HerinneringenPanelProps {
  factuurId: string;
  factuurNummer: string;
  factuurStatus: FactuurStatus;
  openstaandBedrag: number;
  opdrachtgeverEmail: string | null;
  vervaldatum: string;
}

export function HerinneringenPanel({
  factuurId,
  factuurNummer,
  factuurStatus,
  openstaandBedrag,
  opdrachtgeverEmail,
  vervaldatum,
}: HerinneringenPanelProps) {
  const { data: herinneringen, isLoading } = useHerinneringen({ factuurId });
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [selectedNiveau, setSelectedNiveau] = useState<HerinneringNiveau | null>(null);

  const sentNiveaus = new Set(herinneringen?.map((h) => h.niveau) || []);

  const canSendReminder = (niveau: HerinneringNiveau): boolean => {
    if (sentNiveaus.has(niveau)) return false;
    if (["BETAALD", "AFGEBOEKT", "CONCEPT", "DEFINITIEF"].includes(factuurStatus)) return false;
    if (niveau === 2 && !sentNiveaus.has(1)) return false;
    if (niveau === 3 && !sentNiveaus.has(2)) return false;
    return true;
  };

  const daysOverdue = Math.floor(
    (new Date().getTime() - new Date(vervaldatum).getTime()) / (1000 * 60 * 60 * 24)
  );

  const handleSendClick = (niveau: HerinneringNiveau) => {
    setSelectedNiveau(niveau);
    setShowSendDialog(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const isOverdue = daysOverdue > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Betalingsherinneringen
          </CardTitle>
          {isOverdue && openstaandBedrag > 0 && (
            <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {daysOverdue} dagen over vervaldatum
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {([1, 2, 3] as HerinneringNiveau[]).map((niveau) => {
            const info = HERINNERING_INFO[niveau];
            const sent = herinneringen?.find((h) => h.niveau === niveau);
            const canSend = canSendReminder(niveau);

            return (
              <div
                key={niveau}
                className={`border rounded-lg p-4 ${sent ? "bg-muted/30" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={info.color}>
                        Niveau {niveau}
                      </Badge>
                      <span className="font-medium">{info.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Toon: {info.toon} • Na {info.dagen} dagen
                    </p>
                  </div>

                  {sent ? (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verstuurd
                    </Badge>
                  ) : canSend ? (
                    <Button size="sm" variant="outline" onClick={() => handleSendClick(niveau)}>
                      <Send className="h-3 w-3 mr-1" />
                      Versturen
                    </Button>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      Wachten
                    </Badge>
                  )}
                </div>

                {sent && (
                  <div className="mt-3 pt-3 border-t space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(sent.verzonden_op), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {sent.verzonden_naar}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Openstaand op dat moment: {formatCurrency(sent.openstaand_bedrag)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {!opdrachtgeverEmail && (
            <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">Geen e-mailadres bekend</p>
                  <p className="text-sm text-yellow-700">
                    Voeg een factuur e-mailadres toe bij de opdrachtgever om herinneringen te kunnen versturen.
                  </p>
                </div>
              </div>
            </div>
          )}

          {["BETAALD", "AFGEBOEKT"].includes(factuurStatus) && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground text-center">
                Herinneringen niet beschikbaar voor facturen met status "{factuurStatus.toLowerCase()}".
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedNiveau && (
        <HerinneringVersturenDialog
          open={showSendDialog}
          onOpenChange={(open) => {
            setShowSendDialog(open);
            if (!open) setSelectedNiveau(null);
          }}
          factuurId={factuurId}
          factuurNummer={factuurNummer}
          niveau={selectedNiveau}
          openstaandBedrag={openstaandBedrag}
          defaultEmail={opdrachtgeverEmail || ""}
        />
      )}
    </>
  );
}
