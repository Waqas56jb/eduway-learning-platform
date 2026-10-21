import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en_common from './locales/en/common.json';
import en_onboarding from './locales/en/onboarding.json';
import en_auth from './locales/en/auth.json';
import en_home from './locales/en/home.json';
import en_subjects from './locales/en/subjects.json';
import en_lesson from './locales/en/lesson.json';
import en_quiz from './locales/en/quiz.json';
import en_practice from './locales/en/practice.json';
import en_mistakes from './locales/en/mistakes.json';
import en_exams from './locales/en/exams.json';
import en_tutor from './locales/en/tutor.json';
import en_progress from './locales/en/progress.json';
import en_subscription from './locales/en/subscription.json';
import en_notifications from './locales/en/notifications.json';
import en_settings from './locales/en/settings.json';
import en_legal from './locales/en/legal.json';
import en_validation from './locales/en/validation.json';
import ar_common from './locales/ar/common.json';
import ar_onboarding from './locales/ar/onboarding.json';
import ar_auth from './locales/ar/auth.json';
import ar_home from './locales/ar/home.json';
import ar_subjects from './locales/ar/subjects.json';
import ar_lesson from './locales/ar/lesson.json';
import ar_quiz from './locales/ar/quiz.json';
import ar_practice from './locales/ar/practice.json';
import ar_mistakes from './locales/ar/mistakes.json';
import ar_exams from './locales/ar/exams.json';
import ar_tutor from './locales/ar/tutor.json';
import ar_progress from './locales/ar/progress.json';
import ar_subscription from './locales/ar/subscription.json';
import ar_notifications from './locales/ar/notifications.json';
import ar_settings from './locales/ar/settings.json';
import ar_legal from './locales/ar/legal.json';
import ar_validation from './locales/ar/validation.json';

/**
 * Translation namespaces. Each feature owns one JSON file per language in ./locales/<lang>/<ns>.json.
 * Use keys as 'ns:key.path' (e.g. t('home:greeting.evening', { name })) or useTranslation('home').
 */
export const namespaces = ['common','onboarding','auth','home','subjects','lesson','quiz','practice','mistakes','exams','tutor','progress','subscription','notifications','settings','legal','validation'] as const;
export type Namespace = (typeof namespaces)[number];

export const resources = {
  en: { common: en_common, onboarding: en_onboarding, auth: en_auth, home: en_home, subjects: en_subjects, lesson: en_lesson, quiz: en_quiz, practice: en_practice, mistakes: en_mistakes, exams: en_exams, tutor: en_tutor, progress: en_progress, subscription: en_subscription, notifications: en_notifications, settings: en_settings, legal: en_legal, validation: en_validation },
  ar: { common: ar_common, onboarding: ar_onboarding, auth: ar_auth, home: ar_home, subjects: ar_subjects, lesson: ar_lesson, quiz: ar_quiz, practice: ar_practice, mistakes: ar_mistakes, exams: ar_exams, tutor: ar_tutor, progress: ar_progress, subscription: ar_subscription, notifications: ar_notifications, settings: ar_settings, legal: ar_legal, validation: ar_validation },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ar',
  fallbackLng: 'en',
  ns: [...namespaces],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
