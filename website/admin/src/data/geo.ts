import type { Governorate } from '@/types';

export const governorates: Governorate[] = [
  { id: 'gov_bgd', name_en: 'Baghdad', name_ar: 'بغداد' },
  { id: 'gov_bsr', name_en: 'Basra', name_ar: 'البصرة' },
  { id: 'gov_nin', name_en: 'Nineveh', name_ar: 'نينوى' },
  { id: 'gov_erb', name_en: 'Erbil', name_ar: 'أربيل' },
  { id: 'gov_njf', name_en: 'Najaf', name_ar: 'النجف' },
  { id: 'gov_krb', name_en: 'Karbala', name_ar: 'كربلاء' },
  { id: 'gov_bab', name_en: 'Babil', name_ar: 'بابل' },
  { id: 'gov_diy', name_en: 'Diyala', name_ar: 'ديالى' },
  { id: 'gov_anb', name_en: 'Anbar', name_ar: 'الأنبار' },
  { id: 'gov_krk', name_en: 'Kirkuk', name_ar: 'كركوك' },
  { id: 'gov_dhq', name_en: 'Dhi Qar', name_ar: 'ذي قار' },
  { id: 'gov_mys', name_en: 'Maysan', name_ar: 'ميسان' },
  { id: 'gov_was', name_en: 'Wasit', name_ar: 'واسط' },
  { id: 'gov_qad', name_en: 'Al-Qadisiyyah', name_ar: 'القادسية' },
  { id: 'gov_mut', name_en: 'Muthanna', name_ar: 'المثنى' },
  { id: 'gov_sal', name_en: 'Saladin', name_ar: 'صلاح الدين' },
  { id: 'gov_sul', name_en: 'Sulaymaniyah', name_ar: 'السليمانية' },
  { id: 'gov_duh', name_en: 'Duhok', name_ar: 'دهوك' },
];

export const governorateById = (id: string | null | undefined) =>
  governorates.find((g) => g.id === id);

/** Weighted distribution used when generating students. */
export const GOV_WEIGHTS: [string, number][] = [
  ['gov_bgd', 30],
  ['gov_bsr', 12],
  ['gov_nin', 8],
  ['gov_njf', 7],
  ['gov_krb', 6],
  ['gov_bab', 6],
  ['gov_erb', 5],
  ['gov_dhq', 5],
  ['gov_diy', 4],
  ['gov_was', 3],
  ['gov_qad', 3],
  ['gov_krk', 3],
  ['gov_anb', 3],
  ['gov_mys', 2],
  ['gov_sal', 2],
  ['gov_mut', 1],
  ['gov_sul', 1],
  ['gov_duh', 1],
];
