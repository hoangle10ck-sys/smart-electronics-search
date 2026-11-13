import { ReactNode } from 'react';

export type IconName =
  | 'search' | 'sparkles' | 'sun' | 'moon' | 'system' | 'menu' | 'close'
  | 'laptop' | 'phone' | 'tablet' | 'headphones' | 'watch' | 'monitor'
  | 'cpu' | 'gpu' | 'keyboard' | 'camera' | 'image' | 'arrow' | 'chevron'
  | 'filter' | 'compare' | 'check' | 'external' | 'sliders' | 'shield'
  | 'refresh' | 'tag' | 'memory' | 'database' | 'sparkle' | 'microphone'
  | 'gamepad' | 'vr' | 'drone' | 'book' | 'projector' | 'home';

const paths: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /><path d="m5 15 .6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6L5 15Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <path d="M20.3 15.2A8.7 8.7 0 0 1 8.8 3.7 8.8 8.8 0 1 0 20.3 15.2Z" />,
  system: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  laptop: <><rect x="5" y="4" width="14" height="11" rx="1.5" /><path d="M2.5 19h19l-1.4-3H3.9L2.5 19Z" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M10 5h4m-2 13.5v.1" /></>,
  tablet: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M11 18.5h2" /></>,
  headphones: <><path d="M3 13v-1a9 9 0 0 1 18 0v1" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></>,
  watch: <><rect x="7" y="7" width="10" height="10" rx="3" /><path d="m9 2 1 5m5-5-1 5m-5 10-1 5m5-5 1 5" /></>,
  monitor: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M8 21h8m-4-5v5" /></>,
  cpu: <><rect x="7" y="7" width="10" height="10" rx="1" /><path d="M9 2v3m6-3v3m-6 14v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3M10 10h4v4h-4z" /></>,
  gpu: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="10" cy="12" r="3" /><path d="M16 9h2m-2 3h2m-2 3h2M6 18v2m12-2v2" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 13h.01M9 13h.01M12 13h.01M15 13h.01M18 13h.01M8 16h8" /></>,
  camera: <><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
  filter: <><path d="M4 6h16M7 12h10m-7 6h4" /><circle cx="8" cy="6" r="1" /><circle cx="14" cy="12" r="1" /><circle cx="11" cy="18" r="1" /></>,
  compare: <><path d="M8 4H4v16h4M16 4h4v16h-4M10 8h4m-4 4h4m-4 4h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  external: <><path d="M14 4h6v6m0-6-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  sliders: <><path d="M4 6h9m4 0h3M4 12h3m4 0h9M4 18h9m4 0h3" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  memory: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M8 10h2v4H8zm6 0h2v4h-2zM7 3v3m5-3v3m5-3v3M7 18v3m5-3v3m5-3v3" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  sparkle: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  microphone: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0m-7 7v4m-4 0h8" /></>,
  gamepad: <><path d="M7 8h10a5 5 0 0 1 4.8 6.4l-1 3.5a2.5 2.5 0 0 1-4.1 1.1L14 17h-4l-2.7 2a2.5 2.5 0 0 1-4.1-1.1l-1-3.5A5 5 0 0 1 7 8Z" /><path d="M7 11v4m-2-2h4m7-.5h.01m3 2h.01" /></>,
  vr: <><path d="M3 9.5A2.5 2.5 0 0 1 5.5 7h13A2.5 2.5 0 0 1 21 9.5v6a2.5 2.5 0 0 1-3.4 2.3l-3.8-1.5h-3.6l-3.8 1.5A2.5 2.5 0 0 1 3 15.5Z" /><circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" /></>,
  drone: <><path d="M12 10v4m-3-2h6M8 9 5 6m11 3 3-3M8 15l-3 3m11-3 3 3" /><circle cx="12" cy="12" r="2" /><path d="M3 5h4M17 5h4M3 19h4m10 0h4" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22Z" /><path d="M4 5.5v16.5m4-15h8m-8 4h8" /></>,
  projector: <><rect x="3" y="7" width="13" height="10" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="m16 10 5-2v8l-5-2M7 17l-1 3m7-3 1 3" /></>,
  home: <><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-6v-6h-4v6H4a1 1 0 0 1-1-1Z" /><path d="M8 10h.01M16 10h.01" /></>,
};

export default function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
