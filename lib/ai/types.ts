/** Shared between server and the chat widget – no server imports here. */

export type EnquiryForm = 'contact' | 'academy' | 'booking' | 'club' | 'massage';

export type ChatAction =
  | { type: 'quick_replies'; options: string[] }
  | {
      type: 'enquiry_form';
      form: EnquiryForm;
      leadType?: string;
      serviceInterest?: string;
      ageGroup?: string;
      reason?: string;
    }
  | { type: 'payment_link'; url: string; label: string };

export interface ChatReply {
  conversationId: string;
  reply: string;
  actions: ChatAction[];
  mode: 'openai' | 'guided';
}

export interface ChatRequestBody {
  conversationId?: string;
  visitorId: string;
  message: string;
}
