export function StoryMark({ className = 'h-6 w-6' }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2.4" y="2.4" width="19.2" height="19.2" rx="6.2" stroke="currentColor" strokeWidth="1.85" />
      <rect x="5.35" y="5.35" width="13.3" height="13.3" rx="4.1" stroke="currentColor" strokeWidth="1.55" opacity="0.55" />
      <path d="M10.1 8.55v6.9L16.05 12 10.1 8.55z" fill="currentColor" />
    </svg>
  );
}
