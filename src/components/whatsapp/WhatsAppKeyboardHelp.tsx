import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface WhatsAppKeyboardHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function KeyboardKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border min-w-[24px] text-center">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <KeyboardKey key={i}>{key}</KeyboardKey>
        ))}
      </div>
      <span className="text-sm text-muted-foreground ml-4">{description}</span>
    </div>
  );
}

function ShortcutSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function WhatsAppKeyboardHelp({ open, onOpenChange }: WhatsAppKeyboardHelpProps) {
  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <ShortcutSection title="Algemeen">
            <ShortcutRow keys={[mod, 'K']} description="Open command palette" />
            <ShortcutRow keys={[mod, 'F']} description="Focus zoekveld" />
            <ShortcutRow keys={['?']} description="Toon deze help" />
          </ShortcutSection>

          <ShortcutSection title="Navigatie">
            <ShortcutRow keys={['↑', '↓']} description="Navigeer door chats" />
            <ShortcutRow keys={['Enter']} description="Open geselecteerde chat" />
            <ShortcutRow keys={['Esc']} description="Ga terug / Sluit panel" />
            <ShortcutRow keys={['i']} description="Toggle profiel panel" />
          </ShortcutSection>

          <ShortcutSection title="Acties (chat geselecteerd)">
            <ShortcutRow keys={[mod, 'P']} description="Pin / Losmaken" />
            <ShortcutRow keys={[mod, 'M']} description="Mute / Demping opheffen" />
            <ShortcutRow keys={[mod, '⇧', 'A']} description="Archiveren" />
          </ShortcutSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}
