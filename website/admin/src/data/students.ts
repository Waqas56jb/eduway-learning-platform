import type { AcquisitionSource, DeviceSession, Entitlement, Student, SubscriptionStatus } from '@/types';
import { createRng, daysAgo, daysAhead } from '@/utils/random';
import { GOV_WEIGHTS } from './geo';
import { packages } from './packages';
import { schools } from './partners';

const rng = createRng(611);

const MALE: [string, string][] = [
  ['Ali', 'علي'], ['Hussein', 'حسين'], ['Mohammed', 'محمد'], ['Ahmed', 'أحمد'], ['Mustafa', 'مصطفى'],
  ['Hassan', 'حسن'], ['Abbas', 'عباس'], ['Murtadha', 'مرتضى'], ['Sajjad', 'سجاد'], ['Yousif', 'يوسف'],
  ['Omar', 'عمر'], ['Zaid', 'زيد'], ['Karrar', 'كرار'], ['Hayder', 'حيدر'], ['Muntadhar', 'منتظر'],
  ['Abdullah', 'عبدالله'], ['Ibrahim', 'إبراهيم'], ['Mahdi', 'مهدي'], ['Bilal', 'بلال'], ['Ammar', 'عمار'],
];
const FEMALE: [string, string][] = [
  ['Zahraa', 'زهراء'], ['Fatima', 'فاطمة'], ['Maryam', 'مريم'], ['Noor', 'نور'], ['Ruqaya', 'رقية'],
  ['Zainab', 'زينب'], ['Sara', 'سارة'], ['Aya', 'آية'], ['Huda', 'هدى'], ['Tabarak', 'تبارك'],
  ['Ghadeer', 'غدير'], ['Hawraa', 'حوراء'], ['Ban', 'بان'], ['Shahad', 'شهد'], ['Rusul', 'رسل'],
  ['Dhuha', 'ضحى'], ['Mariam', 'ماريا'], ['Duaa', 'دعاء'], ['Israa', 'إسراء'], ['Yaqeen', 'يقين'],
];
const FATHER: [string, string][] = [
  ['Kareem', 'كريم'], ['Jasim', 'جاسم'], ['Salman', 'سلمان'], ['Adnan', 'عدنان'], ['Faleh', 'فالح'],
  ['Hameed', 'حميد'], ['Raad', 'رعد'], ['Saad', 'سعد'], ['Majid', 'ماجد'], ['Nasser', 'ناصر'],
  ['Qais', 'قيس'], ['Talib', 'طالب'], ['Wissam', 'وسام'], ['Khalid', 'خالد'], ['Jabbar', 'جبار'],
];
const FAMILY: [string, string][] = [
  ['Al-Saadi', 'الساعدي'], ['Al-Jubouri', 'الجبوري'], ['Al-Tamimi', 'التميمي'], ['Al-Maliki', 'المالكي'],
  ['Al-Rubaie', 'الربيعي'], ['Al-Obaidi', 'العبيدي'], ['Al-Khafaji', 'الخفاجي'], ['Al-Mousawi', 'الموسوي'],
  ['Al-Zubaidi', 'الزبيدي'], ['Al-Shammari', 'الشمري'], ['Al-Dulaimi', 'الدليمي'], ['Al-Hashimi', 'الهاشمي'],
  ['Al-Asadi', 'الأسدي'], ['Al-Kaabi', 'الكعبي'], ['Al-Lami', 'اللامي'], ['Al-Bayati', 'البياتي'],
];

const DEVICES: [string, DeviceSession['platform']][] = [
  ['Samsung Galaxy A54', 'android'], ['iPhone 13', 'ios'], ['Xiaomi Redmi Note 12', 'android'],
  ['iPhone 15 Pro', 'ios'], ['Huawei Nova 11', 'android'], ['Chrome on Windows', 'web'],
  ['Samsung Galaxy Tab S8', 'android'], ['Safari on MacBook', 'web'], ['Oppo Reno 10', 'android'],
];
const CITIES = ['Baghdad, IQ', 'Basra, IQ', 'Najaf, IQ', 'Karbala, IQ', 'Mosul, IQ', 'Erbil, IQ', 'Hilla, IQ'];

const NOTE_BODIES = [
  'Student called about video buffering on mobile data. Advised switching to 480p — resolved.',
  'Parent requested invoice copy for the annual package. Sent via WhatsApp.',
  'Payment via ZainCash showed pending for 2 hours; confirmed after gateway webhook retry.',
  'Asked to move enrollment to a different school code. Pending verification from school admin.',
  'Reported a wrong answer key on Chemistry quiz (Ionic Equilibrium). Escalated to academic team.',
  'Locked out after OTP attempts; reset OTP counter and verified identity via registered mobile.',
];
const NOTE_AUTHORS = ['Mariam Abbas', 'Huda Kareem', 'Ahmed Al-Rikabi'];

