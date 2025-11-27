import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Mail, Phone, MapPin, Edit2, Save, X, Plus } from "lucide-react";

interface ClientDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: {
    id: string;
    name: string;
    company: string;
    org_id: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    regio?: string[] | null;
    sector?: string[] | null;
    doelgroep?: string[] | null;
    gezochte_functies?: string[] | null;
    organizations?: {
      name: string;
    };
  };
  onUpdate: () => void;
}

const SECTOREN = ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis", "Thuiszorg"];
const DOELGROEPEN = ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving"];
const FUNCTIES = ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"];

export default function ClientDetailModal({ open, onOpenChange, client, onUpdate }: ClientDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState(client.name);
  const [company, setCompany] = useState(client.company);
  const [email, setEmail] = useState(client.email || "");
  const [phone, setPhone] = useState(client.phone || "");
  const [address, setAddress] = useState(client.address || "");
  const [notes, setNotes] = useState(client.notes || "");
  const [regios, setRegios] = useState<string[]>(client.regio || []);
  const [sectoren, setSectoren] = useState<string[]>(client.sector || []);
  const [doelgroepen, setDoelgroepen] = useState<string[]>(client.doelgroep || []);
  const [functies, setFuncties] = useState<string[]>(client.gezochte_functies || []);
  const [newRegio, setNewRegio] = useState("");

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          name,
          company,
          email: email || null,
          phone: phone || null,
          address: address || null,
          notes: notes || null,
          regio: regios.length > 0 ? regios : null,
          sector: sectoren.length > 0 ? sectoren : null,
          doelgroep: doelgroepen.length > 0 ? doelgroepen : null,
          gezochte_functies: functies.length > 0 ? functies : null,
        })
        .eq("id", client.id);

      if (error) throw error;

      toast.success("Klant bijgewerkt");
      setIsEditing(false);
      onUpdate();
    } catch (error: any) {
      console.error("Error updating client:", error);
      toast.error("Kon klant niet bijwerken");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setName(client.name);
    setCompany(client.company);
    setEmail(client.email || "");
    setPhone(client.phone || "");
    setAddress(client.address || "");
    setNotes(client.notes || "");
    setRegios(client.regio || []);
    setSectoren(client.sector || []);
    setDoelgroepen(client.doelgroep || []);
    setFuncties(client.gezochte_functies || []);
    setIsEditing(false);
  };

  const toggleSector = (sector: string) => {
    setSectoren(prev => 
      prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
    );
  };

  const toggleDoelgroep = (doelgroep: string) => {
    setDoelgroepen(prev =>
      prev.includes(doelgroep) ? prev.filter(d => d !== doelgroep) : [...prev, doelgroep]
    );
  };

  const toggleFunctie = (functie: string) => {
    setFuncties(prev =>
      prev.includes(functie) ? prev.filter(f => f !== functie) : [...prev, functie]
    );
  };

  const addRegio = () => {
    if (newRegio.trim() && !regios.includes(newRegio.trim().toLowerCase())) {
      setRegios([...regios, newRegio.trim().toLowerCase()]);
      setNewRegio("");
    }
  };

  const removeRegio = (regio: string) => {
    setRegios(regios.filter(r => r !== regio));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <span>{client.name}</span>
              <Badge variant={client.organizations?.name === "ABCzorg" ? "default" : "secondary"}>
                {client.organizations?.name || "Onbekend"}
              </Badge>
            </div>
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Bewerken
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basisinformatie */}
          <div className="space-y-4">
            <h3 className="font-semibold">Basisinformatie</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Contactpersoon</Label>
                {isEditing ? (
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                ) : (
                  <p className="text-sm mt-1">{client.name}</p>
                )}
              </div>
              <div>
                <Label>Bedrijfsnaam</Label>
                {isEditing ? (
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} />
                ) : (
                  <p className="text-sm mt-1">{client.company}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email
                </Label>
                {isEditing ? (
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                ) : (
                  <p className="text-sm mt-1">{client.email || "-"}</p>
                )}
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Telefoon
                </Label>
                {isEditing ? (
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                ) : (
                  <p className="text-sm mt-1">{client.phone || "-"}</p>
                )}
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Adres
              </Label>
              {isEditing ? (
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              ) : (
                <p className="text-sm mt-1">{client.address || "-"}</p>
              )}
            </div>
          </div>

          {/* Matching Criteria */}
          <div className="space-y-4">
            <h3 className="font-semibold">Matching Criteria</h3>
            
            {/* Regio's */}
            <div>
              <Label>Regio's</Label>
              {isEditing ? (
                <div className="space-y-2 mt-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Bijv. Utrecht, Nijmegen"
                      value={newRegio}
                      onChange={(e) => setNewRegio(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRegio())}
                    />
                    <Button size="sm" onClick={addRegio}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {regios.map((regio) => (
                      <Badge key={regio} variant="secondary" className="cursor-pointer" onClick={() => removeRegio(regio)}>
                        {regio} <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(client.regio || []).length > 0 ? (
                    client.regio?.map((r) => (
                      <Badge key={r} variant="secondary">{r}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Geen regio's opgegeven</span>
                  )}
                </div>
              )}
            </div>

            {/* Sectoren */}
            <div>
              <Label>Sectoren</Label>
              {isEditing ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {SECTOREN.map((sector) => (
                    <Badge
                      key={sector}
                      variant={sectoren.includes(sector) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleSector(sector)}
                    >
                      {sector}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(client.sector || []).length > 0 ? (
                    client.sector?.map((s) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Geen sectoren opgegeven</span>
                  )}
                </div>
              )}
            </div>

            {/* Doelgroepen */}
            <div>
              <Label>Doelgroepen</Label>
              {isEditing ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {DOELGROEPEN.map((doelgroep) => (
                    <Badge
                      key={doelgroep}
                      variant={doelgroepen.includes(doelgroep) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleDoelgroep(doelgroep)}
                    >
                      {doelgroep}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(client.doelgroep || []).length > 0 ? (
                    client.doelgroep?.map((d) => (
                      <Badge key={d} variant="secondary">{d}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Geen doelgroepen opgegeven</span>
                  )}
                </div>
              )}
            </div>

            {/* Gezochte Functies */}
            <div>
              <Label>Gezochte Functies</Label>
              {isEditing ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {FUNCTIES.map((functie) => (
                    <Badge
                      key={functie}
                      variant={functies.includes(functie) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleFunctie(functie)}
                    >
                      {functie}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(client.gezochte_functies || []).length > 0 ? (
                    client.gezochte_functies?.map((f) => (
                      <Badge key={f} variant="secondary">{f}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Geen functies opgegeven</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notities */}
          <div>
            <Label>Notities</Label>
            {isEditing ? (
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Extra opmerkingen over deze klant..."
                rows={4}
                className="mt-2"
              />
            ) : (
              <p className="text-sm mt-2 whitespace-pre-wrap">{client.notes || "Geen notities"}</p>
            )}
          </div>

          {/* Action buttons */}
          {isEditing && (
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                Annuleren
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
