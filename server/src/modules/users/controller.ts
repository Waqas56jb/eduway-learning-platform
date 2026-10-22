import { entitlements } from '../../common/entitlements.js';
import { OK } from '../../common/dto/refs.js';
import type { StudentPrincipal } from '../../common/types/index.js';
import { confirmEmail, requestEmailVerification } from './email-verification.js';
import { usersService, type UpdateMeInput } from './service.js';
import type { NotificationPrefs } from './types.js';

export const usersController = {
  me: (s: StudentPrincipal) => usersService.me(s.userId),
  update: (s: StudentPrincipal, body: UpdateMeInput) => usersService.update(s.userId, body),
  sessions: (s: StudentPrincipal) => usersService.sessions(s),
  async revokeSession(s: StudentPrincipal, id: string) {
    await usersService.revokeSession(s, id);
    return OK;
  },
  revokeOthers: (s: StudentPrincipal) => usersService.revokeOthers(s),
  devices: (s: StudentPrincipal) => usersService.devices(s.userId),
  async setPushToken(s: StudentPrincipal, body: { token: string; provider: 'expo'; platform: 'ios' | 'android'; deviceId: string }) {
    await usersService.setPushToken(s, body);
    return OK;
  },
  async removePushToken(s: StudentPrincipal, token: string) {
    await usersService.removePushToken(s.userId, token);
    return OK;
  },
  getPrefs: (s: StudentPrincipal) => usersService.getPrefs(s.userId),
  setPrefs: (s: StudentPrincipal, body: Partial<NotificationPrefs>) => usersService.setPrefs(s.userId, body),
  entitlements: (s: StudentPrincipal) => entitlements.dtos(s.userId),
  requestEmailVerification: (s: StudentPrincipal, ip: string | null) => requestEmailVerification(s.userId, ip),
  confirmEmail: (token: string) => confirmEmail(token),
};
