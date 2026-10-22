import { z } from 'zod';
import type { TFunction } from 'i18next';

/** Admin password policy (contract AUTH-16 / ADM-ME-03): ≥10 chars, upper, lower, digit, symbol. */
export const passwordSchema = (t: TFunction) =>
  z
    .string()
    .min(10, t('auth.passwordPolicy'))
    .regex(/[A-Z]/, t('auth.passwordPolicy'))
    .regex(/[a-z]/, t('auth.passwordPolicy'))
    .regex(/\d/, t('auth.passwordPolicy'))
    .regex(/[^A-Za-z0-9]/, t('auth.passwordPolicy'));
