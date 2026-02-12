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

const startTijden = tijdOpties(0, 23);
const eindTijden = tijdOpties(0, 23);
const functieNiveaus = ["HBO", "HBO-V", "VP5", "VP4", "VP3", "VIG", "Helpende Plus", "Helpende", "BEG4", "BEG3"];
const dienstTypes = ["dag", "avond", "nacht", "weekend"];
const certificeringOpties = ["BHV", "SKJ", "Medicatie", "Tilliften", "Voorbehouden handelingen", "Agressie", "EMB", "EVC"];

function berekeningDuur(start: string, eind: string, pauze: number): number {
  if (!start || !eind) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = eind.split(":").map(Number);
  let minuten = (eh * 60 + em) - (sh * 60 + sm);
  if (minuten <= 0) minuten += 24 * 60;
  return Math.max(0, (minuten - pauze) / 60);
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
  const [datums, setDatums] = useState<Date[]>([new Date()]);
  const [startTijd, setStartTijd] = useState("07:00");
  const [eindTijd, setEindTijd] = useState("15:00");
  const [pauze, setPauze] = useState(0);
  const [pauzeManual, setPauzeManual] = useState(false);
  const [functieNiveaus_selected, setFunctieNiveausSelected] = useState<string[]>([]);
  const [aantal, setAantal] = useState(1);
  const [werkvorm, setWerkvorm] = useState("ZZP");
  const [dienstType, setDienstType] = useState("dag");
  const [tarief, setTarief] = useState("");
  const [herhaling, setHerhaling] = useState("geen");
  const [herhalingTot, setHerhalingTot] = useState<Date | undefined>();
  const [priveOpmerking, setPriveOpmerking] = useState("");
  const [publiekeOpmerking, setPubliekeOpmerking] = useState("");
  const [flexwerkerOpmerking, setFlexwerkerOpmerking] = useState("");
  const [status, setStatus] = useState("concept");
  const [accepteerbaar, setAccepteerbaar] = useState(true);
  const [isSlaapdienst, setIsSlaapdienst] = useState(false);
  const [slaapStart, setSlaapStart] = useState("23:00");
  const [slaapEind, setSlaapEind] = useState("06:00");
  const [certificeringen, setCertificeringen] = useState<string[]>([]);
  const [preToewijzingId, setPreToewijzingId] = useState<string | null>(null);
  const [preToewijzingNaam, setPreToewijzingNaam] = useState("");
  const [proSearch, setProSearch] = useState("");
  const [proSearchOpen, setProSearchOpen] = useState(false);
  const [debouncedProSearch, setDebouncedProSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [titelManual, setTitelManual] = useState(false);

  // Debounce professional search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedProSearch(proSearch), 300);
    return () => clearTimeout(timer);
  }, [proSearch]);

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

  // Professional search query
  const { data: proResults = [], isLoading: proSearchLoading } = useQuery({
    queryKey: ["pro-search-modal", debouncedProSearch],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id, full_name, functie_niveau")
        .is("deleted_at", null)
        .in("status", ["actief", "beschikbaar"])
        .ilike("full_name", `%${debouncedProSearch}%`)
        .limit(10);
      return data ?? [];
    },
    enabled: proSearchOpen && debouncedProSearch.length >= 2,
    staleTime: 10000,
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
    setDatums([parseISO(editDienst.datum)]);
    setStartTijd(editDienst.start_tijd?.slice(0, 5) ?? "07:00");
    setEindTijd(editDienst.eind_tijd?.slice(0, 5) ?? "15:00");
    setPauze(editDienst.pauze_minuten ?? 0);
    setPauzeManual(true);
    setFunctieNiveausSelected(editDienst.gevraagd_functie_niveau ?? []);
    setAantal(editDienst.gevraagd_aantal ?? 1);
    setWerkvorm(editDienst.werkvorm ?? "ZZP");
    setDienstType(editDienst.dienst_type ?? "dag");
    setTarief(editDienst.tarief_per_uur?.toString() ?? "");
    setHerhaling(editDienst.herhaling ?? "geen");
    setPriveOpmerking(editDienst.prive_opmerking ?? "");
    setPubliekeOpmerking(editDienst.publieke_opmerking ?? "");
    setFlexwerkerOpmerking(editDienst.flexwerker_opmerking ?? "");
    setStatus(editDienst.status);
    setAccepteerbaar(editDienst.accepteerbaar);
    setIsSlaapdienst(editDienst.is_slaapdienst ?? false);
    setSlaapStart(editDienst.slaap_start_tijd?.slice(0, 5) ?? "23:00");
    setSlaapEind(editDienst.slaap_eind_tijd?.slice(0, 5) ?? "06:00");
    setCertificeringen(editDienst.vereiste_certificeringen ?? []);
    setTitelManual(true);
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
      setTitel(""); setDatums([new Date()]); setStartTijd("07:00"); setEindTijd("15:00");
      setPauze(0); setPauzeManual(false); setFunctieNiveausSelected([]); setAantal(1); setWerkvorm("ZZP");
      setDienstType("dag"); setTarief(""); setHerhaling("geen"); setHerhalingTot(undefined);
      setPriveOpmerking(""); setPubliekeOpmerking(""); setFlexwerkerOpmerking(""); setStatus("concept");
      setAccepteerbaar(true); setIsSlaapdienst(false); setSlaapStart("23:00"); setSlaapEind("06:00");
      setCertificeringen([]); setPreToewijzingId(null); setPreToewijzingNaam(""); setProSearch(""); setProSearchOpen(false);
      setTitelManual(false);
    }
  }, [open]);

  const duur = useMemo(() => berekeningDuur(startTijd, eindTijd, pauze), [startTijd, eindTijd, pauze]);

  // Auto-pauze op basis van bruto uren (CAO-richtlijn)
  useEffect(() => {
    if (pauzeManual) return;
    const brutoMinuten = (() => {
      if (!startTijd || !eindTijd) return 0;
      const [sh, sm] = startTijd.split(":").map(Number);
      const [eh, em] = eindTijd.split(":").map(Number);
      let min = (eh * 60 + em) - (sh * 60 + sm);
      if (min <= 0) min += 24 * 60;
      return min;
    })();
    const brutoUren = brutoMinuten / 60;
    if (brutoUren > 10) setPauze(60);
    else if (brutoUren > 8) setPauze(45);
    else if (brutoUren > 5.5) setPauze(30);
    else setPauze(0);
  }, [startTijd, eindTijd, pauzeManual]);

  // Auto-detect dienst type based on times
  useEffect(() => {
    if (!startTijd || !eindTijd || titelManual) return;
    const startHour = parseInt(startTijd.split(":")[0]);
    if (startTijd > eindTijd) {
      setDienstType("nacht");
    } else if (startHour >= 22 || startHour < 6) {
      setDienstType("nacht");
    } else if (startHour >= 15) {
      setDienstType("avond");
    } else {
      setDienstType("dag");
    }
  }, [startTijd, eindTijd, titelManual]);

  const herhalingAantal = useMemo(() => {
    if (herhaling === "geen" || datums.length === 0 || !herhalingTot) return 0;
    return berekenHerhalingen(datums[0], herhalingTot, herhaling);
  }, [herhaling, datums, herhalingTot]);

  const handleSave = async () => {
    const targetSublocationId = sublocationId || (editDienst?.sublocation?.id);
    if (!targetSublocationId || datums.length === 0 || !startTijd || !eindTijd || !titel.trim()) {
      toast.error("Vul alle verplichte velden in");
      return;
    }
    if (startTijd === eindTijd) {
      toast.error("Start- en eindtijd mogen niet gelijk zijn");
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
        datum: format(datums[0], "yyyy-MM-dd"),
        start_tijd: startTijd + ":00",
        eind_tijd: eindTijd + ":00",
        pauze_minuten: pauze,
        gevraagd_functie_niveau: functieNiveaus_selected,
        gevraagd_aantal: aantal,
        werkvorm: werkvorm || null,
        dienst_type: dienstType,
        tarief_per_uur: tarief ? parseFloat(tarief) : null,
        herhaling,
        prive_opmerking: priveOpmerking || null,
        publieke_opmerking: publiekeOpmerking || null,
        flexwerker_opmerking: flexwerkerOpmerking || null,
        vereiste_certificeringen: certificeringen,
        status,
        accepteerbaar,
        is_slaapdienst: isSlaapdienst,
        slaap_start_tijd: isSlaapdienst ? slaapStart + ":00" : null,
        slaap_eind_tijd: isSlaapdienst ? slaapEind + ":00" : null,
        bron: isEdit ? editDienst!.bron : "handmatig",
        org_id: userOrg.org_id,
        aangemaakt_door: user.id,
      };

      if (isEdit) {
        const { error } = await supabase.from("diensten").update(dienstData).eq("id", editDienst!.id);
        if (error) throw error;
        toast.success("Dienst bijgewerkt!");
      } else {
        // Multi-date: maak 1 dienst per geselecteerde datum
        const allDatums = datums.map(d => format(d, "yyyy-MM-dd"));
        const insertRecords = allDatums.map(d => ({
          ...dienstData,
          datum: d,
        }));

        const { data: inserted, error } = await supabase
          .from("diensten")
          .insert(insertRecords)
          .select("id");
        if (error) throw error;

        // Pre-toewijzing alleen op eerste dienst
        if (preToewijzingId && inserted?.[0]?.id) {
          const { error: toewijzingError } = await supabase.from("dienst_toewijzingen").insert({
            dienst_id: inserted[0].id,
            professional_id: preToewijzingId,
            status: "toegewezen",
            toegewezen_door: user.id,
          });
          if (toewijzingError) {
            console.error("Pre-toewijzing error:", toewijzingError);
            toast.error("Diensten aangemaakt, maar toewijzing is mislukt");
          }
        }

        // Herhaling: voor ELKE ingevoegde dienst herhalingen aanmaken
        if (herhaling !== "geen" && herhalingAantal > 0 && herhalingTot) {
          const herhalingRecords: Array<typeof dienstData & { herhaling_parent_id: string; bron: string }> = [];
          for (const parent of (inserted || [])) {
            const parentDatum = parseISO(
              allDatums[(inserted || []).indexOf(parent)]
            );
            for (let i = 1; i <= herhalingAantal; i++) {
              let newDatum: Date;
              if (herhaling === "dagelijks") newDatum = addDays(parentDatum, i);
              else if (herhaling === "wekelijks") newDatum = addWeeks(parentDatum, i);
              else newDatum = addWeeks(parentDatum, i * 2);

              herhalingRecords.push({
                ...dienstData,
                datum: format(newDatum, "yyyy-MM-dd"),
                herhaling_parent_id: parent.id,
                herhaling: "geen",
                bron: "herhaling",
              });
            }
          }
          if (herhalingRecords.length > 0) {
            const { error: hErr } = await supabase.from("diensten").insert(herhalingRecords);
            if (hErr) {
              console.error("Herhaling error:", hErr);
              toast.error(`Diensten aangemaakt, maar herhalingen zijn mislukt`);
            }
          }
        }

        const totaal = allDatums.length * (1 + (herhaling !== "geen" ? herhalingAantal : 0));
        toast.success(`${totaal} dienst${totaal > 1 ? "en" : ""} aangemaakt!`);
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
              <Label className="text-xs">Datum{!isEdit && "(s)"} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full h-9 text-xs justify-start", datums.length === 0 && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                    {isEdit
                      ? (datums[0] ? format(datums[0], "d MMMM yyyy", { locale: nl }) : "Kies datum")
                      : datums.length === 0
                        ? "Kies datum(s)"
                        : datums.length === 1
                          ? format(datums[0], "d MMMM yyyy", { locale: nl })
                          : `${datums.length} datums geselecteerd`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  {isEdit ? (
                    <Calendar
                      mode="single"
                      selected={datums[0]}
                      onSelect={(d) => d && setDatums([d])}
                      locale={nl}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      className="p-3 pointer-events-auto"
                    />
                  ) : (
                    <Calendar
                      mode="multiple"
                      selected={datums}
                      onSelect={(d) => setDatums(d || [])}
                      locale={nl}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      className="p-3 pointer-events-auto"
                    />
                  )}
                </PopoverContent>
              </Popover>
              {!isEdit && datums.length > 1 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {datums
                    .sort((a, b) => a.getTime() - b.getTime())
                    .map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/50 dark:bg-slate-800/50 border border-white/20 dark:border-white/10">
                        {format(d, "d MMM", { locale: nl })}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDatums(prev => prev.filter((_, idx) => idx !== i))}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
              )}
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
            {duur > 0 && (
              <p className="text-[10px] text-muted-foreground">
                ({duur.toFixed(1)} uur netto){startTijd > eindTijd && " — nachtdienst"}
              </p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Pauze</Label>
                {!pauzeManual && (
                  <span className="text-[10px] text-muted-foreground">auto (CAO)</span>
                )}
              </div>
              <Select value={String(pauze)} onValueChange={(v) => { setPauze(Number(v)); setPauzeManual(true); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 15, 30, 45, 60].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
                </SelectContent>
              </Select>
              {pauzeManual && (
                <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={() => setPauzeManual(false)}>
                  Terug naar auto
                </button>
              )}
            </div>

            {/* Slaapdienst */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={isSlaapdienst} onCheckedChange={(c) => setIsSlaapdienst(c === true)} />
                Slaapdienst
              </label>
              {isSlaapdienst && (
                <div className="grid grid-cols-2 gap-3 pl-6 border-l-2 border-indigo-300 dark:border-indigo-700">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-indigo-600 dark:text-indigo-400">Slaap start</Label>
                    <Select value={slaapStart} onValueChange={setSlaapStart}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{tijdOpties(0, 23).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-indigo-600 dark:text-indigo-400">Slaap eind</Label>
                    <Select value={slaapEind} onValueChange={setSlaapEind}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{tijdOpties(0, 23).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Functieniveau checkboxes */}
            <div className="space-y-2">
              <Label className="text-xs">Functieniveau(s)</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {functieNiveaus.map((niveau) => (
                  <label key={niveau} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={functieNiveaus_selected.includes(niveau)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFunctieNiveausSelected(prev => [...prev, niveau]);
                        } else {
                          setFunctieNiveausSelected(prev => {
                            const next = prev.filter(n => n !== niveau);
                            if (next.length === 0) setCertificeringen([]);
                            return next;
                          });
                        }
                      }}
                    />
                    {niveau}
                  </label>
                ))}
              </div>
            </div>

            {/* Certificeringen */}
            {functieNiveaus_selected.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Vereiste certificeringen</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {certificeringOpties.map((cert) => (
                    <label key={cert} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={certificeringen.includes(cert)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setCertificeringen(prev => [...prev, cert]);
                          } else {
                            setCertificeringen(prev => prev.filter(c => c !== cert));
                          }
                        }}
                      />
                      {cert}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Aantal medewerkers */}
            <div className="space-y-1.5">
              <Label className="text-xs">Aantal medewerkers</Label>
              <Input type="number" min={1} max={10} className="h-9 text-xs" value={aantal} onChange={(e) => setAantal(Math.max(1, Math.min(10, Number(e.target.value))))} />
            </div>

            {/* Pre-toewijzing — alleen bij nieuwe dienst */}
            {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Direct toewijzen (optioneel)</Label>
              {preToewijzingId ? (
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-white/30 dark:border-white/10 bg-emerald-50 dark:bg-emerald-900/20">
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex-1">{preToewijzingNaam}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => { setPreToewijzingId(null); setPreToewijzingNaam(""); }}>
                    ✕
                  </Button>
                </div>
              ) : (
                <Popover open={proSearchOpen} onOpenChange={setProSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-9 text-xs justify-start text-muted-foreground">
                      Zoek flexwerker...
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    <Input
                      className="h-8 text-xs mb-2"
                      placeholder="Naam zoeken..."
                      value={proSearch}
                      onChange={(e) => setProSearch(e.target.value)}
                      autoFocus
                    />
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {proSearchLoading && <p className="text-xs text-muted-foreground p-2">Zoeken...</p>}
                      {proResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent/50 transition-colors"
                          onClick={() => {
                            setPreToewijzingId(p.id);
                            setPreToewijzingNaam(`${p.full_name} (${p.functie_niveau ?? "—"})`);
                            setProSearchOpen(false);
                            setProSearch("");
                          }}
                        >
                          <span className="font-medium">{p.full_name}</span>
                          <span className="text-muted-foreground ml-1">— {p.functie_niveau ?? "—"}</span>
                        </button>
                      ))}
                      {debouncedProSearch.length >= 2 && !proSearchLoading && proResults.length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">Geen resultaten</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            )}

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
                    <Calendar mode="single" selected={herhalingTot} onSelect={setHerhalingTot} locale={nl} disabled={(d) => datums.length > 0 ? d <= datums[0] : false} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                {herhalingAantal > 0 && (
                  <p className="text-[10px] text-muted-foreground">→ {herhalingAantal + 1} diensten worden aangemaakt</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Publieke opmerking</Label>
              <Textarea className="text-xs min-h-[60px]" value={publiekeOpmerking} onChange={(e) => setPubliekeOpmerking(e.target.value)} placeholder="Zichtbaar voor alle flexwerkers" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Flexwerker opmerking</Label>
              <Textarea className="text-xs min-h-[60px]" value={flexwerkerOpmerking} onChange={(e) => setFlexwerkerOpmerking(e.target.value)} placeholder="Alleen zichtbaar na toewijzing (parkeercode, pincode, etc.)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Privé opmerking</Label>
              <Textarea className="text-xs min-h-[60px]" value={priveOpmerking} onChange={(e) => setPriveOpmerking(e.target.value)} placeholder="Alleen zichtbaar voor bureau" />
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
                <p className="text-muted-foreground">
                  {datums.length === 0
                    ? "—"
                    : datums.length === 1
                      ? format(datums[0], "EEEE d MMMM yyyy", { locale: nl })
                      : `${datums.length} datums: ${datums.sort((a, b) => a.getTime() - b.getTime()).map(d => format(d, "d MMM", { locale: nl })).join(", ")}`
                  }
                </p>
                <p className="text-muted-foreground">
                  {startTijd} - {eindTijd} ({duur.toFixed(1)} uur)
                  {startTijd > eindTijd && " (nachtdienst)"}
                </p>
                {pauze > 0 && <p className="text-muted-foreground">Pauze: {pauze} min</p>}
                {isSlaapdienst && (
                  <p className="text-muted-foreground">🛏️ Slaapdienst: {slaapStart} - {slaapEind}</p>
                )}
                <p className="text-muted-foreground">
                  {functieNiveaus_selected.length > 0 ? functieNiveaus_selected.join(", ") : "—"} · {dienstType} · {werkvorm}
                </p>
                {certificeringen.length > 0 && (
                  <p className="text-muted-foreground">Certificeringen: {certificeringen.join(", ")}</p>
                )}
                {preToewijzingNaam && (
                  <p className="text-muted-foreground">👤 {preToewijzingNaam}</p>
                )}
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
