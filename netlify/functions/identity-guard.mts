import type { UserSignupEvent } from '@netlify/functions';

export default {
  userSignup(event: UserSignupEvent) {
    if (!event.user.invitedAt) return event.deny();
  },
};
