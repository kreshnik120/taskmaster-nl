import { useState } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWhatsAppBackground, BackgroundOption } from "@/hooks/whatsapp/useWhatsAppBackground";
import { Palette } from "lucide-react";

interface BackgroundOptionConfig {
  id: BackgroundOption;
  name: string;
  lightPreview: string;
  darkPreview: string;
}

const backgroundOptions: BackgroundOptionConfig[] = [
  { 
    id: 'default', 
    name: 'WhatsApp Classic', 
    lightPreview: '#e5ddd5',
    darkPreview: '#0f172a'
  },
  { 
    id: 'solid-light', 
    name: 'Lichtgrijs', 
    lightPreview: '#f3f4f6',
    darkPreview: '#0f172a'
  },
  { 
    id: 'solid-dark', 
    name: 'Donkergrijs', 
    lightPreview: '#d1d5db',
    darkPreview: '#1e293b'
  },
  { 
    id: 'gradient', 
    name: 'Gradient', 
    lightPreview: 'linear-gradient(to bottom, #f3f4f6, #e5e7eb)',
    darkPreview: 'linear-gradient(to bottom, #0f172a, #1e293b)'
  },
  { 
    id: 'pattern', 
    name: 'Doodle', 
    lightPreview: '#e5ddd5',
    darkPreview: '#0f172a'
  },
  { 
    id: 'mint', 
    name: 'Mint', 
    lightPreview: '#d1fae5',
    darkPreview: '#022c22'
  },
  { 
    id: 'blue', 
    name: 'Hemelsblauw', 
    lightPreview: '#e0f2fe',
    darkPreview: '#082f49'
  },
  { 
    id: 'peach', 
    name: 'Perzik', 
    lightPreview: '#ffedd5',
    darkPreview: '#431407'
  },
];

export function WhatsAppBackgroundPicker() {
  const { background, setBackground } = useWhatsAppBackground();
  const [open, setOpen] = useState(false);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const handleSelect = (option: BackgroundOption) => {
    setBackground(option);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          aria-label="Kies achtergrond"
        >
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="text-sm font-medium mb-3">Achtergrond</p>
        <div className="grid grid-cols-4 gap-2">
          {backgroundOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={cn(
                "w-14 h-14 rounded-lg border-2 transition-all relative overflow-hidden",
                "hover:scale-105",
                background === option.id 
                  ? "border-primary ring-2 ring-primary/20" 
                  : "border-border hover:border-primary/50"
              )}
              style={{ 
                background: isDark ? option.darkPreview : option.lightPreview 
              }}
              title={option.name}
              aria-label={`Selecteer ${option.name} achtergrond`}
              aria-pressed={background === option.id}
            >
              {/* Pattern overlay for doodle option */}
              {option.id === 'pattern' && (
                <div 
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.15) 1px, transparent 1px)',
                    backgroundSize: '8px 8px'
                  }}
                />
              )}
              
              {/* Checkmark for selected */}
              {background === option.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Check className="h-5 w-5 text-white drop-shadow" />
                </div>
              )}
            </button>
          ))}
        </div>
        
        {/* Option name display */}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {backgroundOptions.find(o => o.id === background)?.name}
        </p>
      </PopoverContent>
    </Popover>
  );
}
