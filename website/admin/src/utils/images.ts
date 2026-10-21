/** Unsplash image registry (same source set as the student site). */
const u = (id: string, w = 1600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const img = (id: string, w?: number) => u(id, w);

export const IMAGES = {
  login: u('1497366216548-37526070297c', 1800),
  office: u('1497366811353-6870744d04b2', 1600),
  classroom: u('1580582932707-520aed937b7b', 800),
  library: u('1524995997946-a1c2e315a42f', 800),
  math: u('1635070041078-e363dbe005cb', 800),
  physics: u('1636466497217-26a8cbeaf0aa', 800),
  chemistry: u('1603126857599-f6e157fa2fe6', 800),
  chemistryLab: u('1532187863486-abf9dbad1b69', 800),
  biology: u('1530026405186-ed1f139313f8', 800),
  microscope: u('1532094349884-543bc11b234d', 800),
  english: u('1546410531-bb4caa6b424d', 800),
  writing: u('1434030216411-0b793f4b4173', 800),
  laptopStudy: u('1501504905252-473c47e087f8', 800),
  books: u('1497633762265-9d179a990aa6', 800),
} as const;

export const THUMBS = [
  IMAGES.math,
  IMAGES.physics,
  IMAGES.chemistry,
  IMAGES.chemistryLab,
  IMAGES.biology,
  IMAGES.microscope,
  IMAGES.english,
  IMAGES.writing,
  IMAGES.laptopStudy,
  IMAGES.books,
];

export const AVATARS = [
  u('1500648767791-00dcc994a43e', 160),
  u('1494790108377-be9c29b29330', 160),
  u('1507003211169-0a1dd7228f2d', 160),
  u('1438761681033-6461ffad8d80', 160),
  u('1472099645785-5658abf4ff4e', 160),
  u('1534528741775-53994a69daeb', 160),
  u('1506794778202-cad84cf45f1d', 160),
  u('1544005313-94ddf0286df2', 160),
];

/** Inline SVG fallback used when a remote image fails to load. */
export const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#15325C"/><stop offset="1" stop-color="#0B1F3A"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><path d="M400 190 300 236l100 46 76-35v52h16v-60l-92-49Z" fill="#C9A24A" opacity=".85"/><path d="M342 262v34c0 14 26 26 58 26s58-12 58-26v-34l-58 27-58-27Z" fill="#E6C77A" opacity=".7"/></svg>`,
  );
