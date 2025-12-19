import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, Save, X, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  WERKSTIJL_KEYWORDS, 
  extractWerkstijlen,
  type ClientExpertPreference 
} from "@/lib/services/clientPreferencesService";

interface ClientExpertPreferencesProps {
  sublocationId: string;
  sublocationName: string;
  publicDescription?: string | null;
}

const AVAILABLE_SPECIALISMEN = [
  'LVB', 'ASS', 'NAH', 'ADHD', 'Gedrag', 'PTSS', 
  'Verslaving', 'Epilepsie', 'Dementie', 'Depressie', 
  'Angst', 'Schizofrenie', 'Borderline'
];

const AVAILABLE_CERTIFICATEN = [
  'BIG geregistreerd', 'SKJ geregistreerd', 'EHBO', 'BHV',
  'Medicatiebekwaam', 'BOPZ', 'Triple-C', 'Gentle Teaching',
  'Motivational Interviewing', 'CGT', 'EMDR', 'Schematherapie'
];

const WERKVORMEN = ['ZZP', 'Uitzendkracht', 'ABCito constructie', 'Detachering'];

export function ClientExpertPreferences({ 
  sublocationId, 
  sublocationName,
  publicDescription 
}: ClientExpertPreferencesProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<ClientExpertPreference | null>(null);
  
  // Form state
  const [werkstijlen, setWerkstijlen] = useState<string[]>([]);
  const [specialismen, setSpecialismen] = useState<string[]>([]);
  const [certificaten, setCertificaten] = useState<string[]>([]);
  const [minJarenErvaring, setMinJarenErvaring] = useState<number>(0);
  const [voorkeurWerkvorm, setVoorkeurWerkvorm] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Detected from description
  const detectedWerkstijlen = extractWerkstijlen(publicDescription);

  useEffect(() => {
    loadPreferences();
  }, [sublocationId]);

  async function loadPreferences() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_expert_preferences')
        .select('*')
        .eq('sublocation_id', sublocationId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPreferences(data as ClientExpertPreference);
        setWerkstijlen(data.preferred_werkstijlen || []);
        setSpecialismen(data.required_specialismen || []);
        setCertificaten(data.preferred_certificaten || []);
        setMinJarenErvaring(data.min_jaren_ervaring || 0);
        setVoorkeurWerkvorm(data.voorkeur_werkvorm || '');
        setNotes(data.notes || '');
      }
    } catch (err) {
      console.error('Error loading preferences:', err);
      toast.error('Kon voorkeuren niet laden');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        sublocation_id: sublocationId,
        preferred_werkstijlen: werkstijlen,
        required_specialismen: specialismen,
        preferred_certificaten: certificaten,
        min_jaren_ervaring: minJarenErvaring > 0 ? minJarenErvaring : null,
        voorkeur_werkvorm: voorkeurWerkvorm || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      };

      if (preferences?.id) {
        const { error } = await supabase
          .from('client_expert_preferences')
          .update(payload)
          .eq('id', preferences.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('client_expert_preferences')
          .insert(payload);
        if (error) throw error;
      }

      toast.success('Voorkeuren opgeslagen');
      loadPreferences();
    } catch (err: any) {
      console.error('Error saving:', err);
      toast.error(err.message || 'Kon niet opslaan');
    } finally {
      setSaving(false);
    }
  }

  function toggleItem(item: string, list: string[], setList: (items: string[]) => void) {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden...
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          Expert Voorkeuren - {sublocationName}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configureer welke expertise en werkstijlen belangrijk zijn voor deze locatie
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Detected from description */}
        {detectedWerkstijlen.length > 0 && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-700 mb-2 font-medium">
              Automatisch gedetecteerd uit omschrijving:
            </p>
            <div className="flex flex-wrap gap-1">
              {detectedWerkstijlen.map(ws => (
                <Badge key={ws} variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                  {ws}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Werkstijlen */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Gewenste werkstijlen</Label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(WERKSTIJL_KEYWORDS).map(ws => (
              <Badge
                key={ws}
                variant={werkstijlen.includes(ws) ? "default" : "outline"}
                className="cursor-pointer transition-colors text-xs"
                onClick={() => toggleItem(ws, werkstijlen, setWerkstijlen)}
              >
                {werkstijlen.includes(ws) ? ws : <><Plus className="h-3 w-3 mr-1" />{ws}</>}
              </Badge>
            ))}
          </div>
        </div>

        {/* Specialismen */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Vereiste specialismen (comorbiditeit)</Label>
          <p className="text-xs text-muted-foreground">Selecteer meerdere voor complexe cliëntgroepen</p>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_SPECIALISMEN.map(sp => (
              <Badge
                key={sp}
                variant={specialismen.includes(sp) ? "default" : "outline"}
                className="cursor-pointer transition-colors text-xs"
                onClick={() => toggleItem(sp, specialismen, setSpecialismen)}
              >
                {specialismen.includes(sp) ? sp : <><Plus className="h-3 w-3 mr-1" />{sp}</>}
              </Badge>
            ))}
          </div>
        </div>

        {/* Certificaten */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Gewenste certificaten</Label>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_CERTIFICATEN.map(cert => (
              <Badge
                key={cert}
                variant={certificaten.includes(cert) ? "default" : "outline"}
                className="cursor-pointer transition-colors text-xs"
                onClick={() => toggleItem(cert, certificaten, setCertificaten)}
              >
                {certificaten.includes(cert) ? cert : <><Plus className="h-3 w-3 mr-1" />{cert}</>}
              </Badge>
            ))}
          </div>
        </div>

        {/* Minimum ervaring */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Minimum jaren ervaring: {minJarenErvaring === 0 ? 'Geen voorkeur' : `${minJarenErvaring} jaar`}
          </Label>
          <Slider
            value={[minJarenErvaring]}
            onValueChange={(v) => setMinJarenErvaring(v[0])}
            max={10}
            step={1}
            className="w-full"
          />
        </div>

        {/* Werkvorm */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Voorkeur werkvorm</Label>
          <Select value={voorkeurWerkvorm} onValueChange={setVoorkeurWerkvorm}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Geen voorkeur" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Geen voorkeur</SelectItem>
              {WERKVORMEN.map(wv => (
                <SelectItem key={wv} value={wv}>{wv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Aanvullende notities</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bijv. 'Ervaring met systeemgericht werken is een pre'"
            rows={3}
          />
        </div>

        {/* Save button */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={loadPreferences}>
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Opslaan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
