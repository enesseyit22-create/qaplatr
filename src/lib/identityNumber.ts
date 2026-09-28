export type IdentityKind = 'tax' | 'national';

export type IdentityCheck =
  | { ok: true; value: string; kind: IdentityKind }
  | { ok: false; message: string };

function digitsOnly(raw: string) {
  return raw.replace(/\D/g, '');
}

function isNationalId(value: string) {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const odd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const even = digits[1] + digits[3] + digits[5] + digits[7];
  const tenth = ((odd * 7) - even) % 10;
  const normalizedTenth = (tenth + 10) % 10;
  if (digits[9] !== normalizedTenth) return false;
  const eleventh = digits.slice(0, 10).reduce((sum, item) => sum + item, 0) % 10;
  return digits[10] === eleventh;
}

function isTaxNumber(value: string) {
  if (!/^\d{10}$/.test(value) || value === '0000000000') return false;
  const digits = value.split('').map(Number);
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    const tmp = (digits[index] + (9 - index)) % 10;
    let next = (tmp * (2 ** (9 - index))) % 9;
    if (tmp !== 0 && next === 0) next = 9;
    sum += next;
  }
  return (10 - (sum % 10)) % 10 === digits[9];
}

export function checkTaxOrNationalId(raw: string): IdentityCheck {
  const value = digitsOnly(raw);
  if (!value) {
    return { ok: false, message: 'Vergi numarası (10 hane) veya T.C. kimlik numarası (11 hane) girin.' };
  }
  if (value.length === 10 && isTaxNumber(value)) return { ok: true, value, kind: 'tax' };
  if (value.length === 11 && isNationalId(value)) return { ok: true, value, kind: 'national' };
  if (value.length !== 10 && value.length !== 11) {
    return { ok: false, message: '10 haneli vergi numarası veya 11 haneli T.C. kimlik numarası girin.' };
  }
  return { ok: false, message: 'Vergi numarası veya T.C. kimlik numarası geçersiz.' };
}

export function identityLabel(kind?: IdentityKind | null) {
  return kind === 'national' ? 'T.C. kimlik numarası' : 'Vergi numarası';
}
