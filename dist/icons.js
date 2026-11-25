const paths = {
  feedback: '<path d="M21 11a8.5 8.5 0 0 1-9 8.5 11 11 0 0 1-4-.7L3 20l1.3-4A8.2 8.2 0 0 1 3 11a9 9 0 0 1 18 0z"/>',
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  book: '<path d="M3 4.5c3.6-.9 6.3-.2 9 1.5 2.7-1.7 5.4-2.4 9-1.5v14c-3.6-.9-6.3-.2-9 1.5-2.7-1.7-5.4-2.4-9-1.5zM12 6v14"/>',
  clipboard:
    '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6m-6 4h5"/>',
  sliders:
    '<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/>',
  chart: '<path d="M4 3v17h17M8 16v-4m5 4V7m5 9v-6"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>',
  settings:
    '<path d="m9 3 1 2h4l1-2 3 2-1 2 2 3 2 .3v3.4l-2 .3-2 3 1 2-3 2-1-2h-4l-1 2-3-2 1-2-2-3-2-.3v-3.4l2-.3 2-3-1-2z"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.6"/><path d="m16 16 5 5"/>',
  moon: '<path d="M20 14.1A8.4 8.4 0 0 1 10 3.2 8.7 8.7 0 1 0 20 14.1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  target:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.2M3 12h.2M3 18h.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  heart:
    '<path d="M20.6 5.3a5.2 5.2 0 0 0-7.4 0L12 6.6l-1.2-1.3a5.2 5.2 0 1 0-7.4 7.4l8.6 8 8.6-8a5.2 5.2 0 0 0 0-7.4Z"/><path d="M3 12h4l2-3 3.4 6 2.4-4 2 1h4"/>',
  body: '<path d="M7 3c1.2 3.1 1.3 4.3.3 7.1C6 13 4.8 16.4 5.2 21m11.8-18c-1.2 3.1-1.3 4.3-.3 7.1 1.3 2.9 2.5 6.3 2.1 10.9M8 15c1.9 2.5 6.1 2.5 8 0M12 12v1"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  steth:
    '<path d="M4 3v5a4.5 4.5 0 0 0 9 0V3M3 3h2m7 0h2M8.5 13v2a5.5 5.5 0 0 0 11 0v-2"/><circle cx="19.5" cy="10.5" r="2.4"/>',
  baby: '<circle cx="12" cy="13" r="8"/><path d="M11 5c4.5-4 5.5 4-1 3M8.5 12h.2m6.6 0h.2M9 16q3 2.6 6 0"/>',
  drop: '<path d="M12 2c-2 4.4-7.5 9-7.5 13a7.5 7.5 0 0 0 15 0c0-4-5.5-8.6-7.5-13zM8.5 15a3.5 3.5 0 0 0 3 3.5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  flag: '<path d="M5 21V4m0 1c5-4 8 4 14 0v10c-6 4-9-4-14 0"/>',
  bulb: '<path d="M8 15c-4-4-2.2-11 4-11s8 7 4 11l-2 2h-4zM10 20h4"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v6l3 2"/>',
  link: '<path d="M14 4h6v6m0-6-9 9M10 5H4v15h15v-6"/>',
}
function icon(name) {
  return (
    '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
    (paths[name] || paths.book) +
    '</svg>'
  )
}
