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
      id: 'why',
      title: 'Why bet on yourself?',
      body: [
        'People feel a loss about twice as strongly as an equal gain. That asymmetry, called loss aversion, is why a $10 stake works harder than a $10 reward (Kahneman & Tversky, 1979).',
        'A commitment device is a choice you make now that limits your future self: Ulysses tying himself to the mast. Students who chose binding deadlines for themselves did better than students with no deadlines, even though the deadlines cost them flexibility (Ariely & Wertenbroch, 2002).',
        'Vault turns both ideas into a loop you can run every day: pick a goal, stake credits, set an honest deadline, prove it, keep the credits.'
      ]
    },
    {
      id: 'vault',
      title: 'Why a Vault instead of a penalty?',
      body: [
        'Most stake apps make you pay the app when you fail. That creates a quiet conflict of interest: the stricter the judging, the more the app earns. Users feel it, and reviews of those apps are full of billing disputes.',
        'Vault never keeps your money. A missed stake is locked, not lost. You get three chances to earn it back by doing something measurably harder. If you don\'t, after 30 days it goes to a destination you chose when you placed the bet: a charity, a friend, a pool. Never us.',
        'The failure screen is designed to re-engage you, not shame you. It asks what got in the way, then hands you the redemption button.'
      ],
      quote: 'The app should want you to win. Our revenue is a subscription and a visible fee, never your forfeits.'
    },
    {
      id: 'harder',
      title: 'The "harder" rule',
      body: [
        'A redemption challenge must beat the original bet on at least one dimension, and the app computes it so you can\'t talk yourself into an easy one:',
        'Quantity or duration: at least 1.5× the original amount. A yes/no bet counts as 1, so "do it twice" qualifies.',
        'Deadline: the time window is half the original or less.',
        'Proof: a stricter proof tier than the original.',
        'Partial success unlocks a proportional share and uses up one chance. Full success unlocks everything and costs no chances.'
      ]
    },
    {
      id: 'proof',
      title: 'Proof tiers',
      body: [
        'Honor (max 10 credits): your word. Fine for tiny bets.',
        'Live photo (max 50): taken inside the app, no gallery uploads, with your one-time proof code stamped on the frame.',
        'Partner (max 200): a named human approves or rejects within a window. Coming in Phase 1.',
        'Integration (max 1000): automatic data from Strava, Screen Time, GitHub and friends. Coming in Phase 1.',
        'AI will only ever pre-screen proofs for obvious mismatches. A human is always the judge of record.'
      ]
    },
    {
      id: 'climate',
      title: 'Supportive climate, not shame',
      body: [
        'Accountability is a relationship, and every relationship has a communication climate. Jack Gibb (1961) described six behaviors that make people defensive and six that keep them open. Vault\'s partner messages run through a composer that flags the defensive ones.',
        'Microsoft learned this the expensive way. Its stack-ranking system forced managers to rate someone on every team as a failure, so coworkers competed instead of cooperating. Dropping it in 2013 and shifting to a "learn-it-all" culture under Satya Nadella is the clearest case that systems shape climate (Eichenwald, 2012; Ibarra & Rattan, 2018).',
        'The same applies to you and yourself. A missed bet is information. Write down what got in the way, pick the harder challenge, go again.'
      ],
      table: [
        ['Evaluation', 'Description', '"You always quit." → "The last two bets were missed."'],
        ['Control', 'Problem orientation', '"You need to try harder." → "What would make it easier?"'],
        ['Strategy', 'Spontaneity', '"Don\'t you think…" → "Here\'s what I\'d try."'],
        ['Neutrality', 'Empathy', '"Not my problem." → "Rough week?"'],
        ['Superiority', 'Equality', '"Obviously…" → "From where I sit…"'],
        ['Certainty', 'Provisionalism', '"The only way is…" → "One option is… I could be wrong."']
      ]
    },
    {
      id: 'others',
      title: 'What else is out there',
      body: [
        'stickK (2008) pioneered commitment contracts with a referee and charity or anti-charity stakes. Beeminder graphs numeric goals and escalates the pledge each time you derail. Forfeit made it slick with AI-checked photos and a hard mode. A 2025–26 wave (Habi, Lockin, Stakely, Ante, Oath, Gym Bet) added friend pots and gym-specific earn-back.',
        'What none of them do: refuse the forfeit money, give a computed path to earn it back, and gate stake size by proof strength. That\'s Vault.'
      ]
    },
    {
      id: 'references',
      title: 'References',
      body: [
        'Ariely, D., & Wertenbroch, K. (2002). Procrastination, deadlines, and performance. Psychological Science, 13(3), 219–224.',
        'Eichenwald, K. (2012, August). Microsoft\'s lost decade. Vanity Fair.',
        'Gibb, J. R. (1961). Defensive communication. Journal of Communication, 11(3), 141–148.',
        'Ibarra, H., & Rattan, A. (2018). Microsoft: Instilling a growth mindset. London Business School.',
        'Kahneman, D., & Tversky, A. (1979). Prospect theory. Econometrica, 47(2), 263–291.'
      ]
    }
  ];

  global.Content = { DESTINATIONS, PROMPTS, LEARN };
})(window);
