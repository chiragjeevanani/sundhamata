// Sundhamata Mobile - Loyalty program content (static copy shown in the customer app).
// Balances, rates and transactions come from the API.

export const LOYALTY_EARNING_METHODS = [
  {
    id: 'earn-purchase',
    title: 'Purchase Products',
    description: 'Earn points when you purchase eligible smartphones and electronics from Sundhamata Mobile.',
    tag: '+ Points',
  },
  {
    id: 'earn-offers',
    title: 'Special Offers',
    description: 'Earn extra points during selected festival campaigns and promotional periods.',
    tag: 'Bonus Points',
  },
  {
    id: 'earn-occasions',
    title: 'Special Occasions',
    description: 'Receive customer anniversary and milestone rewards directly in your points balance.',
    tag: 'Bonus Points',
  },
];

export const LOYALTY_PROGRAM_STEPS = [
  {
    step: 1,
    title: 'Shop',
    description: 'Purchase eligible products from Sundhamata Mobile.',
  },
  {
    step: 2,
    title: 'Earn',
    description: 'Points are added to your account based on eligible purchases.',
  },
  {
    step: 3,
    title: 'Redeem',
    description: 'Use available points toward eligible store rewards and benefits.',
  },
];
