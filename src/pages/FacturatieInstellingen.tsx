import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Check, Settings, Building2, FileText, Bell, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFacturatieInstellingen, useUpdateFacturatieInstellingen } from '@/hooks/facturatie';
import type { UpdateFacturatieInstellingenInput } from '@/types/facturatie';

const DEFAULT_VALUES: UpdateFacturatieInstellingenInput = {
  standaard_btw_percentage: 21,
  btw_vrijgesteld: false,
  btw_nummer: null,
  standaard_betalingstermijn: 30,
  factuur_prefix: 'FAC',
  factuur_volgnummer_lengte: 6,
  herinnering_dagen_1: 14,
  herinnering_dagen_2: 28,
  herinnering_dagen_3: 42,
  bedrijfsnaam: null,
  adres_straat: null,
  adres_postcode: null,
  adres_plaats: null,
  adres_land: 'Nederland',
  kvk_nummer: null,
  iban: null,
  bic: null,
  logo_url: null,
  factuur_footer_tekst: null,
  betalingsinstructies: 'Gelieve het factuurnummer te vermelden bij uw betaling.',
};

export default function FacturatieInstellingen() {
  const navigate = useNavigate();
  const { data: instellingen, isLoading, error } = useFacturatieInstellingen();
  const updateMutation = useUpdateFacturatieInstellingen();

  const [formData, setFormData] = useState<UpdateFacturatieInstellingenInput>(DEFAULT_VALUES);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Load existing data into form
  useEffect(() => {
    if (instellingen) {
      setFormData({
        standaard_btw_percentage: instellingen.standaard_btw_percentage,
        btw_vrijgesteld: instellingen.btw_vrijgesteld,
        btw_nummer: instellingen.btw_nummer,
        standaard_betalingstermijn: instellingen.standaard_betalingstermijn,
        factuur_prefix: instellingen.factuur_prefix,
        factuur_volgnummer_lengte: instellingen.factuur_volgnummer_lengte,
        herinnering_dagen_1: instellingen.herinnering_dagen_1,
        herinnering_dagen_2: instellingen.herinnering_dagen_2,
        herinnering_dagen_3: instellingen.herinnering_dagen_3,
        bedrijfsnaam: instellingen.bedrijfsnaam,
        adres_straat: instellingen.adres_straat,
        adres_postcode: instellingen.adres_postcode,
        adres_plaats: instellingen.adres_plaats,
        adres_land: instellingen.adres_land,
        kvk_nummer: instellingen.kvk_nummer,
        iban: instellingen.iban,
        bic: instellingen.bic,
        logo_url: instellingen.logo_url,
        factuur_footer_tekst: instellingen.factuur_footer_tekst,
        betalingsinstructies: instellingen.betalingsinstructies,
      });
    }
  }, [instellingen]);

  // Track changes
  useEffect(() => {
    if (!instellingen) {
      // New settings - check if any field differs from defaults
      const hasAnyChange = Object.keys(formData).some(
        (key) => formData[key as keyof typeof formData] !== DEFAULT_VALUES[key as keyof typeof DEFAULT_VALUES]
      );
      setHasChanges(hasAnyChange);
    } else {
      // Existing settings - compare with loaded data
      const hasAnyChange = Object.keys(formData).some(
        (key) => formData[key as keyof typeof formData] !== instellingen[key as keyof typeof instellingen]
      );
      setHasChanges(hasAnyChange);
    }
  }, [formData, instellingen]);

  // Live factuurnummer preview
  const factuurnummerPreview = useMemo(() => {
    const prefix = formData.factuur_prefix || 'FAC';
    const jaar = new Date().getFullYear();
    const lengte = formData.factuur_volgnummer_lengte || 6;
    const nummer = '1'.padStart(lengte, '0');
    return `${prefix}-${jaar}-${nummer}`;
  }, [formData.factuur_prefix, formData.factuur_volgnummer_lengte]);

  const updateField = <K extends keyof UpdateFacturatieInstellingenInput>(
    field: K,
    value: UpdateFacturatieInstellingenInput[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setShowSaved(false);
  };

  const handleSave = async () => {
    await updateMutation.mutateAsync(formData);
    setHasChanges(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <Alert variant="destructive">
          <AlertDescription>
            Fout bij laden instellingen: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/facturatie')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Facturatie Instellingen
            </h1>
            <p className="text-muted-foreground text-sm">
              Configureer BTW, betalingstermijnen en bedrijfsgegevens
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className="gap-2 w-full sm:w-auto"
        >
          {showSaved ? (
            <>
              <Check className="h-4 w-4" />
              Opgeslagen
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? 'Opslaan...' : 'Opslaan'}
            </>
          )}
        </Button>
      </div>

      {/* BTW Configuratie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            BTW Configuratie
          </CardTitle>
          <CardDescription>
            Standaard BTW-percentage en vrijstelling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Standaard BTW-percentage</Label>
              <Select
                value={String(formData.standaard_btw_percentage)}
                onValueChange={(v) => updateField('standaard_btw_percentage', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="21">21%</SelectItem>
                  <SelectItem value="9">9%</SelectItem>
                  <SelectItem value="0">0%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>BTW-nummer</Label>
              <Input
                placeholder="NL123456789B01"
                value={formData.btw_nummer || ''}
                onChange={(e) => updateField('btw_nummer', e.target.value || null)}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={formData.btw_vrijgesteld || false}
                onCheckedChange={(v) => updateField('btw_vrijgesteld', v)}
              />
              <Label>BTW-vrijgesteld</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Factuurnummer Configuratie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Factuurnummer Configuratie
          </CardTitle>
          <CardDescription>
            Prefix en volgnummer formaat
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Prefix</Label>
              <Input
                placeholder="FAC"
                maxLength={10}
                value={formData.factuur_prefix || ''}
                onChange={(e) => updateField('factuur_prefix', e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>Volgnummer lengte</Label>
              <Select
                value={String(formData.factuur_volgnummer_lengte)}
                onValueChange={(v) => updateField('factuur_volgnummer_lengte', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 cijfers</SelectItem>
                  <SelectItem value="5">5 cijfers</SelectItem>
                  <SelectItem value="6">6 cijfers</SelectItem>
                  <SelectItem value="7">7 cijfers</SelectItem>
                  <SelectItem value="8">8 cijfers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Voorbeeld</Label>
              <div className="h-10 flex items-center px-3 rounded-lg bg-muted font-mono text-sm">
                {factuurnummerPreview}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Betalingstermijn */}
      <Card>
        <CardHeader>
          <CardTitle>Betalingstermijn</CardTitle>
          <CardDescription>
            Standaard aantal dagen tot vervaldatum
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 max-w-xs">
            <Input
              type="number"
              min={1}
              max={90}
              value={formData.standaard_betalingstermijn || 30}
              onChange={(e) => updateField('standaard_betalingstermijn', Number(e.target.value))}
              className="w-24"
            />
            <span className="text-muted-foreground">dagen</span>
          </div>
        </CardContent>
      </Card>

      {/* Herinnering Schema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Herinnering Schema
          </CardTitle>
          <CardDescription>
            Aantal dagen na vervaldatum voor elke herinnering
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-xs font-medium">1</span>
                Eerste herinnering
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={formData.herinnering_dagen_1 || 14}
                  onChange={(e) => updateField('herinnering_dagen_1', Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">dagen</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-medium">2</span>
                Tweede herinnering
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={formData.herinnering_dagen_2 || 28}
                  onChange={(e) => updateField('herinnering_dagen_2', Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">dagen</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-medium">3</span>
                Laatste herinnering
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={formData.herinnering_dagen_3 || 42}
                  onChange={(e) => updateField('herinnering_dagen_3', Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">dagen</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bedrijfsgegevens */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Bedrijfsgegevens
          </CardTitle>
          <CardDescription>
            Gegevens die op facturen worden getoond
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bedrijfsnaam</Label>
              <Input
                placeholder="Uw bedrijfsnaam"
                value={formData.bedrijfsnaam || ''}
                onChange={(e) => updateField('bedrijfsnaam', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label>KvK-nummer</Label>
              <Input
                placeholder="12345678"
                value={formData.kvk_nummer || ''}
                onChange={(e) => updateField('kvk_nummer', e.target.value || null)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Straat + huisnummer</Label>
            <Input
              placeholder="Voorbeeldstraat 123"
              value={formData.adres_straat || ''}
              onChange={(e) => updateField('adres_straat', e.target.value || null)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input
                placeholder="1234 AB"
                value={formData.adres_postcode || ''}
                onChange={(e) => updateField('adres_postcode', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Plaats</Label>
              <Input
                placeholder="Amsterdam"
                value={formData.adres_plaats || ''}
                onChange={(e) => updateField('adres_plaats', e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Land</Label>
              <Input
                placeholder="Nederland"
                value={formData.adres_land || ''}
                onChange={(e) => updateField('adres_land', e.target.value || null)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>IBAN</Label>
              <Input
                placeholder="NL00BANK0123456789"
                value={formData.iban || ''}
                onChange={(e) => updateField('iban', e.target.value.toUpperCase() || null)}
              />
            </div>
            <div className="space-y-2">
              <Label>BIC</Label>
              <Input
                placeholder="BANKNL2A"
                value={formData.bic || ''}
                onChange={(e) => updateField('bic', e.target.value.toUpperCase() || null)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Factuur Teksten */}
      <Card>
        <CardHeader>
          <CardTitle>Factuur Teksten</CardTitle>
          <CardDescription>
            Standaard teksten die op facturen verschijnen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Betalingsinstructies</Label>
            <Textarea
              placeholder="Gelieve het factuurnummer te vermelden bij uw betaling."
              rows={2}
              value={formData.betalingsinstructies || ''}
              onChange={(e) => updateField('betalingsinstructies', e.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Footer tekst</Label>
            <Textarea
              placeholder="Optionele tekst onderaan de factuur"
              rows={3}
              value={formData.factuur_footer_tekst || ''}
              onChange={(e) => updateField('factuur_footer_tekst', e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mobile save button */}
      <div className="sm:hidden pb-4">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className="w-full gap-2"
        >
          {showSaved ? (
            <>
              <Check className="h-4 w-4" />
              Opgeslagen
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? 'Opslaan...' : 'Opslaan'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
