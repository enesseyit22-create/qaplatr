export const SUPPORT_EMAIL = 'destek@qlaptr.com';
const SUPPORT_KEY = 'qapla_support_messages';

export type SupportTicket = {
  id: string;
  subject: string;
  company: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
};

export function supportMailto(ticket: Omit<SupportTicket, 'id' | 'created_at'>) {
  const subject = ticket.subject.trim() || 'QapLA destek';
  const body = [
    `Konu: ${subject}`,
    `Firma: ${ticket.company.trim() || '—'}`,
    `E-posta: ${ticket.email.trim()}`,
    `Telefon: ${ticket.phone.trim()}`,
    '',
    ticket.message.trim(),
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function saveSupportTicket(ticket: Omit<SupportTicket, 'id' | 'created_at'>) {
  const row: SupportTicket = {
    ...ticket,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(SUPPORT_KEY) ?? '[]') as SupportTicket[];
    const rows = Array.isArray(parsed) ? parsed : [];
    localStorage.setItem(SUPPORT_KEY, JSON.stringify([row, ...rows].slice(0, 50)));
  } catch {
    localStorage.setItem(SUPPORT_KEY, JSON.stringify([row]));
  }
  return row;
}

export function openSupportMail(ticket: Omit<SupportTicket, 'id' | 'created_at'>) {
  saveSupportTicket(ticket);
  window.location.href = supportMailto(ticket);
}
