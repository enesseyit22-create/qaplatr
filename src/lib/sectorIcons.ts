import type { ExploreCategoryId } from '@/lib/sectors';

const wrap = (path: string) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#0f766e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

export const SECTOR_PIN_ICONS: Record<ExploreCategoryId, string> = {
  esnaf: wrap('<path d="M3 9.5 12 4l9 5.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/>'),
  restoran: wrap('<path d="M8 3v8M6 3v6a2 2 0 0 0 4 0V3"/><path d="M16 3v18"/><path d="M14 8h4"/>'),
  firsat: wrap('<path d="M12 3 14 8l5 .4-3.8 3.3L16.5 17 12 14.4 7.5 17l1.3-5.3L5 8.4 10 8Z"/>'),
  guzellik: wrap('<circle cx="6" cy="6" r="3"/><path d="M8.2 8.2 20 20"/><circle cx="6" cy="18" r="3"/><path d="M8.2 15.8 20 4"/>'),
  spor: wrap('<path d="M6.5 9v6M17.5 9v6M4 11v2M20 11v2M8 9h8M8 15h8"/>'),
  dekorasyon: wrap('<path d="M12 3v4"/><path d="M8 8c0 4 4 6 4 10"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="7" r="2"/><path d="M16 9c.5 3-1 6-4 9"/>'),
  eglence: wrap('<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.2"/><circle cx="17" cy="16" r="2.2"/>'),
  gelinlik: wrap('<path d="M12 4v3"/><path d="M9 21h6L12 8 9 21z"/><path d="M8 8c2-3 6-3 8 0"/>'),
  mobilya: wrap('<path d="M4 10h16v8H4z"/><path d="M6 10V8h12v2"/><path d="M7 18v2M17 18v2"/>'),
};
