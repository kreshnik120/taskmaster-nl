import { useState, useEffect, useMemo } from "react";
import { format, addDays, differenceInCalendarDays, addWeeks, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarIcon, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useClientOrganizations } from "@/hooks/useClientOrganizations";
import { toast } from "sonner";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface NieuweDienstModalProps {
  open: boolean;
  onClose: () => void;
  editDienst: DienstData | null;
}

const tijdOpties = (start: number, end: number) => {
  const opts: string[] = [];
  for (let h = start; h <= end; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < end || end === 23) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
};

const startTijden = tijdOpties(6, 23);
const eindTijden = tijdOpties(6, 23);
const functieNiveaus = ["HBO-V", "VP4", "VP3", "VIG", "Helpende 2"];
const dienstTypes = ["dag", "avond", "nacht", "weekend"];

function berekeningDuur(start: string, eind: string, pauze: number): number {
  if (!start || !eind) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = eind.split(":").map(Number);
  const minuten = (eh * 60 + em) - (sh * 60 + sm) - pauze;
  return Math.max(0, minuten / 60);
}

function berekenHerhalingen(startDatum: Date, totDatum: Date, type: string): number {
  if (type === "dagelijks") return Math.max(0, differenceInCalendarDays(totDatum, startDatum));
  if (type === "wekelijks") return Math.max(0, Math.floor(differenceInCalendarDays(totDatum, startDatum) / 7));
  if (type === "tweewekelijks") return Math.max(0, Math.floor(differenceInCalendarDays(totDatum, startDatum) / 14));
  return 0;
}

