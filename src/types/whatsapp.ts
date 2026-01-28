// WhatsApp Module TypeScript Interfaces

export interface WhatsAppChat {
  id: string;
  org_id: string;
  session_id: string;
  contact_id: string | null;
  chat_jid: string;
  chat_type: 'direct' | 'group';
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  linked_professional_id: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  contact?: WhatsAppContact | null;
  linked_professional?: { id: string; full_name: string } | null;
}

export interface WhatsAppContact {
  id: string;
  org_id: string;
  session_id: string;
  phone_number: string;
  display_name: string | null;
  professional_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessage {
  id: string;
  org_id: string;
  chat_id: string;
  message_id: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  message_body: string | null;
  sender_type: 'contact' | 'self' | 'user';
  sender_phone: string | null;
  sent_at: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'received';
  created_at: string;
}

export interface MessageGroup {
  date: Date;
  label: string; // "Vandaag", "Gisteren", "15 januari"
  messages: WhatsAppMessage[];
}

export type WhatsAppFilter = 'all' | 'unread' | 'linked';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'received';
