/* Vault — Learn content, prompts, destinations. Plain data. */
(function (global) {
  'use strict';

  const DESTINATIONS = [
    'Charity: Red Cross',
    'Charity: local food bank',
    'My accountability partner',
    'Friends pool',
    'Anti-charity (a cause I dislike)'
  ];

  const PROMPTS = [
    'What is the smallest bet you would be embarrassed to lose?',
    'Which goal have you been "about to start" for more than a week?',
    'If you lost 10 credits today, what would you do to earn them back?',
    'What got in the way last time, and is it in the way today?',
    'Name a deadline that is honest, not optimistic.',
    'What proof would convince a skeptical friend you actually did it?',
    'What would you bet on if nobody could see the result?',
    'Which habit pays off in a month, not tonight?',
    'When is your willpower lowest today? Set the deadline before that.',
    'What would make tomorrow\'s version of this 1.5× harder, and could you do it?'
  ];

  const LEARN = [
    {
      id: 'how',
      title: 'How Vault works',
      body: [
        '1. Place a bet. Pick a goal, put some credits on it, and set a deadline you actually believe.',
        '2. Prove it before the deadline. Your credits come straight back to your wallet.',
        '3. Miss it and the credits are locked in your Vault. Not gone. Locked.',
        '4. Earn them back. You get three chances to complete a harder version of the goal. Pull it off and the credits are yours again.',
        '5. If you still have credits locked after 30 days, they go to the destination you picked when you placed the bet: a charity, a friend, a pool. Never to the app.'
      ]
    },
    {
      id: 'harder',
      title: 'What counts as "harder"',
      body: [
        'The app checks this for you so you can\'t sneak in an easy one. A redemption challenge has to beat the original bet on at least one of these:',
        'More: at least 1.5× the amount. If the original was a yes/no goal, doing it twice counts.',
        'Faster: half the time window or less.',
        'Stricter: a higher proof level than the original.',
        'Finish all of it and every credit unlocks with no chance used. Finish part of it and you unlock that share, and one chance is used.'
      ]
    },
    {
      id: 'proof',
      title: 'Proof levels',
      body: [
        'Bigger stakes need stronger proof. The level you pick sets the maximum you can bet.',
        'Honor (up to 10 credits). You tick a box saying you did it. For small, everyday goals.',
        'Live photo (up to 50 credits). You take a photo inside the app, right then. No uploads from your camera roll. Your one-time proof code is stamped on the shot, and it has to be in the frame.',
        'Partner (up to 200 credits). A person you name sees your proof and approves or rejects it. Coming in Phase 1.',
        'Integration (up to 1000 credits). The proof comes automatically from another app, like a run from Strava or a screen-time report. Coming in Phase 1.',
        'AI will only ever flag obvious mismatches. A human always makes the final call.'
      ]
    },
    {
      id: 'grace',
      title: 'Grace tokens',
      body: [
        'Win three bets in a row and you earn a grace token. You can hold up to three.',
        'Spend one to push a live bet\'s deadline back 24 hours. Each bet can only be extended once.'
      ]
    },
    {
      id: 'promise',
      title: 'The promise',
      body: [
        'Vault never keeps your money. Most apps like this profit when you fail, which gives them a reason to judge you harshly. Vault earns from a subscription and a visible fee, so the app only wins when you do.',
        'Right now everything is play credits stored in your browser. Real money comes later, as an opt-in, after a lawyer has looked at it.'
      ]
    }
  ];

  // Bet templates: prefill the form so placing a bet takes under 30 seconds.
  const TEMPLATES = [
    { label: 'Study', title: 'Study 30 minutes', measure: { kind: 'duration', amount: 30, unit: 'minutes' }, stake: 10, proofTier: 1, deadline: 'tonight' },
    { label: 'Run', title: 'Run 3 km', measure: { kind: 'quantity', amount: 3, unit: 'km' }, stake: 15, proofTier: 1, deadline: '24h' },
    { label: 'Gym', title: 'Go to the gym', measure: { kind: 'binary' }, stake: 15, proofTier: 1, deadline: '24h' },
    { label: 'Read', title: 'Read 20 pages', measure: { kind: 'quantity', amount: 20, unit: 'pages' }, stake: 10, proofTier: 1, deadline: 'tonight' },
    { label: 'Write', title: 'Write 300 words', measure: { kind: 'quantity', amount: 300, unit: 'words' }, stake: 10, proofTier: 1, deadline: 'tonight' },
    { label: 'Sleep', title: 'In bed by 11pm', measure: { kind: 'binary' }, stake: 5, proofTier: 0, deadline: 'tonight' },
    { label: 'Screen time', title: 'No phone after 10pm', measure: { kind: 'binary' }, stake: 5, proofTier: 0, deadline: 'tonight' },
    { label: 'Chores', title: 'Clean my room', measure: { kind: 'binary' }, stake: 5, proofTier: 1, deadline: '24h' }
  ];

  global.Content = { DESTINATIONS, PROMPTS, LEARN, TEMPLATES };
})(window);