const mobile = () =>
  `+964 7${rng.pick(['70', '71', '72', '73', '74', '75', '77', '78', '79', '80', '81', '90'])} ${rng.int(100, 999)} ${rng.int(1000, 9999)}`;

export const students: Student[] = Array.from({ length: 120 }, (_, i) => {
  const gender = rng.bool(0.52) ? 'female' : 'male';
  const [fEn, fAr] = rng.pick(gender === 'female' ? FEMALE : MALE);
  const [pEn, pAr] = rng.pick(FATHER);
  const [lEn, lAr] = rng.pick(FAMILY);

  const school = rng.bool(0.58) ? rng.pick(schools.filter((s) => s.status !== 'suspended')) : null;
  const governorateId = school ? school.governorateId : rng.weighted(GOV_WEIGHTS);

  const packageId = rng.weighted<string | null>([['pkg_full', 45], ['pkg_sci', 20], ['pkg_math', 15], [null, 20]]);
  const createdDays = Math.floor(Math.pow(rng.next(), 1.6) * 330) + 1;

  let subscriptionStatus: SubscriptionStatus = 'none';
  if (packageId) {
    subscriptionStatus = rng.weighted<SubscriptionStatus>([['active', 80], ['expired', 10], ['cancelled', 3], ['trial', 7]]);
  } else if (rng.bool(0.35)) {
    subscriptionStatus = 'trial';
  }

  const pkg = packages.find((p) => p.id === packageId);
  const expiresAt =
    subscriptionStatus === 'active' || subscriptionStatus === 'trial'
      ? daysAhead(subscriptionStatus === 'trial' ? rng.int(1, 7) : rng.int(30, 280))
      : subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled'
        ? daysAgo(rng.int(2, 60))
        : null;
  const entitlements: Entitlement[] =
    pkg && expiresAt ? pkg.subjectIds.map((subjectId) => ({ subjectId, expiresAt, source: 'package' as const })) : [];
  if (i % 17 === 3) entitlements.push({ subjectId: 'sub_eng', expiresAt: daysAhead(45), source: 'manual' });

  let source: AcquisitionSource = rng.weighted<AcquisitionSource>([['organic', 40], ['referral', 15], ['campaign', 15]]);
  if (school) source = rng.bool(0.6) ? 'school' : school.marketerId ? 'marketer' : 'school';
  const marketerId = school && (source === 'school' || source === 'marketer') ? school.marketerId : null;
  const referralCode =
    source === 'school' && school ? school.code : source === 'referral' ? `REF-${lEn.slice(3, 6).toUpperCase()}${rng.int(10, 99)}` : source === 'campaign' ? 'BACK2SCHOOL26' : null;

  const sessionCount = rng.int(1, 3);
  const sessions: DeviceSession[] = Array.from({ length: sessionCount }, (_, k) => {
    const [device, platform] = rng.pick(DEVICES);
    return {
      id: `ses_${i}_${k}`,
      device,
      platform,
      ip: `${rng.pick(['37.236', '185.81', '149.255', '5.62', '178.238'])}.${rng.int(1, 254)}.${rng.int(1, 254)}`,
      location: rng.pick(CITIES),
      lastSeen: daysAgo(k === 0 ? 0 : rng.int(1, 20), rng.int(0, 20)),
      current: k === 0,
    };
  });

  const notes =
    rng.bool(0.22)
      ? [{ id: `note_${i}`, author: rng.pick(NOTE_AUTHORS), body: rng.pick(NOTE_BODIES), createdAt: daysAgo(rng.int(1, 40)) }]
      : [];

  const active = subscriptionStatus === 'active';
  return {
    id: `stu_${String(i + 1).padStart(4, '0')}`,
    name_en: `${fEn} ${pEn} ${lEn}`,
    name_ar: `${fAr} ${pAr} ${lAr}`,
    mobile: mobile(),
    email: rng.bool(0.4) ? `${fEn.toLowerCase()}.${lEn.slice(3).toLowerCase()}${rng.int(1, 99)}@gmail.com` : null,
    gender,
    avatar: null,
    governorateId,
    schoolId: school?.id ?? null,
    packageId: packageId,
    subscriptionStatus,
    subscriptionExpiresAt: expiresAt,
    entitlements,
    source,
    referralCode,
    marketerId,
    locked: rng.bool(0.04),
    lastActive: daysAgo(active ? rng.int(0, 6) : rng.int(3, 90), rng.int(0, 23)),
    createdAt: daysAgo(createdDays, rng.int(0, 23)),
    progress: active ? rng.int(12, 96) : rng.int(0, 35),
    avgScore: active ? rng.int(48, 97) : rng.int(30, 75),
    aiQuestionsUsed: active ? rng.int(0, 100) : rng.int(0, 12),
    sessions,
    notes,
  };
});

export const studentById = (id: string | null | undefined) => students.find((s) => s.id === id);
