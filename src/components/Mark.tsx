/** Mitya's mark: a lowercase m with a speech dot. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M8.5 22V13.5m0 2.2c0-2 1.5-3.2 3.3-3.2s3.2 1.2 3.2 3.2V22m0-6.3c0-2 1.5-3.2 3.3-3.2s3.2 1.2 3.2 3.2V22"
        fill="none"
        stroke="var(--mark-ink, #fff)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="24.6" cy="9" r="2" fill="var(--mark-dot, #f2b84b)" />
    </svg>
  );
}
