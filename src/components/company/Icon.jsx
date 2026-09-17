const paths = {
  tag: 'M20 13 11 22 2 13V2h11l9 9-2 2M7 7h.01',
  more: 'M4 6h16M4 12h16M4 18h16',
  orders: 'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M8 2h8v4H8zM7 11h10M7 16h7',
  delivery: 'M1 5h13v12H1zM14 9h4l4 5v3h-8M5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  check: 'M20 6 9 17l-5-5',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',
  menu: 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5',
  chat: 'M21 12a9 9 0 0 1-9 9H3l1.7-4.3A9 9 0 1 1 21 12M8 10h8M8 14h5',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  print: 'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6zM17 11h1',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  close: 'm6 6 12 12M6 18 18 6',
  exit: 'M9 3H3v18h6M10 12h11m-5-5 5 5-5 5',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  help: 'M9 8a3 3 0 1 1 5 3c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
}
export default function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.orders} /></svg>
}
