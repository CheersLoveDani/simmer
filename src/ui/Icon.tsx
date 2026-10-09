const PATHS = {
  home: 'M4 11.5 12 4l8 7.5M6.5 10v9.5h11V10',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  calendar: 'M5 6.5h14v13H5zM5 10.5h14M9 4v4M15 4v4',
  basket: 'M4 9.5h16l-1.6 9.5H5.6L4 9.5ZM8.5 9.5 11 4M15.5 9.5 13 4',
  heart: 'M12 19.5s-7.5-4.4-7.5-9.7A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4c0 5.3-7.5 9.7-7.5 9.7Z',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18',
  clock: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 7.5V12l3 2',
  timer: 'M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM12 9.5v4M9.5 3h5M18 7l1.5-1.5',
  back: 'M14.5 5.5 8 12l6.5 6.5',
  forward: 'M9.5 5.5 16 12l-6.5 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5 10 17.5 19 7',
  filter: 'M4 7h16M7 12h10M10 17h4',
  share: 'M12 15V4M8 7.5 12 4l4 3.5M6 12v7.5h12V12',
  play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
  pause: 'M8.5 5.5v13M15.5 5.5v13',
  trash: 'M5 7h14M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7',
  star: 'm12 4 2.4 5.2 5.6.7-4.1 3.9 1 5.6-4.9-2.8-4.9 2.8 1-5.6-4.1-3.9 5.6-.7L12 4Z',
  pot: 'M5 10.5h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5ZM3 10.5h18M9 7c0-1.5 1.5-1.5 1.5-3M13.5 7c0-1.5 1.5-1.5 1.5-3',
  note: 'M6 4.5h12v15H6zM9 9h6M9 12.5h6M9 16h3',
  print: 'M7 9V4.5h10V9M7 16.5H4.5V9h15v7.5H17M7 13.5h10v6H7z',
  refresh: 'M19 12a7 7 0 1 1-2.2-5.1M19 5v4h-4',
  folder: 'M4 7.5V18h16V9.5h-8l-2-2H4Z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  expand: 'M5 9.5V5h4.5M19 14.5V19h-4.5M5 5l5.5 5.5M19 19l-5.5-5.5',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
} as const;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 22, filled = false, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={name === 'dots' ? 2.6 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
