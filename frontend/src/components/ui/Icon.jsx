const PATHS = {
  logo: (
    <>
      <path d="M12 2.8 18.5 6.6v7.9a6.5 6.5 0 0 1-13 0V6.6z" />
      <path d="M12 7.6v.01" strokeWidth="2.4" />
      <path d="M9.2 14.6a2.8 2.8 0 0 0 5.6 0" />
    </>
  ),
  dog: (
    <>
      <path d="M8 5.5h8a3 3 0 0 1 3 3V13a7 7 0 0 1-14 0V8.5a3 3 0 0 1 3-3z" />
      <path d="M5.2 7.4 3.4 6v5.6L5 13.2M18.8 7.4 20.6 6v5.6L19 13.2" />
      <path d="M9.5 11v.01M14.5 11v.01" strokeWidth="2.2" />
      <path d="M10.8 14.4h2.4L12 15.9z" />
    </>
  ),
  cat: (
    <>
      <path d="M5 13V4.5l4 3h6l4-3V13a7 7 0 0 1-14 0z" />
      <path d="M9.5 12v.01M14.5 12v.01" strokeWidth="2.2" />
      <path d="m11 15 1 1 1-1" />
    </>
  ),
  paw: (
    <>
      <circle cx="6.3" cy="10.4" r="1.6" />
      <circle cx="9.6" cy="6.2" r="1.6" />
      <circle cx="14.4" cy="6.2" r="1.6" />
      <circle cx="17.7" cy="10.4" r="1.6" />
      <path d="M12 12.2c-2.5 0-4.5 2-4.5 4.1 0 1.6 1.2 2.6 2.7 2.6.8 0 1.2-.3 1.8-.3s1 .3 1.8.3c1.5 0 2.7-1 2.7-2.6 0-2.1-2-4.1-4.5-4.1z" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 7 2.5V11c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5z" />
      <path d="m9 12 2 2 4-4.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4.5" />
      <path d="M12 17v.01" strokeWidth="2.2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5M20 14v.01M14 20v.01M17.5 20H20v-2.5" />
    </>
  ),
  signal: (
    <>
      <path d="M12 18.5v.01" strokeWidth="2.4" />
      <path d="M8.5 14.8a5 5 0 0 1 7 0" />
      <path d="M5.5 11.6a9.2 9.2 0 0 1 13 0" />
    </>
  ),
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export default function Icon({ name, size = 20, title, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
