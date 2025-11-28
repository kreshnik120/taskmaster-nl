import { useState } from "react";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Mail, Phone, MapPin, Edit2, Save, X, Plus, ChevronDown } from "lucide-react";

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

const SECTOR_COLORS: Record<string, string> = {
  "VVT": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  "GGZ": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  "GHZ": "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  "Jeugdzorg": "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  "Ziekenhuis": "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  "Thuiszorg": "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"
};

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

  // Collapsible state - smart defaults
  const [contactOpen, setContactOpen] = useState(true);
  const [matchingOpen, setMatchingOpen] = useState(
    !client.regio?.length || !client.sector?.length || !client.doelgroep?.length || !client.gezochte_functies?.length
  );

  // Calculate completeness score
  const calculateCompleteness = () => {
    const currentEmail = isEditing ? email : client.email;
    const currentPhone = isEditing ? phone : client.phone;
    const currentAddress = isEditing ? address : client.address;
    const currentRegio = isEditing ? regios : (client.regio || []);
    const currentSector = isEditing ? sectoren : (client.sector || []);
    const currentDoelgroep = isEditing ? doelgroepen : (client.doelgroep || []);
    const currentFuncties = isEditing ? functies : (client.gezochte_functies || []);

    let score = 0;
    const total = 7;

    if (currentEmail) score++;
    if (currentPhone) score++;
    if (currentAddress) score++;
    if (currentRegio.length > 0) score++;
    if (currentSector.length > 0) score++;
    if (currentDoelgroep.length > 0) score++;
    if (currentFuncties.length > 0) score++;

    return { score, total, percentage: Math.round((score / total) * 100) };
  };

  const completeness = calculateCompleteness();

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isEditing) handleSave();
      } else if (e.key === 'Escape') {
        if (isEditing) {
          handleCancel();
        } else {
          onOpenChange(false);
        }
      } else if (e.key === 'e' && !isEditing && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setIsEditing(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isEditing]);

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

  const handleInlineAdd = (section: 'contact' | 'matching') => {
    setIsEditing(true);
    setTimeout(() => {
      if (section === 'contact') {
        setContactOpen(true);
      } else if (section === 'matching') {
        setMatchingOpen(true);
      }
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5" />
              <span>{client.name}</span>
              <Badge 
                className={
                  client.organizations?.name === "ABCzorg" 
                    ? "bg-blue-600 hover:bg-blue-700 text-white" 
                    : "bg-orange-500 hover:bg-orange-600 text-white"
                }
              >
                {client.organizations?.name || "Onbekend"}
              </Badge>
              {/* Real-time completeness indicator */}
              <div className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" className="transform -rotate-90">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-muted opacity-20"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray={`${2 * Math.PI * 10}`}
                    strokeDashoffset={`${2 * Math.PI * 10 * (1 - completeness.score / completeness.total)}`}
                    className={completeness.percentage === 100 ? "text-green-500" : completeness.percentage >= 60 ? "text-primary" : "text-orange-500"}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-xs text-muted-foreground">{completeness.percentage}%</span>
              </div>
            </div>
            <div className="flex gap-2">
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} size="sm" variant="outline">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Bewerk <span className="ml-1 text-xs text-muted-foreground opacity-50">(E)</span>
                </Button>
              ) : (
                <>
                  <Button onClick={handleCancel} size="sm" variant="outline" disabled={saving}>
                    Annuleer <span className="ml-1 text-xs text-muted-foreground opacity-50">(Esc)</span>
                  </Button>
                  <Button onClick={handleSave} size="sm" disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Opslaan..." : "Opslaan"} <span className="ml-1 text-xs text-muted-foreground opacity-50">(⌘S)</span>
                  </Button>
                </>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0">
            <TabsTrigger value="overview" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Overzicht
            </TabsTrigger>
            <TabsTrigger value="matching" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Matching
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full group hover:opacity-70 transition-opacity">
                <h3 className="font-medium text-sm">Contactgegevens</h3>
                <ChevronDown className={`h-4 w-4 transition-transform ${contactOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Contactpersoon</Label>
                    {isEditing ? (
                      <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
                    ) : (
                      <p className="text-sm mt-1">{client.name}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Bedrijfsnaam</Label>
                    {isEditing ? (
                      <Input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1" />
                    ) : (
                      <p className="text-sm mt-1">{client.company}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {isEditing ? (
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email toevoegen" />
                    ) : !client.email ? (
                      <button onClick={() => handleInlineAdd('contact')} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg email toe →</span>
                      </button>
                    ) : (
                      <span>{client.email}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {isEditing ? (
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefoonnummer toevoegen" />
                    ) : !client.phone ? (
                      <button onClick={() => handleInlineAdd('contact')} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg telefoonnummer toe →</span>
                      </button>
                    ) : (
                      <span>{client.phone}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {isEditing ? (
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adres toevoegen" />
                    ) : !client.address ? (
                      <button onClick={() => handleInlineAdd('contact')} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>Voeg adres toe →</span>
                      </button>
                    ) : (
                      <span>{client.address}</span>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Notities</Label>
              {isEditing ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Extra opmerkingen over deze klant..."
                  rows={4}
                  className="mt-1"
                />
              ) : (
                <p className="text-sm mt-1 whitespace-pre-wrap text-muted-foreground">
                  {client.notes || "Geen notities"}
                </p>
              )}
            </div>
          </TabsContent>

          {/* Matching Tab */}
          <TabsContent value="matching" className="space-y-6 mt-6">
            <Collapsible open={matchingOpen} onOpenChange={setMatchingOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full group hover:opacity-70 transition-opacity">
                <h3 className="font-medium text-sm">Matching Criteria</h3>
                <ChevronDown className={`h-4 w-4 transition-transform ${matchingOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-5 mt-4">
                {/* Regio's */}
                <div>
                  <Label className="text-xs text-muted-foreground">Regio's</Label>
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
                        <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          <span>Voeg regio's toe →</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Sectoren */}
                <div>
                  <Label className="text-xs text-muted-foreground">Sectoren</Label>
                  {isEditing ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {SECTOREN.map((sector) => (
                        <Badge
                          key={sector}
                          variant={sectoren.includes(sector) ? "default" : "outline"}
                          className={`cursor-pointer ${sectoren.includes(sector) ? SECTOR_COLORS[sector] : ''}`}
                          onClick={() => toggleSector(sector)}
                        >
                          {sector}
                          {sectoren.includes(sector) && <X className="h-3 w-3 ml-1" />}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(client.sector || []).length > 0 ? (
                        client.sector?.map((s) => (
                          <Badge key={s} className={SECTOR_COLORS[s] || 'bg-secondary'}>{s}</Badge>
                        ))
                      ) : (
                        <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          <span>Voeg sectoren toe →</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Doelgroepen */}
                <div>
                  <Label className="text-xs text-muted-foreground">Doelgroepen</Label>
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
                          {doelgroepen.includes(doelgroep) && <X className="h-3 w-3 ml-1" />}
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
                        <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          <span>Voeg doelgroepen toe →</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Gezochte Functies */}
                <div>
                  <Label className="text-xs text-muted-foreground">Gezochte Functies</Label>
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
                          {functies.includes(functie) && <X className="h-3 w-3 ml-1" />}
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
                        <button onClick={() => handleInlineAdd('matching')} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          <span>Voeg functies toe →</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
