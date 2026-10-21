import type { Localized } from '@/types';

export interface School {
  id: string;
  name: Localized;
  /** Governorate id (see `governorates` in `@/data`). */
  governorate: string;
}

/** Mock directory of Iraqi preparatory (secondary) schools offering the 6th Scientific track. */
export const schools: School[] = [
  { id: 'baghdad-college', name: { en: 'Baghdad College Preparatory School', ar: 'إعدادية كلية بغداد' }, governorate: 'baghdad' },
  { id: 'markaziya', name: { en: 'Al-Markaziya Preparatory School for Boys', ar: 'الإعدادية المركزية للبنين' }, governorate: 'baghdad' },
  { id: 'mansour-distinguished', name: { en: 'Al-Mansour School for Distinguished Students', ar: 'ثانوية المنصور للمتميزين' }, governorate: 'baghdad' },
  { id: 'adhamiya-girls', name: { en: 'Al-Adhamiya Preparatory School for Girls', ar: 'إعدادية الأعظمية للبنات' }, governorate: 'baghdad' },
  { id: 'kadhimiya', name: { en: 'Al-Kadhimiya Preparatory School for Boys', ar: 'إعدادية الكاظمية للبنين' }, governorate: 'baghdad' },
  { id: 'basra-jumhuriya', name: { en: 'Al-Jumhuriya Preparatory School – Basra', ar: 'إعدادية الجمهورية – البصرة' }, governorate: 'basra' },
  { id: 'basra-distinguished', name: { en: 'Basra School for Distinguished Students', ar: 'ثانوية البصرة للمتميزين' }, governorate: 'basra' },
  { id: 'mosul-central', name: { en: 'Mosul Central Preparatory School', ar: 'الإعدادية المركزية في الموصل' }, governorate: 'nineveh' },
  { id: 'mosul-hadbaa', name: { en: 'Al-Hadbaa Preparatory School for Girls', ar: 'إعدادية الحدباء للبنات' }, governorate: 'nineveh' },
  { id: 'erbil-scientific', name: { en: 'Erbil Scientific Preparatory School', ar: 'الإعدادية العلمية في أربيل' }, governorate: 'erbil' },
  { id: 'najaf-distinguished', name: { en: 'Al-Najaf School for Distinguished Students', ar: 'ثانوية النجف للمتميزين' }, governorate: 'najaf' },
  { id: 'kufa', name: { en: 'Al-Kufa Preparatory School for Boys', ar: 'إعدادية الكوفة للبنين' }, governorate: 'najaf' },
  { id: 'karbala-hussein', name: { en: 'Al-Hussein Preparatory School – Karbala', ar: 'إعدادية الحسين – كربلاء' }, governorate: 'karbala' },
  { id: 'hilla', name: { en: 'Al-Hilla Preparatory School for Boys', ar: 'إعدادية الحلة للبنين' }, governorate: 'babylon' },
  { id: 'nasiriyah', name: { en: 'Al-Nasiriyah Preparatory School', ar: 'إعدادية الناصرية' }, governorate: 'dhi-qar' },
  { id: 'ramadi', name: { en: 'Al-Ramadi Preparatory School for Boys', ar: 'إعدادية الرمادي للبنين' }, governorate: 'anbar' },
  { id: 'baqubah', name: { en: 'Baqubah Preparatory School', ar: 'إعدادية بعقوبة' }, governorate: 'diyala' },
  { id: 'kirkuk', name: { en: 'Kirkuk Preparatory School for Boys', ar: 'إعدادية كركوك للبنين' }, governorate: 'kirkuk' },
  { id: 'tikrit', name: { en: 'Tikrit Preparatory School', ar: 'إعدادية تكريت' }, governorate: 'saladin' },
  { id: 'kut', name: { en: 'Al-Kut Preparatory School for Girls', ar: 'إعدادية الكوت للبنات' }, governorate: 'wasit' },
  { id: 'amarah', name: { en: 'Al-Amarah Preparatory School', ar: 'إعدادية العمارة' }, governorate: 'maysan' },
  { id: 'samawah', name: { en: 'Al-Samawah Preparatory School for Boys', ar: 'إعدادية السماوة للبنين' }, governorate: 'muthanna' },
  { id: 'diwaniyah', name: { en: 'Al-Diwaniyah Preparatory School', ar: 'إعدادية الديوانية' }, governorate: 'qadisiyyah' },
  { id: 'sulaymaniyah', name: { en: 'Sulaymaniyah Scientific Preparatory School', ar: 'الإعدادية العلمية في السليمانية' }, governorate: 'sulaymaniyah' },
  { id: 'duhok', name: { en: 'Duhok Preparatory School', ar: 'إعدادية دهوك' }, governorate: 'duhok' },
];

export const getSchool = (id: string | undefined) => schools.find((s) => s.id === id);
