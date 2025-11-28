import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Pin, Trash2, Edit2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Note {
  id: string;
  content: string;
  user_id: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  user_email?: string;
}

interface ApplicationNotesProps {
  applicationId: string;
}

export function ApplicationNotes({ applicationId }: ApplicationNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [applicationId]);

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from("application_notes")
        .select("*")
        .eq("application_id", applicationId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error("Error loading notes:", error);
      toast.error("Fout bij laden van notities");
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      const { error } = await supabase
        .from("application_notes")
        .insert({
          application_id: applicationId,
          user_id: user.id,
          content: newNoteContent.trim(),
        });

      if (error) throw error;

      setNewNoteContent("");
      toast.success("Notitie toegevoegd");
      loadNotes();
    } catch (error) {
      console.error("Error adding note:", error);
      toast.error("Fout bij toevoegen van notitie");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (noteId: string, currentPinned: boolean) => {
    try {
      const { error } = await supabase
        .from("application_notes")
        .update({ is_pinned: !currentPinned })
        .eq("id", noteId);

      if (error) throw error;

      toast.success(currentPinned ? "Notitie losgemaakt" : "Notitie vastgepind");
      loadNotes();
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast.error("Fout bij vastzetten van notitie");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from("application_notes")
        .delete()
        .eq("id", noteId);

      if (error) throw error;

      toast.success("Notitie verwijderd");
      loadNotes();
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Fout bij verwijderen van notitie");
    }
  };

  const handleStartEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      const { error } = await supabase
        .from("application_notes")
        .update({ content: editContent.trim() })
        .eq("id", noteId);

      if (error) throw error;

      setEditingNoteId(null);
      toast.success("Notitie bijgewerkt");
      loadNotes();
    } catch (error) {
      console.error("Error updating note:", error);
      toast.error("Fout bij bijwerken van notitie");
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent("");
  };

  const getInitials = (userId: string) => {
    // Simple initials from user_id (first 2 chars)
    return userId.substring(0, 2).toUpperCase();
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Notities laden...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add new note */}
      <div className="space-y-2">
        <Textarea
          placeholder="Voeg een notitie toe..."
          value={newNoteContent}
          onChange={(e) => setNewNoteContent(e.target.value)}
          className="min-h-[80px]"
        />
        <Button 
          onClick={handleAddNote} 
          disabled={!newNoteContent.trim() || submitting}
          size="sm"
        >
          {submitting ? "Toevoegen..." : "Notitie toevoegen"}
        </Button>
      </div>

      {/* Notes list */}
      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nog geen notities. Voeg de eerste toe!
          </p>
        ) : (
          notes.map((note) => (
            <Card 
              key={note.id} 
              className={`${note.is_pinned ? 'border-primary/30 bg-primary/5' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="text-xs bg-muted">
                      {getInitials(note.user_id)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Gebruiker
                        </span>
                        {note.is_pinned && (
                          <Pin className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {format(new Date(note.created_at), "d MMM, HH:mm", { locale: nl })}
                      </span>
                    </div>

                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[60px]"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(note.id)}
                            disabled={!editContent.trim()}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Opslaan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Annuleren
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {note.content}
                        </p>
                        
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleTogglePin(note.id, note.is_pinned)}
                            className="h-7 px-2"
                          >
                            <Pin className={`h-3 w-3 ${note.is_pinned ? 'fill-current' : ''}`} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(note)}
                            className="h-7 px-2"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteNote(note.id)}
                            className="h-7 px-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
