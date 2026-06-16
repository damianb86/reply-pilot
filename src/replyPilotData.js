export const onboardingSteps = [
  {
    id: 'connect',
    step: '1',
    title: 'Connect a review source',
    description: 'Paste review source credentials',
  },
  {
    id: 'voice',
    step: '2',
    title: 'Train your brand voice',
    description: 'Paste 5-10 past replies',
  },
  {
    id: 'approve',
    step: '3',
    title: 'Approve and ship',
    description: 'One by one or in bulk',
  },
];

export const reviewSources = [
  {
    id: 'judgeme',
    initials: 'J.',
    name: 'Judge.me',
    status: 'recommended',
    detail: 'Pulls the last 90 days of reviews. Read and write access. Revoke anytime from Judge.me.',
    merchants: '37k merchants',
    available: true,
  },
  {
    id: 'loox',
    initials: 'L',
    name: 'Loox',
    detail: 'Photo and video reviews',
    votes: 218,
  },
  {
    id: 'yotpo',
    initials: 'Y',
    name: 'Yotpo',
    detail: 'Imports Yotpo reviews and sends public comments from the queue.',
    merchants: 'Yotpo merchants',
    available: true,
  },
  {
    id: 'stamped',
    initials: 'St',
    name: 'Stamped',
    detail: 'Reviews and UGC',
    votes: 92,
  },
  {
    id: 'google',
    initials: 'G',
    name: 'Google Business',
    detail: 'Local profile reviews',
    votes: 81,
  },
  {
    id: 'trustpilot',
    initials: 'T',
    name: 'Trustpilot',
    detail: 'Public profile reviews',
    votes: 67,
  },
  {
    id: 'shopify',
    initials: 'S',
    name: 'Shopify Reviews',
    detail: 'Native Shopify reviews',
    votes: 44,
  },
];
