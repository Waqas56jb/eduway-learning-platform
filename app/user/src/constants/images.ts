/** Neutral navy/cream blurhash used as the placeholder for every remote image. */
export const BLURHASH = 'L35#hiof00WB~qj[IUay00ay?bof';

const u = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

/** Curated HD imagery (students, labs, libraries, graduation). */
export const images = {
  onboardingStudents: u('photo-1523240795612-9a054b0db644'),
  onboardingLibrary: u('photo-1521587760476-6c12a4b040da'),
  onboardingLab: u('photo-1532094349884-543bc11b234d'),
  graduation: u('photo-1541339907198-e08756dedf3f'),
  chemistryGlassware: u('photo-1603126857599-f6e157fa2fe6'),
  mathBoard: u('photo-1635070041078-e363dbe005cb'),
  physics: u('photo-1636466497217-26a8cbeaf0aa'),
  microscope: u('photo-1576086213369-97a306d36557'),
  studyDesk: u('photo-1434030216411-0b793f4b4173'),
  teacher: u('photo-1544717305-2782549b5136', 400),
  avatarStudent: u('photo-1506794778202-cad84cf45f1d', 200),
} as const;
