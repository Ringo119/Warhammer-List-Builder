const P = (d: string) => () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const IconBack = P('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z');
export const IconPlus = P('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z');
export const IconMore = P('M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z');
export const IconChevron = P('M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z');
export const IconSearch = P('M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
export const IconInfo = P('M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z');
export const IconWarn = P('M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z');
export const IconCheck = P('M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z');
export const IconCopy = P('M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z');
export const IconShare = P('M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 21 5a3 3 0 1 0-5.91.7L8.04 9.81A2.99 2.99 0 0 0 3 12a2.99 2.99 0 0 0 5.04 2.19l7.12 4.16c-.05.21-.08.43-.08.65A2.92 2.92 0 1 0 18 16.08z');
export const IconTrash = P('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z');
export const IconEdit = P('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z');
export const IconDup = P('M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z');
export const IconSettings = P('M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z');
export const IconBook = P('M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z');
export const IconImport = P('M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z');
export const IconExport = P('M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z');
export const IconSplit = P('M14 4l2.29 2.29-2.88 2.88 1.42 1.42 2.88-2.88L20 10V4zm-4 0H4v6l2.29-2.29 4.71 4.7V20h2v-8.41l-5.29-5.3z');
export const IconLink = P('M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 0-10z');

/** Aquila-like crest used as the faction / app emblem */
export const Crest = () => (
  <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
    <path d="M32 10c-2.2 0-4 1.8-4 4 0 1.4.7 2.6 1.8 3.3L28 22h8l-1.8-4.7A4 4 0 0 0 36 14c0-2.2-1.8-4-4-4z" />
    <path d="M30 24h4v30l-2 4-2-4z" />
    <path d="M28 26C20 22 10 18 2 20c4 2 7 4 9 7-3 0-5 1-7 3 5 0 9 1 12 3-2 1-4 3-5 5 6-2 12-3 17-3z" />
    <path d="M36 26c8-4 18-8 26-6-4 2-7 4-9 7 3 0 5 1 7 3-5 0-9 1-12 3 2 1 4 3 5 5-6-2-12-3-17-3z" />
  </svg>
);

// simple role glyphs used in place of unit images
const G = (children: JSX.Element) => () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
);
export const RoleCharacter = G(<path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4-3.9-3.8 5.4-.8zM6 19h12v3H6z" />);
export const RoleBattleline = G(<path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm0 4 4 1.5V11c0 2.9-1.7 5.6-4 6.6-2.3-1-4-3.7-4-6.6V7.5L12 6z" />);
export const RoleInfantry = G(<path d="M12 2a6 6 0 0 0-6 6v4h2v4l4 6 4-6v-4h2V8a6 6 0 0 0-6-6zm-3 8V8a3 3 0 0 1 6 0v2z" />);
export const RoleVehicle = G(<path d="M4 15h16l-2-5h-5V7H8v3H6zM3 16v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2zm3 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />);
export const RoleMounted = G(<path d="M3 13l5-5h6l3 3h4v3h-3l-2 3H7l-2-2H3zm4 1a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />);
export const RoleTransport = G(<path d="M3 7h13l5 5v5h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3zm2 2v3h4V9zm6 0v3h4V9z" />);
export const RoleAircraft = G(<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />);
export const RoleConfig = IconSettings;
