import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";

interface StatusRij {
  status: string;
  aantal: number;
  uren: number;
}

interface BendyReferentie {
  open: number;
  ingepland: number;
  uren: number;
}

// Bendy referentiecijfers per week (handmatig bijgewerkt)
const BENDY_REFERENTIES: Record<number, BendyReferentie> = {
  14: { open: 14, ingepland: 196, uren: 1388.75 },
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  volledig_bezet: "Ingepland",
  deels_bezet: "Deels bezet",
  geannuleerd: "Geannuleerd",
  voltooid: "Voltooid",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  volledig_bezet: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  deels_bezet: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  geannuleerd: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  voltooid: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

export function WeekVergelijking() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<StatusRij[]>([]);
  const [loading, setLoading] = useState(false);

  const currentWeekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekNummer = getISOWeek(currentWeekStart);
  const referentie = BENDY_REFERENTIES[weekNummer];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const from = format(currentWeekStart, "yyyy-MM-dd");
      const to = format(currentWeekEnd, "yyyy-MM-dd");
      
      const { data: diensten, error } = await supabase
        .from("diensten")
        .select("status, start_tijd, eind_tijd")
        .gte("datum", from)
        .lte("datum", to);

      if (error) throw error;

      const statusMap: Record<string, { aantal: number; uren: number }> = {};
      (diensten || []).forEach((d: any) => {
        const s = d.status || "onbekend";
        if (!statusMap[s]) statusMap[s] = { aantal: 0, uren: 0 };
        statusMap[s].aantal++;
        if (d.start_tijd && d.eind_tijd) {
          const start = new Date(d.start_tijd).getTime();
          const end = new Date(d.eind_tijd).getTime();
          statusMap[s].uren += (end - start) / 3600000;
        }
      });

      setData(
        Object.entries(statusMap)
          .map(([status, v]) => ({ status, aantal: v.aantal, uren: Math.round(v.uren * 10) / 10 }))
          .sort((a, b) => b.aantal - a.aantal)
      );
    } catch (e) {
      console.error("Week vergelijking fout:", e);
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart.toISOString()]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totaalAantal = data.reduce((s, r) => s + r.aantal, 0);
  const totaalUren = Math.round(data.reduce((s, r) => s + r.uren, 0) * 10) / 10;
  const openAantal = data.find(r => r.status === "open")?.aantal || 0;
  const ingeplandAantal = data.find(r => r.status === "volledig_bezet")?.aantal || 0;

  const afwijkingen: string[] = [];
  if (referentie) {
    if (Math.abs(openAantal - referentie.open) / referentie.open > 0.05)
      afwijkingen.push(`Open: ${openAantal} vs ${referentie.open} (Bendy)`);
    if (Math.abs(ingeplandAantal - referentie.ingepland) / referentie.ingepland > 0.05)
      afwijkingen.push(`Ingepland: ${ingeplandAantal} vs ${referentie.ingepland} (Bendy)`);
    if (Math.abs(totaalUren - referentie.uren) / referentie.uren > 0.05)
      afwijkingen.push(`Uren: ${totaalUren} vs ${referentie.uren} (Bendy)`);
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            📊 Week Vergelijking
            {afwijkingen.length > 0 ? (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {afwijkingen.length} afwijking{afwijkingen.length > 1 ? "en" : ""}
              </Badge>
            ) : referentie ? (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                In sync
              </Badge>
            ) : null}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              Week {weekNummer} — {format(currentWeekStart, "d MMM", { locale: nl })} t/m {format(currentWeekEnd, "d MMM", { locale: nl })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {afwijkingen.length > 0 && (
          <div className="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-xs space-y-0.5">
            {afwijkingen.map((a, i) => <div key={i}>⚠️ {a}</div>)}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aantal</TableHead>
              <TableHead className="text-right">Uren</TableHead>
              {referentie && <TableHead className="text-right">Bendy ref.</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(row => (
              <TableRow key={row.status}>
                <TableCell>
                  <Badge className={STATUS_COLORS[row.status] || "bg-muted text-muted-foreground"} variant="secondary">
                    {STATUS_LABELS[row.status] || row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{row.aantal}</TableCell>
                <TableCell className="text-right font-mono">{row.uren}</TableCell>
                {referentie && (
                  <TableCell className="text-right font-mono text-muted-foreground text-xs">
                    {row.status === "open" ? referentie.open : row.status === "volledig_bezet" ? referentie.ingepland : "—"}
                  </TableCell>
                )}
              </TableRow>
            ))}
            <TableRow className="font-semibold border-t-2">
              <TableCell>Totaal</TableCell>
              <TableCell className="text-right font-mono">{totaalAantal}</TableCell>
              <TableCell className="text-right font-mono">{totaalUren}</TableCell>
              {referentie && <TableCell className="text-right font-mono text-muted-foreground text-xs">{referentie.uren}</TableCell>}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
