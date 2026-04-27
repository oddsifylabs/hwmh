/**
 * HWMH Custom Icon Set
 * SVG icons designed for the Oddsify Labs dark theme dashboard.
 * Export each icon as an HTML string for direct injection.
 */

const ICONS = {
  // Worker Avatars (40x40 viewBox)
  sophia: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="currentColor" opacity="0.15"/><path d="M20 6L24 14H16L20 6Z" fill="currentColor"/><circle cx="20" cy="24" r="6" fill="currentColor"/><path d="M14 30C14 30 16 34 20 34C24 34 26 30 26 30" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,

  iris: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="currentColor" opacity="0.15"/><rect x="10" y="10" width="20" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 16H26M14 20H22M14 24H26M14 28H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  pheme: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="currentColor" opacity="0.15"/><path d="M12 14C12 14 14 10 20 10C26 10 28 14 28 14V22C28 22 26 26 20 26C14 26 12 22 12 22V14Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M28 18L32 16V24L28 22" fill="currentColor"/></svg>`,

  kairos: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="currentColor" opacity="0.15"/><circle cx="20" cy="20" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="3" fill="currentColor"/><path d="M20 4V8M20 32V36M4 20H8M32 20H36M9.86 9.86L12.68 12.68M27.32 27.32L30.14 30.14M9.86 30.14L12.68 27.32M27.32 12.68L30.14 9.86" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  // Navigation Icons (20x20 viewBox)
  dashboard: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>`,

  request: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 2V10M10 10V18M10 10H18M10 10H2"/></svg>`,

  workers: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="6" r="3"/><circle cx="13" cy="6" r="3"/><path d="M2 16C2 13.2386 4.23858 11 7 11H7C7 11 9 11 10 13"/><path d="M18 16C18 13.2386 15.7614 11 13 11H13C13 11 11 11 10 13"/></svg>`,

  profiles: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="6" r="4"/><path d="M2 18C2 13.5817 5.58172 10 10 10C14.4183 10 18 13.5817 18 18"/></svg>`,

  tasks: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 5H17M3 10H17M3 15H12"/><path d="M15 13L17 15L21 11" stroke-width="2"/></svg>`,

  director: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 2L12 6H8L10 2Z" fill="currentColor"/><circle cx="10" cy="12" r="4"/><path d="M4 18C4 18 6 20 10 20C14 20 16 18 16 18"/></svg>`,

  reasoning: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><path d="M7 10C7 8.34315 8.34315 7 10 7"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg>`,

  decisions: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><path d="M6 10L9 13L14 7" stroke-width="2"/></svg>`,

  errors: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 2L18 16H2L10 2Z"/><path d="M10 8V11M10 13.5V14"/></svg>`,

  chat: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 8C2 5.23858 4.23858 3 7 3H13C15.7614 3 18 5.23858 18 8V12C18 14.7614 15.7614 17 13 17H7L3 19V8Z"/></svg>`,

  system: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 2V4M10 16V18M2 10H4M16 10H18M4.93 4.93L6.34 6.34M13.66 13.66L15.07 15.07M4.93 15.07L6.34 13.66M13.66 6.34L15.07 4.93"/></svg>`,

  config: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="2"/><path d="M16 10H17M3 10H4M10 3V4M10 17V16M14.14 5.86L14.85 5.15M5.15 14.85L5.86 14.14M14.14 14.14L14.85 14.85M5.15 5.15L5.86 5.86"/></svg>`,

  // Status Icons
  online: `<svg viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>`,
  offline: `<svg viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1.5"/></svg>`,
  working: `<svg viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="currentColor"/><circle cx="5" cy="5" r="2" fill="var(--bg-card)"/></svg>`,
  idle: `<svg viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="currentColor" opacity="0.5"/></svg>`,

  // Priority Badges
  priorityUrgent: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2V10M8 12V14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  priorityHigh: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 3L8 11M4 7L8 3L12 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  priorityNormal: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>`,
  priorityLow: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 13L8 5M4 9L8 13L12 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Category Icons (small, for request form)
  catGeneral: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/></svg>`,
  catResearch: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="5"/><path d="M11 11L15 15"/></svg>`,
  catContent: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 13L13 3M13 3H7M13 3V9"/></svg>`,
  catDev: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 5L1 8L4 11M12 5L15 8L12 11M7 3L9 13"/></svg>`,
  catSocial: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5C12 5 13 6 13 8C13 10 12 11 12 11"/><path d="M4 5C4 5 3 6 3 8C3 10 4 11 4 11"/><circle cx="8" cy="8" r="2"/></svg>`,
  catSales: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12L6 8L9 11L14 5"/></svg>`,
  catAdmin: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6H14M6 2V14"/></svg>`,
  catUrgent: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3V9M8 11.5V12"/></svg>`,

  // Action Icons
  send: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 10L18 10M12 4L18 10L12 16"/></svg>`,
  refresh: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C13.2717 2 16.0901 3.84207 17.3604 6.5"/><path d="M18 2V6H14"/></svg>`,
  clear: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 5H17M8 5V3H12V5M6 8V17H14V8"/></svg>`,
  reset: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 10C2 14.4183 5.58172 18 10 18C12.7283 18 15.1591 16.6289 16.6451 14.5"/><path d="M18 10C18 5.58172 14.4183 2 10 2C7.27167 2 4.84088 3.37107 3.35495 5.5"/><path d="M18 2V6H14M2 18V14H6"/></svg>`,
  back: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 4L6 10L12 16"/></svg>`,
  link: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 12C8 12 9 14 11 14H13C15.2091 14 17 12.2091 17 10C17 7.79086 15.2091 6 13 6H11C9 6 8 8 8 8"/><path d="M12 8C12 8 11 6 9 6H7C4.79086 6 3 7.79086 3 10C3 12.2091 4.79086 14 7 14H9C11 14 12 12 12 12"/></svg>`,

  // Misc
  logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="currentColor" opacity="0.2"/><path d="M20 6L26 18H14L20 6Z" fill="currentColor"/><circle cx="20" cy="26" r="6" fill="currentColor"/></svg>`,
  empty: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="24" cy="24" r="18" opacity="0.3"/><path d="M18 24H30M24 18V30"/></svg>`,
  check: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10L8 14L16 6"/></svg>`,
  warning: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 2L18 17H2L10 2Z"/><path d="M10 8V11M10 13.5V14"/></svg>`,
};

// Helper: render an icon with size and optional color
function icon(name, size = 20, color = null) {
  const svg = ICONS[name];
  if (!svg) return '';
  const style = color ? ` style="color:${color};width:${size}px;height:${size}px"` : ` style="width:${size}px;height:${size}px"`;
  return svg.replace('<svg ', `<svg${style} `);
}

// Expose globally
window.HWMH_ICONS = ICONS;
window.icon = icon;
