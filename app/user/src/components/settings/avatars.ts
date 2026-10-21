const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=200&q=80`;

/** Mock avatar gallery for the edit-profile picker. */
export const AVATAR_OPTIONS: readonly string[] = [
  u('photo-1506794778202-cad84cf45f1d'),
  u('photo-1500648767791-00dcc994a43e'),
  u('photo-1507003211169-0a1dd7228f2d'),
  u('photo-1534528741775-53994a69daeb'),
];
