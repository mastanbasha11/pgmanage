/* ── PGManage icon set ───────────────────────────────────────────────
   Lifted verbatim from pgmanage-tokens. Drawn on a 24×24 grid, 1.7 stroke,
   round caps and joins, currentColor. Optical box is 18×18 inside the grid.
   This is the site's ONLY icon source — no emoji, no second family. */
export const ICON = {
  /* nav */
  home: '<path d="M3.4 10.9 12 4l8.6 6.9"/><path d="M5.7 9.6V19a1.4 1.4 0 0 0 1.4 1.4h9.8a1.4 1.4 0 0 0 1.4-1.4V9.6"/><path d="M9.9 20.4v-5.2h4.2v5.2"/>',
  wallet: '<path d="M20.6 10.2V8.2A2.3 2.3 0 0 0 18.3 5.9H5.7A2.3 2.3 0 0 0 3.4 8.2v7.6a2.3 2.3 0 0 0 2.3 2.3h12.6a2.3 2.3 0 0 0 2.3-2.3v-2"/><path d="M21.3 10.2h-4a1.9 1.9 0 0 0 0 3.8h4Z"/>',
  meals: '<path d="M3.7 11.5h16.6a8.3 8.3 0 0 1-16.6 0Z"/><path d="M2.8 20.3h18.4"/><path d="M9.6 8.2c-1-1-1-2 0-3s1-2 0-3"/><path d="M14.4 8.2c-1-1-1-2 0-3s1-2 0-3"/>',
  bed: '<path d="M3.3 19.8V6.6"/><path d="M3.3 12.4h15.3a2.2 2.2 0 0 1 2.2 2.2v5.2"/><path d="M3.3 16.5h17.5"/><circle cx="7.7" cy="9.6" r="1.9"/>',
  dots: '<circle cx="5.4" cy="12" r="1.55" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.55" fill="currentColor" stroke="none"/><circle cx="18.6" cy="12" r="1.55" fill="currentColor" stroke="none"/>',
  /* actions on the home screen */
  buoy: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.4"/><path d="M6.05 6.05 9.6 9.6"/><path d="M14.4 14.4l3.55 3.55"/><path d="M17.95 6.05 14.4 9.6"/><path d="M9.6 14.4l-3.55 3.55"/>',
  ticket: '<path d="M3.4 8.7a1.5 1.5 0 0 1 1.5-1.5h14.2a1.5 1.5 0 0 1 1.5 1.5v2a2 2 0 0 0 0 3.6v2a1.5 1.5 0 0 1-1.5 1.5H4.9a1.5 1.5 0 0 1-1.5-1.5v-2a2 2 0 0 0 0-3.6Z"/><path d="M14.3 7.6v8.8" stroke-dasharray="2 2.3"/>',
  gift: '<path d="M4.6 11.4v7.4a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6v-7.4"/><path d="M3.2 7.9h17.6v3.5H3.2z"/><path d="M12 7.9v12.5"/><path d="M12 7.9S10.5 4 8.5 4a1.95 1.95 0 0 0 0 3.9"/><path d="M12 7.9S13.5 4 15.5 4a1.95 1.95 0 0 1 0 3.9"/>',
  /* service categories */
  spray: '<path d="M9.3 8.9h4.4a2.1 2.1 0 0 1 2.1 2.1v7.5a1.9 1.9 0 0 1-1.9 1.9H9.1a1.9 1.9 0 0 1-1.9-1.9V11a2.1 2.1 0 0 1 2.1-2.1Z"/><path d="M10.1 8.9V5.4h2.9v3.5"/><path d="M13 6.3h3.4V4.1"/><path d="M7.2 13.7h8.6"/>',
  bulb: '<path d="M8.5 14.4a5.6 5.6 0 1 1 7 0 2.7 2.7 0 0 0-1 2.1v.6H9.5v-.6a2.7 2.7 0 0 0-1-2.1Z"/><path d="M9.9 20.2h4.2"/>',
  drop: '<path d="M12 3.6c0 0 6 6.4 6 10.1a6 6 0 0 1-12 0c0-3.7 6-10.1 6-10.1Z"/>',
  tshirt: '<path d="M8.8 3.4 4 5.9l1.5 4.2 2.1-.8v10.4a.9.9 0 0 0 .9.9h7a.9.9 0 0 0 .9-.9V9.3l2.1.8L20 5.9l-4.8-2.5"/><path d="M8.8 3.4a3.2 3.2 0 0 0 6.4 0"/>',
  shield: '<path d="M12 3.4 5.2 6.1v5.4c0 4.2 2.8 7.6 6.8 9 4-1.4 6.8-4.8 6.8-9V6.1Z"/>',
  wrench: '<path d="M14.9 3.7a5.4 5.4 0 0 0-4.7 7.8l-6.3 6.3a2 2 0 0 0 2.8 2.8l6.3-6.3a5.4 5.4 0 0 0 6.6-7.4l-2.9 2.9-2.6-.6-.6-2.6 2.9-2.9a5.4 5.4 0 0 0-1.5 0Z"/>',
  /* stay */
  doc: '<path d="M13.5 3.5H7.4A1.9 1.9 0 0 0 5.5 5.4v13.2a1.9 1.9 0 0 0 1.9 1.9h9.2a1.9 1.9 0 0 0 1.9-1.9V8.3Z"/><path d="M13.5 3.5v4.8h4.9"/><path d="M8.8 13h6.4"/><path d="M8.8 16.4h4.4"/>',
  receipt: '<path d="M6 3.9h12v16.3l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4Z"/><path d="M9.1 8.6h5.8"/><path d="M9.1 12.2h5.8"/>',
  lock: '<path d="M5.1 12.7a2.2 2.2 0 0 1 2.2-2.2h9.4a2.2 2.2 0 0 1 2.2 2.2v5.4a2.2 2.2 0 0 1-2.2 2.2H7.3a2.2 2.2 0 0 1-2.2-2.2Z"/><path d="M8.4 10.5V7.9a3.6 3.6 0 0 1 7.2 0v2.6"/>',
  wifi: '<path d="M2.9 9.3a13.1 13.1 0 0 1 18.2 0"/><path d="M6.3 12.9a8.2 8.2 0 0 1 11.4 0"/><path d="M9.6 16.4a3.6 3.6 0 0 1 4.8 0"/><circle cx="12" cy="19.5" r="1.15" fill="currentColor" stroke="none"/>',
  people: '<circle cx="9.2" cy="8.6" r="3.5"/><path d="M3.3 20.2a5.9 5.9 0 0 1 11.8 0"/><path d="M16.1 5.5a3.5 3.5 0 0 1 0 6.6"/><path d="M17.3 14.5a5.9 5.9 0 0 1 3.4 5.7"/>',
  user: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.9 20.4a7.1 7.1 0 0 1 14.2 0"/>',
  book: '<path d="M4.7 4.4a1.8 1.8 0 0 1 1.8-1.8h11.1a1.4 1.4 0 0 1 1.4 1.4v13.6a1.4 1.4 0 0 1-1.4 1.4H6.5a1.8 1.8 0 0 0-1.8 1.8Z"/><path d="M4.7 17.2a1.8 1.8 0 0 1 1.8-1.8h12.5"/>',
  bank: '<path d="M3.4 9.7 12 4.7l8.6 5"/><path d="M5.6 9.7v8.6"/><path d="M9.9 9.7v8.6"/><path d="M14.1 9.7v8.6"/><path d="M18.4 9.7v8.6"/><path d="M3 20.5h18"/>',
  idcard: '<path d="M2.9 7.6a2.2 2.2 0 0 1 2.2-2.2h13.8a2.2 2.2 0 0 1 2.2 2.2v8.8a2.2 2.2 0 0 1-2.2 2.2H5.1a2.2 2.2 0 0 1-2.2-2.2Z"/><circle cx="8.5" cy="10.6" r="2"/><path d="M5.4 15.6a3.3 3.3 0 0 1 6.2 0"/><path d="M14.6 9.8h4"/><path d="M14.6 13.2h4"/>',
  /* alerts & comms */
  bell: '<path d="M12 3.2a5.7 5.7 0 0 0-5.7 5.7c0 4-1.6 5.5-1.6 5.5h14.6s-1.6-1.5-1.6-5.5A5.7 5.7 0 0 0 12 3.2Z"/><path d="M10.1 17.6a2 2 0 0 0 3.8 0"/>',
  megaphone: '<path d="M14.6 5.3 7 9.4H4.7a1.5 1.5 0 0 0-1.5 1.5v2.2a1.5 1.5 0 0 0 1.5 1.5H7l7.6 4.1Z"/><path d="M17.7 9.7a3.3 3.3 0 0 1 0 4.6"/><path d="M7.6 14.9l1.3 4.7"/>',
  alert: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.7v4.8"/><circle cx="12" cy="16.1" r="1.05" fill="currentColor" stroke="none"/>',
  warn: '<path d="M10.6 4.3 2.9 17.6a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.3a1.6 1.6 0 0 0-2.8 0Z"/><path d="M12 9.3v4"/><circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none"/>',
  chat: '<path d="M20.5 11.9a7.7 7.7 0 0 1-8.3 7.7 8.6 8.6 0 0 1-3.1-.7L4 20.4l1.4-4.7a7.7 7.7 0 0 1-.8-3.6 7.7 7.7 0 0 1 7.7-7.7 7.7 7.7 0 0 1 8.2 7.5Z"/>',
  envelope: '<path d="M3.1 7.6a2.2 2.2 0 0 1 2.2-2.2h13.4a2.2 2.2 0 0 1 2.2 2.2v8.8a2.2 2.2 0 0 1-2.2 2.2H5.3a2.2 2.2 0 0 1-2.2-2.2Z"/><path d="m3.7 7.4 8.3 5.7 8.3-5.7"/>',
  phone: '<path d="M20.6 16.9v2.5a1.8 1.8 0 0 1-2 1.8 17.7 17.7 0 0 1-7.7-2.7 17.3 17.3 0 0 1-5.3-5.3A17.7 17.7 0 0 1 3 5.4a1.8 1.8 0 0 1 1.8-2h2.5a1.8 1.8 0 0 1 1.8 1.6c.1.8.3 1.7.6 2.4a1.8 1.8 0 0 1-.4 1.9L8.3 10.5a14.4 14.4 0 0 0 5.2 5.2l1.2-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.4.6a1.8 1.8 0 0 1 1.6 1.9Z"/>',
  /* controls */
  search: '<circle cx="10.9" cy="10.9" r="6.6"/><path d="m15.7 15.7 4.8 4.8"/>',
  camera: '<path d="M3.4 9a1.9 1.9 0 0 1 1.9-1.9h2.4l1.4-2.3h5.8l1.4 2.3h2.4A1.9 1.9 0 0 1 20.6 9v8.7a1.9 1.9 0 0 1-1.9 1.9H5.3a1.9 1.9 0 0 1-1.9-1.9Z"/><circle cx="12" cy="13.2" r="3.5"/>',
  plus: '<path d="M12 5.2v13.6"/><path d="M5.2 12h13.6"/>',
  minus: '<path d="M5.2 12h13.6"/>',
  check: '<path d="m4.9 12.7 4.8 4.8L19.3 6.6"/>',
  gear: '<circle cx="12" cy="12" r="6.3"/><circle cx="12" cy="12" r="2.6"/><path d="M12 3.3v2.3" stroke-width="2.3"/><path d="M12 18.4v2.3" stroke-width="2.3"/><path d="M3.3 12h2.3" stroke-width="2.3"/><path d="M18.4 12h2.3" stroke-width="2.3"/><path d="m5.9 5.9 1.6 1.6" stroke-width="2.3"/><path d="m16.5 16.5 1.6 1.6" stroke-width="2.3"/><path d="m18.1 5.9-1.6 1.6" stroke-width="2.3"/><path d="m7.5 16.5-1.6 1.6" stroke-width="2.3"/>',
  star: '<path d="m12 3.8 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 10.1l6-.8Z"/>',
  chevR: '<path d="m9.4 5.4 6.6 6.6-6.6 6.6"/>',
  chevL: '<path d="M14.6 5.4 8 12l6.6 6.6"/>',
  chevU: '<path d="m5.8 15 6.2-6.2L18.2 15"/>',
  chevD: '<path d="M5.8 9 12 15.2 18.2 9"/>',
  swap: '<path d="m7.4 8 -3.8 4 3.8 4"/><path d="m16.6 8 3.8 4-3.8 4"/><path d="M3.6 12h16.8"/>',
  refresh: '<path d="M20.7 12a8.7 8.7 0 1 1-2.5-6.1"/><path d="M20.7 4.5v5.4h-5.4"/>',
  download: '<path d="M12 3.8v11.5"/><path d="m7.4 10.8 4.6 4.5 4.6-4.5"/><path d="M4.5 19.7h15"/>',
  pencil: '<path d="M16.3 3.7a2.5 2.5 0 0 1 3.5 3.5L8.1 18.9l-4.5 1.4 1.4-4.5Z"/><path d="m14.5 5.5 3.5 3.5"/>',
  link: '<path d="M10.2 13.8a4.5 4.5 0 0 0 6.7.5l2.6-2.6a4.5 4.5 0 0 0-6.3-6.3l-1.5 1.5"/><path d="M13.8 10.2a4.5 4.5 0 0 0-6.7-.5l-2.6 2.6a4.5 4.5 0 0 0 6.3 6.3l1.5-1.5"/>',
  hourglass: '<path d="M7 3.7h10"/><path d="M7 20.3h10"/><path d="M8.1 3.7v3.1c0 2.2 3.9 3.6 3.9 5.2s-3.9 3-3.9 5.2v3.1"/><path d="M15.9 3.7v3.1c0 2.2-3.9 3.6-3.9 5.2s3.9 3 3.9 5.2v3.1"/>',
  bolt: '<path d="M13.4 2.9 4.7 13.5h6.3l-.9 7.6 8.8-10.8h-6.3Z"/>',
  /* vehicles */
  scooter: '<circle cx="5.5" cy="16.6" r="3.2"/><circle cx="18.5" cy="16.6" r="3.2"/><path d="M8.7 16.6h4.6"/><path d="M13.3 16.6 15.4 9.6h-2.1"/><path d="M15.4 9.6h3.3"/><path d="m16.3 10.5 2.2 6.1"/><path d="M7.3 12.9h4.5"/>',
  car: '<path d="m3.6 12.4 1.9-4.6a2 2 0 0 1 1.9-1.2h9.2a2 2 0 0 1 1.9 1.2l1.9 4.6"/><path d="M3.6 12.4h16.8v4.3a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-.9H7.1v.9a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1Z"/><circle cx="7.3" cy="14.5" r=".95" fill="currentColor" stroke="none"/><circle cx="16.7" cy="14.5" r=".95" fill="currentColor" stroke="none"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M5.9 18.1 18.1 5.9"/>',
  /* owner app */
  building: '<path d="M4.5 20.5V5.4a1.7 1.7 0 0 1 1.7-1.7h7.8a1.7 1.7 0 0 1 1.7 1.7v15.1"/><path d="M15.7 10.4h2.6a1.7 1.7 0 0 1 1.7 1.7v8.4"/><path d="M3 20.5h18"/><path d="M8 7.4h1.5"/><path d="M11.2 7.4h1.5"/><path d="M8 11h1.5"/><path d="M11.2 11h1.5"/><path d="M8 14.6h1.5"/><path d="M11.2 14.6h1.5"/>',
  grid: '<path d="M3.7 5.4a1.7 1.7 0 0 1 1.7-1.7h3.8a1.7 1.7 0 0 1 1.7 1.7v3.8a1.7 1.7 0 0 1-1.7 1.7H5.4a1.7 1.7 0 0 1-1.7-1.7Z"/><path d="M13.1 5.4a1.7 1.7 0 0 1 1.7-1.7h3.8a1.7 1.7 0 0 1 1.7 1.7v3.8a1.7 1.7 0 0 1-1.7 1.7h-3.8a1.7 1.7 0 0 1-1.7-1.7Z"/><path d="M3.7 14.8a1.7 1.7 0 0 1 1.7-1.7h3.8a1.7 1.7 0 0 1 1.7 1.7v3.8a1.7 1.7 0 0 1-1.7 1.7H5.4a1.7 1.7 0 0 1-1.7-1.7Z"/><path d="M13.1 14.8a1.7 1.7 0 0 1 1.7-1.7h3.8a1.7 1.7 0 0 1 1.7 1.7v3.8a1.7 1.7 0 0 1-1.7 1.7h-3.8a1.7 1.7 0 0 1-1.7-1.7Z"/>',
  calendar: '<path d="M3.5 7.6a2.2 2.2 0 0 1 2.2-2.2h12.6a2.2 2.2 0 0 1 2.2 2.2v10.6a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2Z"/><path d="M3.5 10.1h17"/><path d="M8.2 3.5v3.6"/><path d="M15.8 3.5v3.6"/>',
  trend: '<path d="m3.6 16.6 5.4-5.4 3.6 3.6 7.4-7.4"/><path d="M15.4 7.4h4.6V12"/>',
  pie: '<path d="M12 3.7v8.3h8.3A8.3 8.3 0 0 0 12 3.7Z"/><path d="M20 14.6A8.4 8.4 0 1 1 9.6 4"/>',
  ledger: '<path d="M5.6 4.6A1.9 1.9 0 0 1 7.5 2.7h9.6a1.9 1.9 0 0 1 1.9 1.9v14.8a1.9 1.9 0 0 1-1.9 1.9H7.5a1.9 1.9 0 0 1-1.9-1.9Z"/><path d="M9.1 2.7v18.6"/><path d="M11.8 7.7h4.3"/><path d="M11.8 11.3h4.3"/>',
  key: '<circle cx="7.6" cy="9.4" r="4.3"/><circle cx="7.6" cy="9.4" r="1.4"/><path d="m10.7 12.5 8 8"/><path d="m14.9 16.7 2.2-2.2"/><path d="m17.1 18.9 2.2-2.2"/>',
  /* status-bar glyphs */
  signal: '<path d="M3.6 18.4v-2.6" stroke-width="2.6"/><path d="M9.2 18.4v-5.6" stroke-width="2.6"/><path d="M14.8 18.4v-8.6" stroke-width="2.6"/><path d="M20.4 18.4v-11.6" stroke-width="2.6"/>',
  battery: '<path d="M2.2 9.6a2 2 0 0 1 2-2h12.6a2 2 0 0 1 2 2v4.8a2 2 0 0 1-2 2H4.2a2 2 0 0 1-2-2Z"/><path d="M20.6 10.7v2.6"/><path d="M4.6 10.6a.8.8 0 0 1 .8-.8h8.2a.8.8 0 0 1 .8.8v2.8a.8.8 0 0 1-.8.8H5.4a.8.8 0 0 1-.8-.8Z" fill="currentColor" stroke="none"/>',
} as const;

export type IconName = keyof typeof ICON;

/** Returns an inline SVG string. `fill` fills the shape (used by rating stars).
 *  Stroke geometry (1.7, round caps/joins, currentColor) matches the source. */
export function icon(name: IconName, opts: { fill?: boolean; class?: string } = {}): string {
  const cls = ['i', opts.fill ? 'i--fill' : '', opts.class ?? ''].filter(Boolean).join(' ');
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[name] ?? ''}</svg>`;
}

export const ICON_NAMES = Object.keys(ICON) as IconName[];
