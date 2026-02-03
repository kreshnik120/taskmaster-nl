import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  ArrowLeft,
  Send,
  CreditCard,
  MoreVertical,
  Trash2,
  Edit,
  Download,
  Mail,
  AlertTriangle,
  Building2,
  Calendar,
  Euro,
  Bell,
  Loader2,
  Copy,
} from "lucide-react";

import { useFactuur, useUpdateFactuur, useDeleteFactuur } from "@/hooks/facturatie";
import {
  type FactuurStatus,
  FACTUUR_STATUS_LABELS,
  FACTUUR_TYPE_LABELS,
  BETALING_METHODE_LABELS,
} from "@/types/facturatie";

import { BetalingRegistrerenDialog } from "@/components/facturatie/BetalingRegistrerenDialog";
import { StatusWijzigenDialog } from "@/components/facturatie/StatusWijzigenDialog";
import { BetalingenHistorie } from "@/components/facturatie/BetalingenHistorie";
import { HerinneringenPanel } from "@/components/facturatie/HerinneringenPanel";
import { FactuurPDFDownloadButton } from "@/components/facturatie/pdf";

// Status badge met kleuren per status
function StatusBadge({ status }: { status: FactuurStatus }) {
  const colorMap: Record<FactuurStatus, string> = {
    CONCEPT: "bg-gray-100 text-gray-700 border-gray-200",
    DEFINITIEF: "bg-blue-100 text-blue-700 border-blue-200",
    VERZONDEN: "bg-cyan-100 text-cyan-700 border-cyan-200",
    HERINNERING_1: "bg-yellow-100 text-yellow-700 border-yellow-200",
    HERINNERING_2: "bg-orange-100 text-orange-700 border-orange-200",
    HERINNERING_3: "bg-red-100 text-red-700 border-red-200",
    BETWIST: "bg-purple-100 text-purple-700 border-purple-200",
    BETAALD: "bg-green-100 text-green-700 border-green-200",
    AFGEBOEKT: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <Badge variant="outline" className={colorMap[status]}>
      {FACTUUR_STATUS_LABELS[status]}
    </Badge>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

export default function FactuurDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: factuur, isLoading, isError } = useFactuur(id);
  const { updateStatus, isUpdating } = useUpdateFactuur();
  const { deleteFactuur, isDeleting } = useDeleteFactuur();

  const [showBetalingDialog, setShowBetalingDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !factuur) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Factuur niet gevonden</h2>
            <p className="text-muted-foreground mb-4">
              De factuur bestaat niet of je hebt geen toegang.
            </p>
            <Button onClick={() => navigate("/facturatie")}>Terug naar overzicht</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteFactuur(factuur.id);
      navigate("/facturatie");
    } catch (error) {
      // Error handled in hook
    }
  };

  const canEdit = factuur.status === "CONCEPT";
  const canDelete = factuur.status === "CONCEPT";
  const canSend = factuur.status === "DEFINITIEF";
  const canRegisterPayment = !["CONCEPT", "AFGEBOEKT", "BETAALD"].includes(factuur.status);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/facturatie")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{factuur.factuur_nummer}</h1>
              <StatusBadge status={factuur.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {FACTUUR_TYPE_LABELS[factuur.type]} • Aangemaakt op{" "}
              {format(new Date(factuur.created_at), "d MMMM yyyy", { locale: nl })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canRegisterPayment && (
            <Button onClick={() => setShowBetalingDialog(true)}>
              <CreditCard className="h-4 w-4 mr-2" />
              Betaling registreren
            </Button>
          )}
          {canSend && (
            <Button onClick={() => updateStatus(factuur.id, "VERZONDEN")}>
              <Send className="h-4 w-4 mr-2" />
              Verzenden
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowStatusDialog(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Status wijzigen
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="p-0"
              >
                <FactuurPDFDownloadButton
                  factuur={factuur}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-auto px-2 py-1.5 font-normal"
                />
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="h-4 w-4 mr-2" />
                Dupliceren
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem onClick={() => navigate(`/facturatie/${factuur.id}/bewerken`)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Bewerken
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Verwijderen
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Factuur verwijderen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Weet je zeker dat je factuur {factuur.factuur_nummer} wilt verwijderen? Deze
                        actie kan niet ongedaan worden gemaakt.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuleren</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verwijderen"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="regels">Regels ({factuur.regels?.length || 0})</TabsTrigger>
              <TabsTrigger value="betalingen">
                Betalingen ({factuur.betalingen?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="herinneringen">Herinneringen</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Opdrachtgever
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {factuur.opdrachtgever ? (
                    <div className="space-y-1">
                      <p className="font-medium">{factuur.opdrachtgever.name}</p>
                      {factuur.opdrachtgever.kvk_nummer && (
                        <p className="text-sm text-muted-foreground">
                          KVK: {factuur.opdrachtgever.kvk_nummer}
                        </p>
                      )}
                      {factuur.opdrachtgever.btw_nummer && (
                        <p className="text-sm text-muted-foreground">
                          BTW: {factuur.opdrachtgever.btw_nummer}
                        </p>
                      )}
                      {factuur.opdrachtgever.centrale_facturatie_email && (
                        <p className="text-sm text-muted-foreground">
                          <Mail className="h-3 w-3 inline mr-1" />
                          {factuur.opdrachtgever.centrale_facturatie_email}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Geen opdrachtgever gekoppeld</p>
                  )}
                </CardContent>
              </Card>
              {factuur.notities && (
                <Card>
                  <CardHeader>
                    <CardTitle>Notities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{factuur.notities}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="regels">
              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Omschrijving</TableHead>
                        <TableHead className="text-right">Aantal</TableHead>
                        <TableHead className="text-right">Prijs</TableHead>
                        <TableHead className="text-right">BTW</TableHead>
                        <TableHead className="text-right">Totaal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {factuur.regels?.map((regel, index) => (
                        <TableRow key={regel.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium">{regel.omschrijving}</p>
                            {regel.urenstaat_id && (
                              <p className="text-xs text-muted-foreground">Urenstaat gekoppeld</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {regel.aantal} {regel.eenheid}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(regel.prijs)}</TableCell>
                          <TableCell className="text-right">{regel.btw_percentage}%</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(regel.totaal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={5} className="text-right">
                          Subtotaal
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(factuur.subtotaal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={5} className="text-right">
                          BTW
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(factuur.btw_bedrag)}</TableCell>
                      </TableRow>
                      <TableRow className="font-bold">
                        <TableCell colSpan={5} className="text-right">
                          Totaal
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(factuur.totaal)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="betalingen">
              <BetalingenHistorie
                factuurId={factuur.id}
                openstaandBedrag={factuur.openstaand_bedrag}
                totaalBedrag={factuur.totaal}
                onRegisterPayment={() => setShowBetalingDialog(true)}
                canRegisterPayment={canRegisterPayment}
              />
            </TabsContent>

            <TabsContent value="herinneringen">
              <HerinneringenPanel
                factuurId={factuur.id}
                factuurNummer={factuur.factuur_nummer}
                factuurStatus={factuur.status}
                openstaandBedrag={factuur.openstaand_bedrag}
                opdrachtgeverEmail={factuur.opdrachtgever?.centrale_facturatie_email || null}
                vervaldatum={factuur.vervaldatum}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Euro className="h-5 w-5" />
                Financieel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotaal</span>
                <span>{formatCurrency(factuur.subtotaal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">BTW</span>
                <span>{formatCurrency(factuur.btw_bedrag)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Totaal</span>
                <span>{formatCurrency(factuur.totaal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Betaald</span>
                <span className="text-green-600">{formatCurrency(factuur.betaald_bedrag)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Openstaand</span>
                <span className={factuur.openstaand_bedrag > 0 ? "text-orange-600" : "text-green-600"}>
                  {formatCurrency(factuur.openstaand_bedrag)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Datums
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Factuurdatum</span>
                <span>{format(new Date(factuur.factuurdatum), "d MMM yyyy", { locale: nl })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vervaldatum</span>
                <span>{format(new Date(factuur.vervaldatum), "d MMM yyyy", { locale: nl })}</span>
              </div>
              {factuur.verzonden_op && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Verzonden op</span>
                  <span>{format(new Date(factuur.verzonden_op), "d MMM yyyy", { locale: nl })}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <FactuurPDFDownloadButton
                factuur={factuur}
                variant="outline"
                className="w-full justify-start"
              />
              <Button variant="outline" className="w-full justify-start">
                <Mail className="h-4 w-4 mr-2" />
                E-mail verzenden
              </Button>
              {canRegisterPayment && factuur.openstaand_bedrag > 0 && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    const tabsTrigger = document.querySelector('[value="herinneringen"]') as HTMLElement;
                    if (tabsTrigger) tabsTrigger.click();
                  }}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Herinnering versturen
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start">
                <Copy className="h-4 w-4 mr-2" />
                Factuur dupliceren
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <BetalingRegistrerenDialog
        open={showBetalingDialog}
        onOpenChange={setShowBetalingDialog}
        factuurId={factuur.id}
        factuurNummer={factuur.factuur_nummer}
        openstaandBedrag={factuur.openstaand_bedrag}
        totaalBedrag={factuur.totaal}
        reedsBetaald={factuur.betaald_bedrag}
      />

      <StatusWijzigenDialog
        factuurId={factuur.id}
        huidigeStatus={factuur.status}
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
      />
    </div>
  );
}
