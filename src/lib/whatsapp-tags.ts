// WhatsApp Contact Tags Configuration

export interface TagConfig {
  id: string;
  label: string;
  color: {
    bg: string;
    text: string;
    border: string;
  };
}

export const WHATSAPP_TAGS: TagConfig[] = [
  { 
    id: 'client', 
    label: 'Cliënt', 
    color: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' } 
  },
  { 
    id: 'family', 
    label: 'Familie', 
    color: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' } 
  },
  { 
    id: 'colleague', 
    label: 'Collega', 
    color: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' } 
  },
  { 
    id: 'urgent', 
    label: 'Urgent', 
    color: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' } 
  },
  { 
    id: 'vip', 
    label: 'VIP', 
    color: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' } 
  },
  { 
    id: 'new', 
    label: 'Nieuw', 
    color: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' } 
  },
];

export function getTagConfig(tagId: string): TagConfig | undefined {
  return WHATSAPP_TAGS.find(t => t.id === tagId);
}
