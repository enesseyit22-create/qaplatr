const PIN =
  'M9.4 21.2s-5.6-5.7-5.6-10.1a5.6 5.6 0 0 1 11.2 0c0 4.4-5.6 10.1-5.6 10.1z';

export function ExploreTabIcon({
  active,
  className = 'h-6 w-6',
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {active ? (
        <path
          d={`${PIN}M9.4 9.25a1.85 1.85 0 1 0 .01 0z`}
          fill="currentColor"
          fillRule="evenodd"
        />
      ) : null}
      <path d={PIN} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      {active ? null : (
        <circle cx="9.4" cy="11.1" r="1.7" stroke="currentColor" strokeWidth="1.7" />
      )}
      <path
        d="M13.01 4.35A7.7 7.7 0 0 1 16.93 9.55"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12.92 2.43A9.4 9.4 0 0 1 18.75 10.17"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
