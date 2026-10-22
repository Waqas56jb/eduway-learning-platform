/** Unsplash image registry. All URLs are built with consistent crop/quality params. */
const u = (id: string, w = 1600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const img = (id: string, w?: number) => u(id, w);

export const IMAGES = {
  hero: u('1522202176988-66273c2fd55f', 2000),
  classroom: u('1580582932707-520aed937b7b'),
  studentBooks: u('1571260899304-425eee4c7efc'),
  studentLaptop: u('1544717305-2782549b5136'),
  laptopStudy: u('1501504905252-473c47e087f8'),
  writing: u('1434030216411-0b793f4b4173'),
  library: u('1524995997946-a1c2e315a42f'),
  books: u('1497633762265-9d179a990aa6'),
  openBooks: u('1456513080510-7bf3a84b82f8'),
  education: u('1503676260728-1c00da094a0b'),
  libraryAisle: u('1427504494785-3a9ca7044f45'),
  // 1541339907198 (graduates, Singapore skyline) intentionally not used for an Iraqi brand.
  math: u('1635070041078-e363dbe005cb'),
  physics: u('1636466497217-26a8cbeaf0aa'),
  chemistry: u('1603126857599-f6e157fa2fe6'),
  chemistryLab: u('1532187863486-abf9dbad1b69'),
  testTubes: u('1576086213369-97a306d36557'),
  lab: u('1581093450021-4a7360e9a6b5'),
  scienceLab: u('1507413245164-6160d8298b31'),
  biology: u('1530026405186-ed1f139313f8'),
  microscope: u('1532094349884-543bc11b234d'),
  dna: u('1614935151651-0bea6508db6b'),
  english: u('1546410531-bb4caa6b424d'),
} as const;

export const AVATARS = [
  u('1500648767791-00dcc994a43e', 200),
  u('1494790108377-be9c29b29330', 200),
  u('1507003211169-0a1dd7228f2d', 200),
  u('1438761681033-6461ffad8d80', 200),
  u('1472099645785-5658abf4ff4e', 200),
  u('1534528741775-53994a69daeb', 200),
  u('1506794778202-cad84cf45f1d', 200),
  u('1544005313-94ddf0286df2', 200),
];

/** Inline SVG fallback used when a remote image fails to load. */
export const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#15325C"/><stop offset="1" stop-color="#0B1F3A"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><path d="M400 190 300 236l100 46 76-35v52h16v-60l-92-49Z" fill="#C9A24A" opacity=".85"/><path d="M342 262v34c0 14 26 26 58 26s58-12 58-26v-34l-58 27-58-27Z" fill="#E6C77A" opacity=".7"/></svg>`,
  );
