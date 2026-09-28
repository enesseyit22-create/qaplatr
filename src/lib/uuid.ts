const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asUuid(value: string | null | undefined): string | null {
  const id = String(value ?? '').trim();
  return UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}
