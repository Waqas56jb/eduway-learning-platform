import type { AdminSession, SecurityAlert } from '@/types';
import { daysAgo } from '@/utils/random';

export const adminSessions: AdminSession[] = [
  { id: 'as_01', adminId: 'adm_1', device: 'Windows 11 PC', browser: 'Chrome 129', ip: '185.81.140.22', location: 'Baghdad, IQ', startedAt: daysAgo(0, 2), lastActive: daysAgo(0), current: true },
  { id: 'as_02', adminId: 'adm_1', device: 'iPhone 15 Pro', browser: 'Safari 18', ip: '37.236.18.4', location: 'Baghdad, IQ', startedAt: daysAgo(2, 5), lastActive: daysAgo(0, 9), current: false },
  { id: 'as_03', adminId: 'adm_2', device: 'MacBook Air', browser: 'Safari 18', ip: '149.255.200.17', location: 'Baghdad, IQ', startedAt: daysAgo(0, 6), lastActive: daysAgo(0, 1), current: false },
  { id: 'as_04', adminId: 'adm_3', device: 'Windows 10 PC', browser: 'Edge 129', ip: '5.62.61.92', location: 'Najaf, IQ', startedAt: daysAgo(1, 3), lastActive: daysAgo(1, 1), current: false },
  { id: 'as_05', adminId: 'adm_3', device: 'Samsung Galaxy Tab S8', browser: 'Chrome 129', ip: '5.62.61.104', location: 'Najaf, IQ', startedAt: daysAgo(3, 2), lastActive: daysAgo(2, 4), current: false },
  { id: 'as_06', adminId: 'adm_4', device: 'Windows 11 PC', browser: 'Chrome 129', ip: '178.238.4.130', location: 'Basra, IQ', startedAt: daysAgo(0, 8), lastActive: daysAgo(0, 7), current: false },
  { id: 'as_07', adminId: 'adm_5', device: 'Windows 11 PC', browser: 'Firefox 131', ip: '185.81.141.9', location: 'Baghdad, IQ', startedAt: daysAgo(0, 3), lastActive: daysAgo(0), current: false },
  { id: 'as_08', adminId: 'adm_5', device: 'Xiaomi Redmi Note 12', browser: 'Chrome Mobile 129', ip: '37.236.90.51', location: 'Erbil, IQ', startedAt: daysAgo(4, 1), lastActive: daysAgo(3, 6), current: false },
  { id: 'as_09', adminId: 'adm_2', device: 'Windows 11 PC', browser: 'Chrome 129', ip: '94.200.18.77', location: 'Dubai, AE', startedAt: daysAgo(1, 11), lastActive: daysAgo(1, 10), current: false },
  { id: 'as_10', adminId: 'adm_1', device: 'MacBook Pro', browser: 'Chrome 129', ip: '185.81.140.31', location: 'Baghdad, IQ', startedAt: daysAgo(5, 2), lastActive: daysAgo(4, 8), current: false },
];

export const securityAlerts: SecurityAlert[] = [
  { id: 'al_01', kind: 'otp_bruteforce', severity: 'critical', subject: '+964 781 ••• 4410', subjectId: 'stu_0042', detail: '14 failed OTP attempts in 6 minutes from 3 different IP addresses. Mobile number temporarily rate-limited.', status: 'open', createdAt: daysAgo(0, 6) },
  { id: 'al_02', kind: 'multiple_devices', severity: 'high', subject: 'Zahraa Kareem Al-Saadi', subjectId: 'stu_0017', detail: 'Account active on 5 devices within 24 hours (limit is 2). Possible credential sharing.', status: 'open', createdAt: daysAgo(0, 9) },
  { id: 'al_03', kind: 'unusual_location', severity: 'medium', subject: 'Huda Kareem', subjectId: 'adm_2', detail: 'Admin sign-in from Dubai, AE — first time outside Iraq. 2FA passed.', status: 'open', createdAt: daysAgo(1, 10) },
  { id: 'al_04', kind: 'payment_fraud', severity: 'high', subject: 'Ali Jasim Al-Tamimi', subjectId: 'stu_0063', detail: '3 card payments declined then 1 approved with a different card within 10 minutes (Visa gateway).', status: 'open', createdAt: daysAgo(1, 3) },
  { id: 'al_05', kind: 'admin_login_failure', severity: 'high', subject: 'rana.tamimi@eduway.iq', subjectId: 'adm_6', detail: '7 failed admin password attempts for an invited (not yet activated) account.', status: 'open', createdAt: daysAgo(2, 1) },
  { id: 'al_06', kind: 'multiple_devices', severity: 'medium', subject: 'Hussein Raad Al-Maliki', subjectId: 'stu_0008', detail: 'Simultaneous playback on 3 devices in Basra and Baghdad.', status: 'open', createdAt: daysAgo(2, 7) },
  { id: 'al_07', kind: 'otp_bruteforce', severity: 'medium', subject: '+964 770 ••• 2291', subjectId: 'stu_0091', detail: '6 failed OTP attempts; lockout applied for 15 minutes.', status: 'resolved', createdAt: daysAgo(3, 4) },
  { id: 'al_08', kind: 'unusual_location', severity: 'low', subject: 'Maryam Saad Al-Rubaie', subjectId: 'stu_0055', detail: 'Login from Istanbul, TR while travelling. Device unchanged.', status: 'resolved', createdAt: daysAgo(4, 2) },
  { id: 'al_09', kind: 'payment_fraud', severity: 'critical', subject: 'Mustafa Faleh Al-Obaidi', subjectId: 'stu_0110', detail: 'Chargeback received from ZainCash for a paid annual package after full course download.', status: 'blocked', createdAt: daysAgo(5, 3) },
  { id: 'al_10', kind: 'admin_login_failure', severity: 'low', subject: 'mariam.abbas@eduway.iq', subjectId: 'adm_5', detail: '3 failed 2FA codes, then successful sign-in.', status: 'resolved', createdAt: daysAgo(6, 1) },
  { id: 'al_11', kind: 'multiple_devices', severity: 'low', subject: 'Noor Hameed Al-Zubaidi', subjectId: 'stu_0024', detail: 'New tablet registered; previous phone still signed in.', status: 'open', createdAt: daysAgo(7, 5) },
  { id: 'al_12', kind: 'otp_bruteforce', severity: 'high', subject: '+964 790 ••• 7018', subjectId: null, detail: 'OTP requests for 40 sequential numbers from one IP (185.220.101.4). IP blocked at the gateway.', status: 'blocked', createdAt: daysAgo(9, 2) },
];
