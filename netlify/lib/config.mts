export const connector = {
  problems: {
    'cash-flow': { title: 'Business cash flow', path: '/cash-flow', solutions: ['fugio'] },
  },
  solutions: {
    fugio: {
      name: 'Fugio Funding Network',
      problem: 'cash-flow',
      destination: 'https://www.fugiofundingnetwork.com/?ref=st-pete-christine',
      allowedHost: 'www.fugiofundingnetwork.com',
      partnerSlug: 'st-pete-christine',
      partnerId: 'a05725e7-1cf5-4805-9227-0d440ee1457d',
    },
  },
} as const;

export function referralDestination() {
  const solution = connector.solutions.fugio;
  const destination = new URL(solution.destination);
  if (destination.protocol !== 'https:' || destination.hostname !== solution.allowedHost || destination.username || destination.password || destination.port) {
    throw new Error('Invalid referral configuration');
  }
  return destination.href;
}
