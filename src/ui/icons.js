// Symbole im Stil von SF Symbols – selbst gezeichnet, 24er Raster, runde Enden, currentColor.
// Verwendung: element.innerHTML = I.plus  ·  `<button>${I.heart}</button>`
// Jede Variante mit „Fill“ im Namen ist die gefüllte Form (aktive Tabs, Favorit …).

const svg = (p, { w = 1.8, cls = '' } = {}) =>
  `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
const solid = (p, cls = '') =>
  `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false">${p}</svg>`;

// --- Tabs ---
const mirrorFrame = 'M12 2.6c3.7 0 6.4 2.9 6.4 6.6v6.4c0 2.4-1.9 4.3-4.3 4.3H9.9c-2.4 0-4.3-1.9-4.3-4.3V9.2c0-3.7 2.7-6.6 6.4-6.6z';
const mirror = svg(`<path d="${mirrorFrame}"/><path d="M12 19.9v1.7M8.6 21.6h6.8"/><circle cx="12" cy="8.6" r="1.75"/><path d="M8.9 16.4c.3-2.3 1.4-3.9 3.1-3.9s2.8 1.6 3.1 3.9"/>`);
const mirrorFill = `<svg class="ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
<path d="${mirrorFrame}" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M12 19.9v1.7M8.6 21.6h6.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<g fill="var(--knockout, #fff)"><circle cx="12" cy="8.6" r="2"/><path d="M8.6 16.6c.3-2.6 1.5-4.4 3.4-4.4s3.1 1.8 3.4 4.4c0 .3-.2.5-.5.5H9.1c-.3 0-.5-.2-.5-.5z"/></g></svg>`;

const hangerPath = 'M9.8 5.6a2.2 2.2 0 1 1 3.2 1.95c-.62.33-1 .96-1 1.66v.69M12 9.9l-8.55 5.86c-.98.67-.5 2.24.68 2.24h15.74c1.18 0 1.66-1.57.68-2.24L12 9.9z';
const hanger = svg(`<path d="${hangerPath}"/>`);
const hangerFill = `<svg class="ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
<path d="M9.8 5.6a2.2 2.2 0 1 1 3.2 1.95c-.62.33-1 .96-1 1.66v.69" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
<path d="M12 9.6l-8.7 6c-1.1.75-.56 2.5.77 2.5h15.86c1.33 0 1.87-1.75.77-2.5L12 9.6z" fill="currentColor"/></svg>`;

const looks = svg('<rect x="3.6" y="3.6" width="7.4" height="9.6" rx="2.2"/><rect x="13" y="3.6" width="7.4" height="6" rx="2.2"/><rect x="3.6" y="15.2" width="7.4" height="5.2" rx="2.2"/><rect x="13" y="11.6" width="7.4" height="8.8" rx="2.2"/>');
const looksFill = solid('<rect x="2.7" y="2.7" width="9.2" height="11.4" rx="2.8"/><rect x="12.1" y="2.7" width="9.2" height="7.8" rx="2.8"/><rect x="2.7" y="14.3" width="9.2" height="7" rx="2.8"/><rect x="12.1" y="10.7" width="9.2" height="10.6" rx="2.8"/>');

