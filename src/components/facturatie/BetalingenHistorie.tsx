import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  Plus,
} from "lucide-react";

import { useBetalingen, useDeleteBetaling } from "@/hooks/facturatie";
import { BETALING_METHODE_LABELS, type Betaling } from "@/types/facturatie";
import { BetalingBewerkDialog } from "./BetalingBewerkDialog";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

interface BetalingenHistorieProps {
  factuurId: string;
  openstaandBedrag: number;
  totaalBedrag: number;
  onRegisterPayment: () => void;
  canRegisterPayment: boolean;
}

export function BetalingenHistorie({
  factuurId,
  openstaandBedrag,
  totaalBedrag,
  onRegisterPayment,
  canRegisterPayment,
}: BetalingenHistorieProps) {
  const { data: betalingen, isLoading } = useBetalingen({ factuurId });
  const { deleteBetaling, isDeleting } = useDeleteBetaling();

  const [editingBetaling, setEditingBetaling] = useState<Betaling | null>(null);
  const [deletingBetalingId, setDeletingBetalingId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deletingBetalingId) return;
    try {
      await deleteBetaling(deletingBetalingId, factuurId);
      setDeletingBetalingId(null);
    } catch (error) {
      // Error handled by hook
    }
  };

  const totaalBetaald = betalingen?.reduce((sum, b) => sum + b.bedrag, 0) || 0;
  const percentageBetaald = totaalBedrag > 0 ? (totaalBetaald / totaalBedrag) * 100 : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Betalingen
          </CardTitle>
          {canRegisterPayment && (
            <Button size="sm" onClick={onRegisterPayment}>
              <Plus className="h-4 w-4 mr-1" />
              Betaling registreren
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Section */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Voortgang</span>
              <span className="font-medium">
                {formatCurrency(totaalBetaald)} van {formatCurrency(totaalBedrag)} ({Math.round(percentageBetaald)}%)
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${percentageBetaald >= 100 ? "bg-green-500" : "bg-primary"}`}
                style={{ width: `${Math.min(100, percentageBetaald)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Openstaand</span>
              <span className={openstaandBedrag > 0 ? "text-orange-600 font-medium" : "text-green-600 font-medium"}>
                {openstaandBedrag > 0 ? formatCurrency(openstaandBedrag) : "Volledig betaald"}
              </span>
            </div>
          </div>

          {/* Payments Table */}
          {betalingen && betalingen.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Methode</TableHead>
                  <TableHead>Referentie</TableHead>
                  <TableHead className="text-right">Bedrag</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {betalingen.map((betaling) => (
                  <TableRow key={betaling.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {format(new Date(betaling.datum), "d MMM yyyy", { locale: nl })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {BETALING_METHODE_LABELS[betaling.methode as keyof typeof BETALING_METHODE_LABELS] || betaling.methode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {betaling.referentie || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(betaling.bedrag)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingBetaling(betaling)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Bewerken
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeletingBetalingId(betaling.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Verwijderen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Nog geen betalingen ontvangen</p>
              {canRegisterPayment && (
                <Button variant="outline" size="sm" className="mt-4" onClick={onRegisterPayment}>
                  <Plus className="h-4 w-4 mr-1" />
                  Eerste betaling registreren
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editingBetaling && (
        <BetalingBewerkDialog
          open={!!editingBetaling}
          onOpenChange={(open) => !open && setEditingBetaling(null)}
          betaling={editingBetaling}
          factuurId={factuurId}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBetalingId} onOpenChange={(open) => !open && setDeletingBetalingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Betaling verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze betaling wilt verwijderen? Het openstaande bedrag wordt opnieuw berekend.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