export function NieuweDienstModal({ open, onClose, editDienst }: NieuweDienstModalProps) {
  const queryClient = useQueryClient();
  const { data: orgs = [] } = useClientOrganizations();
  const isEdit = !!editDienst;

  // Form state
  const [orgId, setOrgId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sublocationId, setSublocationId] = useState("");
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState<Date | undefined>(new Date());
  const [startTijd, setStartTijd] = useState("07:00");
  const [eindTijd, setEindTijd] = useState("15:00");
  const [pauze, setPauze] = useState(0);
  const [functieNiveau, setFunctieNiveau] = useState("");
  const [aantal, setAantal] = useState(1);
  const [werkvorm, setWerkvorm] = useState("ZZP");
  const [dienstType, setDienstType] = useState("dag");
  const [tarief, setTarief] = useState("");
  const [herhaling, setHerhaling] = useState("geen");
  const [herhalingTot, setHerhalingTot] = useState<Date | undefined>();
  const [priveOpmerking, setPriveOpmerking] = useState("");
  const [publiekeOpmerking, setPubliekeOpmerking] = useState("");
  const [status, setStatus] = useState("concept");
  const [accepteerbaar, setAccepteerbaar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [titelManual, setTitelManual] = useState(false);

  // Cascade queries
  const { data: locations = [] } = useQuery({
    queryKey: ["client-locations", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("client_locations").select("id, naam").eq("client_org_id", orgId).order("naam");
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: sublocations = [] } = useQuery({
    queryKey: ["client-sublocations", locationId],
    queryFn: async () => {
      const { data } = await supabase.from("client_sublocations").select("id, naam, plaats").eq("location_id", locationId).order("naam");
      return data ?? [];
    },
    enabled: !!locationId,
  });

  // Auto-fill titel
  useEffect(() => {
    if (titelManual || isEdit) return;
    const org = orgs.find((o) => o.id === orgId);
    const sub = sublocations.find((s) => s.id === sublocationId);
    if (org && sub) setTitel(`${org.name} - ${sub.naam}`);
  }, [orgId, sublocationId, orgs, sublocations, titelManual, isEdit]);

  // Populate edit data
  useEffect(() => {
    if (!editDienst || !open) return;
    setTitel(editDienst.titel);
    setDatum(parseISO(editDienst.datum));
    setStartTijd(editDienst.start_tijd?.slice(0, 5) ?? "07:00");
    setEindTijd(editDienst.eind_tijd?.slice(0, 5) ?? "15:00");
    setPauze(editDienst.pauze_minuten ?? 0);
    setFunctieNiveau(editDienst.gevraagd_functie_niveau ?? "");
    setAantal(editDienst.gevraagd_aantal ?? 1);
    setWerkvorm(editDienst.werkvorm ?? "ZZP");
    setDienstType(editDienst.dienst_type ?? "dag");
    setTarief(editDienst.tarief_per_uur?.toString() ?? "");
    setHerhaling(editDienst.herhaling ?? "geen");
    setPriveOpmerking(editDienst.prive_opmerking ?? "");
    setPubliekeOpmerking(editDienst.publieke_opmerking ?? "");
    setStatus(editDienst.status);
    setAccepteerbaar(editDienst.accepteerbaar);
    setTitelManual(true);
    // Set org/location/sublocation from nested data
    if (editDienst.sublocation?.id) setSublocationId(editDienst.sublocation.id);
    if (editDienst.sublocation?.location?.organization) {
      const matchedOrg = orgs.find(o => o.name === editDienst.sublocation.location.organization.name);
      if (matchedOrg) setOrgId(matchedOrg.id);
    }
  }, [editDienst, open, orgs]);

  // Edit mode: resolve locationId from sublocation
  useEffect(() => {
    if (!isEdit || !editDienst?.sublocation?.id || locations.length === 0 || locationId) return;
    const findLocation = async () => {
      const { data } = await supabase
        .from("client_sublocations")
        .select("location_id")
        .eq("id", editDienst.sublocation.id)
        .single();
      if (data?.location_id) setLocationId(data.location_id);
    };
    findLocation();
  }, [isEdit, editDienst, locations, locationId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setOrgId(""); setLocationId(""); setSublocationId("");
      setTitel(""); setDatum(new Date()); setStartTijd("07:00"); setEindTijd("15:00");
      setPauze(0); setFunctieNiveau(""); setAantal(1); setWerkvorm("ZZP");
      setDienstType("dag"); setTarief(""); setHerhaling("geen"); setHerhalingTot(undefined);
      setPriveOpmerking(""); setPubliekeOpmerking(""); setStatus("concept");
      setAccepteerbaar(true); setTitelManual(false);
    }
  }, [open]);

  const duur = useMemo(() => berekeningDuur(startTijd, eindTijd, pauze), [startTijd, eindTijd, pauze]);
  const herhalingAantal = useMemo(() => {
    if (herhaling === "geen" || !datum || !herhalingTot) return 0;
    return berekenHerhalingen(datum, herhalingTot, herhaling);
  }, [herhaling, datum, herhalingTot]);

  const handleSave = async () => {
    const targetSublocationId = sublocationId || (editDienst?.sublocation?.id);
    if (!targetSublocationId || !datum || !startTijd || !eindTijd || !titel.trim()) {
      toast.error("Vul alle verplichte velden in");
      return;
    }
    if (startTijd >= eindTijd) {
      toast.error("Eindtijd moet na starttijd liggen");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Niet ingelogd"); return; }

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!userOrg?.org_id) {
        toast.error("Geen organisatie gevonden voor je account");
        return;
      }

      const dienstData = {
        sublocation_id: targetSublocationId,
        titel: titel.trim(),
        datum: format(datum, "yyyy-MM-dd"),
        start_tijd: startTijd + ":00",
        eind_tijd: eindTijd + ":00",
        pauze_minuten: pauze,
        
        gevraagd_functie_niveau: functieNiveau || null,
        gevraagd_aantal: aantal,
        werkvorm: werkvorm || null,
        dienst_type: dienstType,
        tarief_per_uur: tarief ? parseFloat(tarief) : null,
        herhaling,
        prive_opmerking: priveOpmerking || null,
        publieke_opmerking: publiekeOpmerking || null,
        status,
        accepteerbaar,
        bron: isEdit ? editDienst!.bron : "handmatig",
        org_id: userOrg.org_id,
        aangemaakt_door: user.id,
      };

      if (isEdit) {
        const { error } = await supabase.from("diensten").update(dienstData).eq("id", editDienst!.id);
        if (error) throw error;
        toast.success("Dienst bijgewerkt!");
      } else {
        const { data: inserted, error } = await supabase.from("diensten").insert(dienstData).select("id").single();
        if (error) throw error;

        // Handle herhaling
        if (herhaling !== "geen" && herhalingAantal > 0 && datum && herhalingTot) {
          const herhalingRecords = [];
          for (let i = 1; i <= herhalingAantal; i++) {
            let newDatum: Date;
            if (herhaling === "dagelijks") newDatum = addDays(datum, i);
            else if (herhaling === "wekelijks") newDatum = addWeeks(datum, i);
            else newDatum = addWeeks(datum, i * 2);

            herhalingRecords.push({
              ...dienstData,
              datum: format(newDatum, "yyyy-MM-dd"),
              herhaling_parent_id: inserted.id,
              bron: "herhaling" as const,
            });
          }
          if (herhalingRecords.length > 0) {
            const { error: hErr } = await supabase.from("diensten").insert(herhalingRecords);
            if (hErr) {
              console.error("Herhaling error:", hErr);
              toast.error(`Hoofddienst aangemaakt, maar ${herhalingAantal} herhalingen zijn mislukt`);
            }
          }
          toast.success(`${herhalingAantal + 1} diensten aangemaakt!`);
        } else {
          toast.success("Dienst aangemaakt!");
        }
      }

      queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  const selectedOrgName = orgs.find((o) => o.id === orgId)?.name;
  const selectedSubName = sublocations.find((s) => s.id === sublocationId)?.naam;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Dienst bewerken" : "Nieuwe dienst"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Form */}
          <div className="space-y-4">
            {/* Cascade org/loc/subloc */}
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Organisatie *</Label>
                <Select value={orgId} onValueChange={(v) => { setOrgId(v); setLocationId(""); setSublocationId(""); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Kies organisatie" /></SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {orgId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Locatie *</Label>
                  <Select value={locationId} onValueChange={(v) => { setLocationId(v); setSublocationId(""); }}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Kies locatie" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.naam}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {locationId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Afdeling *</Label>
                  <Select value={sublocationId} onValueChange={setSublocationId}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Kies afdeling" /></SelectTrigger>
                    <SelectContent>
                      {sublocations.map((s) => <SelectItem key={s.id} value={s.id}>{s.naam}{s.plaats ? ` — ${s.plaats}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>

            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input className="h-9 text-xs" value={titel} onChange={(e) => { setTitel(e.target.value); setTitelManual(true); }} placeholder="Dienst titel" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Datum *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full h-9 text-xs justify-start", !datum && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                    {datum ? format(datum, "d MMMM yyyy", { locale: nl }) : "Kies datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={datum} onSelect={setDatum} locale={nl} disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Starttijd *</Label>
                <Select value={startTijd} onValueChange={setStartTijd}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{startTijden.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Eindtijd *</Label>
                <Select value={eindTijd} onValueChange={setEindTijd}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{eindTijden.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {duur > 0 && <p className="text-[10px] text-muted-foreground">({duur.toFixed(1)} uur netto)</p>}

            <div className="space-y-1.5">
              <Label className="text-xs">Pauze</Label>
              <Select value={String(pauze)} onValueChange={(v) => setPauze(Number(v))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 15, 30, 45, 60].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Functieniveau</Label>
                <Select value={functieNiveau} onValueChange={setFunctieNiveau}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Kies niveau" /></SelectTrigger>
                  <SelectContent>{functieNiveaus.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Aantal</Label>
                <Input type="number" min={1} max={10} className="h-9 text-xs" value={aantal} onChange={(e) => setAantal(Math.max(1, Math.min(10, Number(e.target.value))))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Werkvorm</Label>
                <Select value={werkvorm} onValueChange={setWerkvorm}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZZP">ZZP</SelectItem>
                    <SelectItem value="Uitzendkracht">Uitzendkracht</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tarief (€/uur)</Label>
                <Input type="number" min={0} step={0.01} className="h-9 text-xs" value={tarief} onChange={(e) => setTarief(e.target.value)} placeholder="Optioneel" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Dienst type</Label>
              <div className="flex gap-1.5">
                {dienstTypes.map((t) => (
                  <Button key={t} type="button" variant={dienstType === t ? "default" : "outline"} size="sm" className="h-7 text-[11px]" onClick={() => setDienstType(t)}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Herhaling</Label>
              <Select value={herhaling} onValueChange={setHerhaling}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen</SelectItem>
                  <SelectItem value="dagelijks">Dagelijks</SelectItem>
                  <SelectItem value="wekelijks">Wekelijks</SelectItem>
                  <SelectItem value="tweewekelijks">Tweewekelijks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {herhaling !== "geen" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Herhalen tot</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full h-9 text-xs justify-start", !herhalingTot && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                      {herhalingTot ? format(herhalingTot, "d MMMM yyyy", { locale: nl }) : "Einddatum"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={herhalingTot} onSelect={setHerhalingTot} locale={nl} disabled={(d) => datum ? d <= datum : false} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                {herhalingAantal > 0 && (
                  <p className="text-[10px] text-muted-foreground">→ {herhalingAantal + 1} diensten worden aangemaakt</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Privé opmerking</Label>
              <Textarea className="text-xs min-h-[60px]" value={priveOpmerking} onChange={(e) => setPriveOpmerking(e.target.value)} placeholder="Alleen zichtbaar voor bureau" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Publieke opmerking</Label>
              <Textarea className="text-xs min-h-[60px]" value={publiekeOpmerking} onChange={(e) => setPubliekeOpmerking(e.target.value)} placeholder="Zichtbaar voor flexwerkers" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={accepteerbaar} onCheckedChange={(c) => setAccepteerbaar(c === true)} />
                  Accepteerbaar
                </label>
              </div>
            </div>
          </div>

          {/* Right: Live preview */}
          <div className="hidden md:block">
            <div className="sticky top-0 rounded-xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-white/30 dark:border-white/10 p-5 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Samenvatting</h4>
              <div className="space-y-2 text-xs">
                <p className="font-medium text-foreground">{selectedOrgName || (isEdit ? editDienst?.sublocation?.location?.organization?.name : "—")} / {selectedSubName || (isEdit ? editDienst?.sublocation?.naam : "—")}</p>
                <p className="text-muted-foreground">{datum ? format(datum, "EEEE d MMMM yyyy", { locale: nl }) : "—"}</p>
                <p className="text-muted-foreground">{startTijd} - {eindTijd} ({duur.toFixed(1)} uur)</p>
                {pauze > 0 && <p className="text-muted-foreground">Pauze: {pauze} min</p>}
                <p className="text-muted-foreground">
                  {functieNiveau || "—"} · {dienstType} · {werkvorm}
                </p>
                {aantal > 1 && <p className="text-muted-foreground">{aantal} medewerkers gevraagd</p>}
                {tarief && <p className="text-muted-foreground">€{parseFloat(tarief).toFixed(2).replace(".", ",")} per uur</p>}
                {herhaling !== "geen" && herhalingAantal > 0 && (
                  <p className="text-muted-foreground">
                    {herhaling} t/m {herhalingTot ? format(herhalingTot, "d MMM", { locale: nl }) : "—"} → {herhalingAantal + 1} diensten
                  </p>
                )}
                <p className="text-muted-foreground">Status: {status === "concept" ? "Concept" : "Open"}</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuleren</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {isEdit ? "Opslaan" : "Dienst aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
