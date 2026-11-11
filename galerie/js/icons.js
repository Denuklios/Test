// Einheitliche Linien-Icons (24×24, Strichstärke über CSS)
const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  share: '<path d="M12 15V4M8 7.5L12 4l4 3.5"/><path d="M6 11v7.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V11"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6"/>',
  scissors: '<circle cx="6.5" cy="7" r="2.6"/><circle cx="6.5" cy="17" r="2.6"/><path d="M8.7 8.4L20 17M8.7 15.6L20 7"/>',
  sticker: '<path d="M14 20H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7z"/><path d="M14 20v-3.5A2.5 2.5 0 0 1 16.5 14H20"/><path d="M9 10v.2M15 10v.2M9 14.2c1.6 1.2 3.4 1.2 5 0"/>',
  mosaic: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  face: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10v.2M15 10v.2M8.8 14.3c1.8 1.7 4.6 1.7 6.4 0"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  carousel: '<rect x="8" y="6" width="8" height="12" rx="1.5"/><path d="M5 8v8M19 8v8M2.5 10v4M21.5 10v4"/>',
  edit: '<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  hide: '<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 6 8.5 6a15 15 0 0 1-2.6 3.3M6.6 7.6C4.6 9.2 3.5 12 3.5 12S7 18 12 18a8.3 8.3 0 0 0 3.8-.9"/><path d="M9.9 10a3 3 0 0 0 4.2 4.1"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  undo: '<path d="M9 7.5L5 11.5l4 4"/><path d="M5 11.5h9.5a4.5 4.5 0 0 1 0 9H11"/>',
  smaller: '<path d="M14 6l-6 6 6 6"/>',
  bigger: '<path d="M10 6l6 6-6 6"/>',
  save: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  phone: '<rect x="6.5" y="3" width="11" height="18" rx="2.5"/><path d="M11 18h2"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5"/>',
  shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20M17 14.5l3 2.5-3 2.5"/><path d="M4 17h3.5c1.4 0 2.4-1.2 3.2-2.7M13.3 9.7C14 8.2 15 7 16.5 7H20M17 4.5L20 7l-3 2.5"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  fit: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10v4M16 10v4"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 8.5v.2M15.5 8.5v.2M12 12v.2M8.5 15.5v.2M15.5 15.5v.2"/>',
  ring: '<ellipse cx="12" cy="12" rx="8.5" ry="4"/>',
  spiral: '<path d="M12 12c0-1.5 2-1.5 2 0 0 2.5-4 2.5-4 0 0-3.8 6-3.8 6 0 0 5-8 5-8 0 0-6.2 10-6.2 10 0"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
};

export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}
