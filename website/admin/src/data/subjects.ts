import type { Subject, SubjectKey } from '@/types';
import { IMAGES } from '@/utils/images';

export const SUBJECT_COLORS: Record<SubjectKey, string> = {
  math: '#2563EB',
  physics: '#7C3AED',
  chemistry: '#059669',
  biology: '#DB2777',
  english: '#EA580C',
};

export const subjects: Subject[] = [
  {
    id: 'sub_math',
    key: 'math',
    name_en: 'Mathematics',
    name_ar: 'الرياضيات',
    color: SUBJECT_COLORS.math,
    image: IMAGES.math,
    order: 1,
    status: 'active',
    sequentialUnlock: true,
  },
  {
    id: 'sub_phys',
    key: 'physics',
    name_en: 'Physics',
    name_ar: 'الفيزياء',
    color: SUBJECT_COLORS.physics,
    image: IMAGES.physics,
    order: 2,
    status: 'active',
    sequentialUnlock: true,
  },
  {
    id: 'sub_chem',
    key: 'chemistry',
    name_en: 'Chemistry',
    name_ar: 'الكيمياء',
    color: SUBJECT_COLORS.chemistry,
    image: IMAGES.chemistryLab,
    order: 3,
    status: 'active',
    sequentialUnlock: false,
  },
  {
    id: 'sub_bio',
    key: 'biology',
    name_en: 'Biology',
    name_ar: 'الأحياء',
    color: SUBJECT_COLORS.biology,
    image: IMAGES.microscope,
    order: 4,
    status: 'active',
    sequentialUnlock: false,
  },
  {
    id: 'sub_eng',
    key: 'english',
    name_en: 'English',
    name_ar: 'اللغة الإنجليزية',
    color: SUBJECT_COLORS.english,
    image: IMAGES.english,
    order: 5,
    status: 'active',
    sequentialUnlock: false,
  },
];

export const SUBJECT_IDS = subjects.map((s) => s.id);