export const I = {
  // Tabs
  mirror,
  mirrorFill,
  hanger,
  hangerFill,
  looks,
  looksFill,

  // Grundsymbole
  plus: svg('<path d="M12 4.8v14.4M4.8 12h14.4"/>', { w: 2.1 }),
  plusCircleFill: solid('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 5.2a.95.95 0 0 0-.95.95v2.9h-2.9a.95.95 0 0 0 0 1.9h2.9v2.9a.95.95 0 0 0 1.9 0v-2.9h2.9a.95.95 0 0 0 0-1.9h-2.9v-2.9A.95.95 0 0 0 12 7.2z"/>'),
  minus: svg('<path d="M4.8 12h14.4"/>', { w: 2.1 }),
  close: svg('<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/>', { w: 2.1 }),
  xmarkCircleFill: solid('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM9.1 7.9a.85.85 0 0 0-1.2 1.2L10.8 12l-2.9 2.9a.85.85 0 1 0 1.2 1.2l2.9-2.9 2.9 2.9a.85.85 0 0 0 1.2-1.2L13.2 12l2.9-2.9a.85.85 0 0 0-1.2-1.2L12 10.8z"/>'),
  check: svg('<path d="M5 12.6l4.4 4.4L19 7.4"/>', { w: 2.2 }),
  checkCircleFill: solid('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm4.6 6.4a.9.9 0 0 0-1.27.06l-4.48 4.98-2.2-2.2a.9.9 0 1 0-1.27 1.27l2.87 2.87a.9.9 0 0 0 1.3-.03l5.1-5.68a.9.9 0 0 0-.05-1.27z"/>'),
  chevronRight: svg('<path d="M9.2 5.5L15.6 12l-6.4 6.5"/>', { w: 2.2 }),
  chevronLeft: svg('<path d="M14.8 5.5L8.4 12l6.4 6.5"/>', { w: 2.2 }),
  chevronDown: svg('<path d="M5.5 9.2L12 15.6l6.5-6.4"/>', { w: 2.2 }),
  chevronUp: svg('<path d="M5.5 14.8L12 8.4l6.5 6.4"/>', { w: 2.2 }),
  back: svg('<path d="M14.8 5.5L8.4 12l6.4 6.5"/>', { w: 2.2 }),
  arrowLeft: svg('<path d="M19 12H5.4M11 5.8L4.8 12l6.2 6.2"/>', { w: 2 }),

  // Medien
  camera: svg('<path d="M3.2 9.1c0-1.2 1-2.1 2.1-2.1h1.9l1.3-2c.3-.5.9-.8 1.5-.8h4c.6 0 1.2.3 1.5.8l1.3 2h1.9c1.2 0 2.1 1 2.1 2.1v8.6c0 1.2-1 2.1-2.1 2.1H5.3c-1.2 0-2.1-1-2.1-2.1V9.1z"/><circle cx="12" cy="13.1" r="3.5"/>'),
  cameraFill: `<svg class="ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3.2 9.1c0-1.2 1-2.1 2.1-2.1h1.9l1.3-2c.3-.5.9-.8 1.5-.8h4c.6 0 1.2.3 1.5.8l1.3 2h1.9c1.2 0 2.1 1 2.1 2.1v8.6c0 1.2-1 2.1-2.1 2.1H5.3c-1.2 0-2.1-1-2.1-2.1V9.1z"/><circle cx="12" cy="13.1" r="3.6" fill="var(--knockout, #fff)"/></svg>`,
  photo: svg('<rect x="3" y="4.2" width="18" height="15.6" rx="3.2"/><circle cx="8.6" cy="9.4" r="1.7"/><path d="M3.4 16.6l4.3-3.9c.6-.5 1.4-.5 2 0l2.5 2.2M10.4 19.6l5.2-5.2c.6-.6 1.5-.6 2.1 0l3 3"/>'),
  image: svg('<rect x="3" y="4.2" width="18" height="15.6" rx="3.2"/><circle cx="8.6" cy="9.4" r="1.7"/><path d="M3.4 16.6l4.3-3.9c.6-.5 1.4-.5 2 0l2.5 2.2M10.4 19.6l5.2-5.2c.6-.6 1.5-.6 2.1 0l3 3"/>'),
  photoStack: svg('<rect x="3" y="6.6" width="15" height="13.4" rx="2.8"/><path d="M6.4 3.8h11.4c1.8 0 3.2 1.4 3.2 3.2v9.6"/><circle cx="8" cy="11" r="1.4"/><path d="M3.4 17.6l3.6-3.2c.5-.4 1.2-.4 1.7 0l1.9 1.7M9.4 19.6l4.2-4.2c.5-.5 1.3-.5 1.8 0l2.4 2.4"/>'),
  person: svg('<circle cx="12" cy="7.6" r="3.6"/><path d="M4.8 20c.8-3.8 3.7-6 7.2-6s6.4 2.2 7.2 6"/>'),
  personCircle: svg('<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="10" r="3.1"/><path d="M6.4 18.2c1.3-2.1 3.3-3.3 5.6-3.3s4.3 1.2 5.6 3.3"/>'),
  figure: svg('<circle cx="12" cy="4.4" r="1.9"/><path d="M8 9.2c1.2-.8 2.5-1.2 4-1.2s2.8.4 4 1.2M12 8v6.4M12 14.4l-2.4 6.4M12 14.4l2.4 6.4"/>'),
  gear: svg('<path d="M10.3 3.3c.4-1 3-1 3.4 0l.4 1.2c.2.6.9.9 1.5.6l1.1-.6c1-.4 2.8 1.4 2.4 2.4l-.6 1.1c-.3.6 0 1.3.6 1.5l1.2.4c1 .4 1 3 0 3.4l-1.2.4c-.6.2-.9.9-.6 1.5l.6 1.1c.4 1-1.4 2.8-2.4 2.4l-1.1-.6c-.6-.3-1.3 0-1.5.6l-.4 1.2c-.4 1-3 1-3.4 0l-.4-1.2c-.2-.6-.9-.9-1.5-.6l-1.1.6c-1 .4-2.8-1.4-2.4-2.4l.6-1.1c.3-.6 0-1.3-.6-1.5l-1.2-.4c-1-.4-1-3 0-3.4l1.2-.4c.6-.2.9-.9.6-1.5l-.6-1.1c-.4-1 1.4-2.8 2.4-2.4l1.1.6c.6.3 1.3 0 1.5-.6z"/><circle cx="12" cy="12" r="3"/>', { w: 1.7 }),

  // Werkzeuge
  dice: svg('<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4"/><g fill="currentColor" stroke="none"><circle cx="8.3" cy="8.3" r="1.35"/><circle cx="15.7" cy="8.3" r="1.35"/><circle cx="12" cy="12" r="1.35"/><circle cx="8.3" cy="15.7" r="1.35"/><circle cx="15.7" cy="15.7" r="1.35"/></g>'),
  shuffle: svg('<path d="M3.5 7.2h2.8c2.4 0 3.8 1.4 5.2 4.8s2.8 4.8 5.2 4.8h3.6M3.5 16.8h2.8c1.2 0 2.2-.4 3-1.1M14.4 8.3c.8-.7 1.8-1.1 3-1.1h3.2M17.9 4.4l2.9 2.8-2.9 2.8M17.9 14l2.9 2.8-2.9 2.8"/>'),
  reset: svg('<path d="M4.6 12.4a7.6 7.6 0 1 0 2.3-5.6L4.6 9"/><path d="M4.4 4.6V9h4.4"/>'),
  undo: svg('<path d="M9 14.6L4.4 10 9 5.4"/><path d="M4.8 10h9.6a5.2 5.2 0 0 1 0 10.4H11"/>'),
  clear: svg('<path d="M4.6 12.4a7.6 7.6 0 1 0 2.3-5.6L4.6 9"/><path d="M4.4 4.6V9h4.4"/>'),
  move: svg('<path d="M12 3.4v17.2M3.4 12h17.2M12 3.4L9.4 6M12 3.4L14.6 6M12 20.6L9.4 18M12 20.6l2.6-2.6M3.4 12L6 9.4M3.4 12L6 14.6M20.6 12L18 9.4M20.6 12L18 14.6"/>'),
  adjust: svg('<path d="M4 7.4h9M17.6 7.4H20M4 16.6h2.4M11 16.6h9"/><circle cx="15.3" cy="7.4" r="2.3"/><circle cx="8.7" cy="16.6" r="2.3"/>'),
  sliders: svg('<path d="M4 7.4h9M17.6 7.4H20M4 16.6h2.4M11 16.6h9"/><circle cx="15.3" cy="7.4" r="2.3"/><circle cx="8.7" cy="16.6" r="2.3"/>'),
  rotate: svg('<path d="M19.4 12.4a7.6 7.6 0 1 1-2.3-5.6L19.4 9"/><path d="M19.6 4.6V9h-4.4"/>'),
  crop: svg('<path d="M6.6 3v12.2c0 1.2 1 2.2 2.2 2.2H21M3 6.6h12.2c1.2 0 2.2 1 2.2 2.2V21"/>'),
  wand: svg('<path d="M4.4 19.6L15 9M13.2 7.2l3.6 3.6"/><path d="M17.8 3.2l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6zM7.4 3.8l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM19.6 13.2l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="currentColor" stroke-width="1"/>'),
  sparkles: svg('<path d="M10 3.6l1.5 4.2c.3.8.9 1.4 1.7 1.7l4.2 1.5-4.2 1.5c-.8.3-1.4.9-1.7 1.7L10 18.4l-1.5-4.2c-.3-.8-.9-1.4-1.7-1.7L2.6 11l4.2-1.5c.8-.3 1.4-.9 1.7-1.7z"/><path d="M18.2 14.2l.6 1.6c.1.4.4.6.7.7l1.6.6-1.6.6c-.4.1-.6.4-.7.7l-.6 1.6-.6-1.6c-.1-.4-.4-.6-.7-.7l-1.6-.6 1.6-.6c.4-.1.6-.4.7-.7z" fill="currentColor" stroke-width="1"/>', { w: 1.7 }),
  layers: svg('<path d="M12 3.6l8.4 4.4L12 12.4 3.6 8z"/><path d="M3.6 12L12 16.4l8.4-4.4M3.6 16L12 20.4l8.4-4.4"/>'),

  // Aktionen
  heart: svg('<path d="M12 19.8s-7.6-4.5-7.6-10.2A4.3 4.3 0 0 1 8.7 5.2c1.4 0 2.6.7 3.3 1.8.7-1.1 1.9-1.8 3.3-1.8a4.3 4.3 0 0 1 4.3 4.4c0 5.7-7.6 10.2-7.6 10.2z"/>', { cls: 'ic-heart' }),
  heartFill: solid('<path d="M12 20.6c-.2 0-.4-.1-.6-.2C9.7 19.3 3.4 15.2 3.4 9.6a5.2 5.2 0 0 1 5.3-5.3c1.3 0 2.5.5 3.3 1.3.8-.8 2-1.3 3.3-1.3a5.2 5.2 0 0 1 5.3 5.3c0 5.6-6.3 9.7-8 10.8-.2.1-.4.2-.6.2z"/>', 'ic-heart'),
  share: svg('<path d="M12 14.2V3.4M8.2 7l3.8-3.8L15.8 7"/><path d="M8.4 10H7.2c-1.3 0-2.4 1.1-2.4 2.4v6.2c0 1.3 1.1 2.4 2.4 2.4h9.6c1.3 0 2.4-1.1 2.4-2.4v-6.2c0-1.3-1.1-2.4-2.4-2.4h-1.2"/>'),
  trash: svg('<path d="M4.2 6.4h15.6M9.4 6.4V4.8c0-.7.5-1.2 1.2-1.2h2.8c.7 0 1.2.5 1.2 1.2v1.6M6 6.4l.9 12.4c.1 1.1 1 2 2.1 2h6c1.1 0 2-.9 2.1-2L18 6.4M10.2 10.4v6.2M13.8 10.4v6.2"/>'),
  search: svg('<circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.6 15.6l4.6 4.6"/>', { w: 2 }),
  sort: svg('<path d="M7.6 19.6V4.6M4 8.2l3.6-3.6 3.6 3.6M16.4 4.4v15M12.8 15.8l3.6 3.6 3.6-3.6"/>'),
  filter: svg('<path d="M4 7h16M7 12h10M10 17h4"/>', { w: 2 }),
  calendar: svg('<rect x="3.6" y="5" width="16.8" height="15.4" rx="3.2"/><path d="M3.8 10h16.4M8.2 3.2v3.4M15.8 3.2v3.4"/><g fill="currentColor" stroke="none"><circle cx="8.3" cy="13.8" r="1.05"/><circle cx="12" cy="13.8" r="1.05"/><circle cx="15.7" cy="13.8" r="1.05"/><circle cx="8.3" cy="17.2" r="1.05"/><circle cx="12" cy="17.2" r="1.05"/></g>'),
  lock: svg('<rect x="5" y="10.4" width="14" height="10.2" rx="2.6"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>'),
  iphone: svg('<rect x="6.2" y="2.6" width="11.6" height="18.8" rx="3"/><path d="M10.4 5.4h3.2"/>'),
  lockIphone: svg('<rect x="5.6" y="2.6" width="12.8" height="18.8" rx="3.2"/><rect x="9.2" y="11.4" width="5.6" height="4.6" rx="1.2"/><path d="M10.4 11.4v-1.4a1.6 1.6 0 0 1 3.2 0v1.4"/>', { w: 1.6 }),
  bookmark: svg('<path d="M6.4 4.8c0-.9.7-1.6 1.6-1.6h8c.9 0 1.6.7 1.6 1.6v15.4l-5.6-3.8-5.6 3.8z"/>'),
  bookmarkFill: solid('<path d="M5.5 4.8c0-1.4 1.1-2.5 2.5-2.5h8c1.4 0 2.5 1.1 2.5 2.5v15.4c0 .7-.8 1.1-1.4.7L12 17.4l-5.1 3.5c-.6.4-1.4 0-1.4-.7z"/>'),
  save: svg('<path d="M6.4 4.8c0-.9.7-1.6 1.6-1.6h8c.9 0 1.6.7 1.6 1.6v15.4l-5.6-3.8-5.6 3.8z"/>'),
  pencil: svg('<path d="M14.6 5.4l4 4M4 20l1-4.4L15.8 4.8a1.9 1.9 0 0 1 2.7 0l.7.7a1.9 1.9 0 0 1 0 2.7L8.4 19z"/>'),
  ellipsis: svg('<g fill="currentColor" stroke="none"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></g>'),
  ellipsisCircle: svg('<circle cx="12" cy="12" r="9.2"/><g fill="currentColor" stroke="none"><circle cx="7.9" cy="12" r="1.25"/><circle cx="12" cy="12" r="1.25"/><circle cx="16.1" cy="12" r="1.25"/></g>'),
  info: svg('<circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.6"/><circle cx="12" cy="7.7" r=".4" fill="currentColor"/>', { w: 1.8 }),
  infoCircleFill: solid('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 8.2a.95.95 0 0 0-.95.95v5.2a.95.95 0 0 0 1.9 0v-5.2a.95.95 0 0 0-.95-.95zm0-3.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>'),
  warning: svg('<path d="M10.3 4.4c.8-1.3 2.6-1.3 3.4 0l7 12.2c.8 1.3-.2 3-1.7 3H5c-1.5 0-2.5-1.7-1.7-3z"/><path d="M12 9.4v4.4"/><circle cx="12" cy="16.6" r=".4" fill="currentColor"/>'),
  download: svg('<path d="M12 3.6v11.2M7.6 10.6L12 15l4.4-4.4"/><path d="M4.4 15.6v2.6c0 1.3 1.1 2.4 2.4 2.4h10.4c1.3 0 2.4-1.1 2.4-2.4v-2.6"/>'),
  upload: svg('<path d="M12 15V3.8M7.6 8L12 3.6 16.4 8"/><path d="M4.4 15.6v2.6c0 1.3 1.1 2.4 2.4 2.4h10.4c1.3 0 2.4-1.1 2.4-2.4v-2.6"/>'),
  doc: svg('<path d="M13.6 3.4H8c-1.3 0-2.4 1.1-2.4 2.4v12.4c0 1.3 1.1 2.4 2.4 2.4h8c1.3 0 2.4-1.1 2.4-2.4V8.2z"/><path d="M13.4 3.6v3.6c0 .7.5 1.2 1.2 1.2h3.6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v1.8M12 19.4v1.8M2.8 12h1.8M19.4 12h1.8M5.5 5.5l1.3 1.3M17.2 17.2l1.3 1.3M5.5 18.5l1.3-1.3M17.2 6.8l1.3-1.3"/>'),
  moon: svg('<path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2z"/>'),
  paintpalette: svg('<path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.2 0 1.9-.9 1.9-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1c2.1 0 3.8-1.7 3.8-3.8 0-4-3.8-7.3-8.6-7.3z"/><g fill="currentColor" stroke="none"><circle cx="7.6" cy="11.4" r="1.25"/><circle cx="10" cy="7.6" r="1.25"/><circle cx="14.6" cy="7.6" r="1.25"/></g>'),
  tshirt: svg('<path d="M9 3.8c.5 1.4 1.6 2.2 3 2.2s2.5-.8 3-2.2l4.6 2c.6.3.9 1 .6 1.6l-1.4 2.8c-.3.5-.9.7-1.4.5l-1.2-.5v9.4c0 .7-.5 1.2-1.2 1.2H9c-.7 0-1.2-.5-1.2-1.2v-9.4l-1.2.5c-.5.2-1.1 0-1.4-.5L3.8 7.4c-.3-.6 0-1.3.6-1.6z"/>', { w: 1.7 }),
  eye: svg('<path d="M2.8 12s3.4-6.4 9.2-6.4 9.2 6.4 9.2 6.4-3.4 6.4-9.2 6.4S2.8 12 2.8 12z"/><circle cx="12" cy="12" r="3"/>'),
  hand: svg('<path d="M8.6 12V5.6a1.5 1.5 0 0 1 3 0V11M11.6 10.4V4.4a1.5 1.5 0 0 1 3 0v6M14.6 10.6V6.2a1.5 1.5 0 0 1 3 0v7.6c0 4-2.6 6.8-6.2 6.8-2.4 0-3.8-1-5.2-3l-2.6-3.8c-.5-.7-.3-1.6.4-2 .6-.4 1.4-.2 1.8.3l1.8 2.3"/>', { w: 1.6 }),
  swipe: svg('<path d="M4 7.4h7M4 7.4l2.4-2.4M4 7.4l2.4 2.4"/><path d="M10.6 14.4V10a1.4 1.4 0 0 1 2.8 0v3.2M13.4 12.4a1.4 1.4 0 0 1 2.8 0v1M16.2 13a1.4 1.4 0 0 1 2.8 0v2.6c0 3-2 5-4.8 5-1.8 0-3-.8-4-2.2l-2-3c-.4-.6-.2-1.3.4-1.6.5-.3 1.1-.2 1.5.3l.5.7"/>', { w: 1.6 })
};

// Abwärtskompatible Kurz-Schlüssel (aus der alten icons.js)
I.looks = looks;
I.save = I.bookmark;
I.image = I.photo;

export default I;
