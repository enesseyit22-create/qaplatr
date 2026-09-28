export function digitsOnly(value?: string | null) {
  return (value ?? '').replace(/\D/g, '');
}

export function whatsappHref(value?: string | null) {
  const digits = digitsOnly(value);
  if (digits.length < 10) return null;
  const intl = digits.startsWith('90') ? digits : digits.startsWith('0') ? `90${digits.slice(1)}` : `90${digits}`;
  return `https://wa.me/${intl}`;
}

export function telHref(value?: string | null) {
  const digits = digitsOnly(value);
  if (digits.length < 10) return null;
  return `tel:+${digits.startsWith('90') ? digits : digits.startsWith('0') ? `90${digits.slice(1)}` : `90${digits}`}`;
}
