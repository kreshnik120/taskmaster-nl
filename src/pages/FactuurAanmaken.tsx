import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  Loader2,
  Receipt,
  Building2,
  FileText,
} from "lucide-react";

import { useCreateFactuur } from "@/hooks/facturatie";
import { useClientOrganizations } from "@/hooks/useClientOrganizations";
import {
  type FactuurType,
  type CreateFactuurRegelInput,
  type BtwPercentage,
  FACTUUR_TYPE_LABELS,
} from "@/types/facturatie";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {[...Array(totalSteps)].map((_, i) => (
        <div key={i} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              i + 1 < currentStep
                ? "bg-primary text-primary-foreground"
                : i + 1 === currentStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1 < currentStep ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          {i < totalSteps - 1 && (
            <div
              className={`w-16 h-1 mx-2 ${i + 1 < currentStep ? "bg-primary" : "bg-muted"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function FactuurAanmaken() {
  const navigate = useNavigate();
  const { createFactuur, isCreating } = useCreateFactuur();
  const { data: opdrachtgevers, isLoading: loadingOpdrachtgevers } = useClientOrganizations();

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  // Form state
  const [type, setType] = useState<FactuurType>("VERKOOP");
  const [opdrachtgeverId, setOpdrachtgeverId] = useState("");
  const [factuurdatum, setFactuurdatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [vervaldatum, setVervaldatum] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [referentie, setReferentie] = useState("");
  const [notities, setNotities] = useState("");

  const [regels, setRegels] = useState<CreateFactuurRegelInput[]>([
    { omschrijving: "", aantal: 1, prijs: 0, btw_percentage: 21 },
  ]);

  const calculateTotals = () => {
    let subtotaal = 0;
    let btw_bedrag = 0;
    regels.forEach((regel) => {
      const regelSubtotaal = regel.aantal * regel.prijs;
      const regelBtw = regelSubtotaal * ((regel.btw_percentage || 21) / 100);
      subtotaal += regelSubtotaal;
      btw_bedrag += regelBtw;
    });
    return { subtotaal, btw_bedrag, totaal: subtotaal + btw_bedrag };
  };

  const totals = calculateTotals();

  const addRegel = () =>
    setRegels([...regels, { omschrijving: "", aantal: 1, prijs: 0, btw_percentage: 21 }]);

  const updateRegel = (index: number, field: keyof CreateFactuurRegelInput, value: unknown) => {
    const newRegels = [...regels];
    newRegels[index] = { ...newRegels[index], [field]: value };
    setRegels(newRegels);
  };

  const removeRegel = (index: number) => {
    if (regels.length > 1) setRegels(regels.filter((_, i) => i !== index));
  };

  const canGoNext = () => {
    if (currentStep === 1) return opdrachtgeverId && factuurdatum && vervaldatum;
    if (currentStep === 2)
      return regels.every((r) => r.omschrijving && r.aantal > 0 && r.prijs >= 0);
    return true;
  };

  const goNext = () => {
    if (currentStep < totalSteps) setCurrentStep(currentStep + 1);
  };
  const goBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    try {
      const factuur = await createFactuur({
        type,
        opdrachtgever_id: opdrachtgeverId,
        factuurdatum,
        vervaldatum,
        referentie: referentie || null,
        notities: notities || null,
        regels,
      });
      navigate(`/facturatie/${factuur.id}`);
    } catch (error) {
      // Error handled in hook
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/facturatie")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nieuwe factuur</h1>
          <p className="text-sm text-muted-foreground">Maak een nieuwe factuur aan</p>
        </div>
      </div>

      <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Stap 1: Basisgegevens
            </CardTitle>
            <CardDescription>
              Selecteer de opdrachtgever en vul de basisgegevens in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type factuur *</Label>
                <Select value={type} onValueChange={(v) => setType(v as FactuurType)}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FACTUUR_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="opdrachtgever">Opdrachtgever *</Label>
                <Select value={opdrachtgeverId} onValueChange={setOpdrachtgeverId}>
                  <SelectTrigger id="opdrachtgever">
                    <SelectValue placeholder="Selecteer opdrachtgever..." />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingOpdrachtgevers ? (
                      <SelectItem value="loading" disabled>
                        Laden...
                      </SelectItem>
                    ) : (
                      opdrachtgevers?.map((og) => (
                        <SelectItem key={og.id} value={og.id}>
                          {og.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="factuurdatum">Factuurdatum *</Label>
                <Input
                  id="factuurdatum"
                  type="date"
                  value={factuurdatum}
                  onChange={(e) => setFactuurdatum(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vervaldatum">Vervaldatum *</Label>
                <Input
                  id="vervaldatum"
                  type="date"
                  value={vervaldatum}
                  onChange={(e) => setVervaldatum(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referentie">Referentie (optioneel)</Label>
              <Input
                id="referentie"
                placeholder="Bijv. PO-nummer, projectcode..."
                value={referentie}
                onChange={(e) => setReferentie(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={goNext} disabled={!canGoNext()}>
              Volgende
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Stap 2: Factuurregels
            </CardTitle>
            <CardDescription>Voeg de regels toe die op de factuur komen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Omschrijving *</TableHead>
                  <TableHead className="w-24">Aantal *</TableHead>
                  <TableHead className="w-32">Prijs *</TableHead>
                  <TableHead className="w-24">BTW %</TableHead>
                  <TableHead className="w-28 text-right">Totaal</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {regels.map((regel, index) => {
                  const regelTotaal =
                    regel.aantal * regel.prijs * (1 + (regel.btw_percentage || 21) / 100);
                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          placeholder="Omschrijving..."
                          value={regel.omschrijving}
                          onChange={(e) => updateRegel(index, "omschrijving", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={regel.aantal}
                          onChange={(e) =>
                            updateRegel(index, "aantal", parseFloat(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            €
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="pl-7"
                            value={regel.prijs}
                            onChange={(e) =>
                              updateRegel(index, "prijs", parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(regel.btw_percentage || 21)}
                          onValueChange={(v) =>
                            updateRegel(index, "btw_percentage", parseInt(v) as BtwPercentage)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="9">9%</SelectItem>
                            <SelectItem value="21">21%</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(regelTotaal)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRegel(index)}
                          disabled={regels.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right">
                    Subtotaal
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.subtotaal)}</TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="text-right">
                    BTW
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.btw_bedrag)}</TableCell>
                  <TableCell />
                </TableRow>
                <TableRow className="font-bold">
                  <TableCell colSpan={4} className="text-right">
                    Totaal
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.totaal)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            <Button variant="outline" onClick={addRegel}>
              <Plus className="h-4 w-4 mr-2" />
              Regel toevoegen
            </Button>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Terug
            </Button>
            <Button onClick={goNext} disabled={!canGoNext()}>
              Volgende
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Stap 3: Bevestigen
            </CardTitle>
            <CardDescription>Controleer de gegevens en maak de factuur aan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Factuurgegevens</h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Type:</span>
                    <span>{FACTUUR_TYPE_LABELS[type]}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Factuurdatum:</span>
                    <span>{factuurdatum}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Vervaldatum:</span>
                    <span>{vervaldatum}</span>
                  </div>
                  {referentie && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Referentie:</span>
                      <span>{referentie}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Opdrachtgever</h4>
                <p className="font-medium">
                  {opdrachtgevers?.find((og) => og.id === opdrachtgeverId)?.name || "—"}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">
                Factuurregels ({regels.length})
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead className="text-right">Aantal</TableHead>
                    <TableHead className="text-right">Prijs</TableHead>
                    <TableHead className="text-right">Totaal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regels.map((regel, i) => (
                    <TableRow key={i}>
                      <TableCell>{regel.omschrijving}</TableCell>
                      <TableCell className="text-right">{regel.aantal}</TableCell>
                      <TableCell className="text-right">{formatCurrency(regel.prijs)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(
                          regel.aantal * regel.prijs * (1 + (regel.btw_percentage || 21) / 100)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Separator />

            <div className="flex justify-end">
              <div className="space-y-1 text-right">
                <div className="flex justify-between gap-8 text-sm">
                  <span className="text-muted-foreground">Subtotaal</span>
                  <span>{formatCurrency(totals.subtotaal)}</span>
                </div>
                <div className="flex justify-between gap-8 text-sm">
                  <span className="text-muted-foreground">BTW</span>
                  <span>{formatCurrency(totals.btw_bedrag)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between gap-8 font-bold">
                  <span>Totaal</span>
                  <span>{formatCurrency(totals.totaal)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notities">Notities (optioneel)</Label>
              <Textarea
                id="notities"
                placeholder="Interne notities bij deze factuur..."
                value={notities}
                onChange={(e) => setNotities(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Terug
            </Button>
            <Button onClick={handleSubmit} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Aanmaken...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  Factuur aanmaken
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
