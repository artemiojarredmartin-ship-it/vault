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
        'Live photo (up to 50 credits). When you tap Prove it, the app reveals a random challenge for your kind of habit, like "outside: 10 jumping jacks" or "finger on line 4 of the page". You get 2 minutes to take the photo inside the app. No camera-roll uploads, and the challenge and time are stamped on the shot, so an old or staged photo won\'t match.',
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
    { label: 'Wake up', title: 'Up and outside by 7am', measure: { kind: 'binary' }, stake: 10, proofTier: 1, deadline: '24h' },
    { label: 'Study', title: 'Study 30 minutes', measure: { kind: 'duration', amount: 30, unit: 'minutes' }, stake: 10, proofTier: 1, deadline: 'tonight' },
    { label: 'Run', title: 'Run 3 km', measure: { kind: 'quantity', amount: 3, unit: 'km' }, stake: 15, proofTier: 1, deadline: '24h' },
    { label: 'Gym', title: 'Go to the gym', measure: { kind: 'binary' }, stake: 15, proofTier: 1, deadline: '24h' },
    { label: 'Read', title: 'Read 20 pages', measure: { kind: 'quantity', amount: 20, unit: 'pages' }, stake: 10, proofTier: 1, deadline: 'tonight' },
    { label: 'Write', title: 'Write 300 words', measure: { kind: 'quantity', amount: 300, unit: 'words' }, stake: 10, proofTier: 1, deadline: 'tonight' },
    { label: 'Sleep', title: 'In bed by 11pm', measure: { kind: 'binary' }, stake: 5, proofTier: 0, deadline: 'tonight' },
    { label: 'Screen time', title: 'No phone after 10pm', measure: { kind: 'binary' }, stake: 5, proofTier: 0, deadline: 'tonight' },
    { label: 'Chores', title: 'Clean my room', measure: { kind: 'binary' }, stake: 5, proofTier: 1, deadline: '24h' }
  ];

  // Live challenges: a random action the photo must show, revealed only when you go to prove it.
  // Each category is matched from the bet title; anything else falls back to "general".
  const CHALLENGE_CATEGORIES = [
    { id: 'wake', label: 'Waking up', match: /\b(wake|woke|waking|up by|up at|up and|alarm|morning|sunrise|early|outside by|\d{1,2}\s?am)\b/i, items: [
      'Step outside and show the sky behind you',
      'Outside: do 10 jumping jacks and snap mid-jump',
      'Touch grass (or a tree) and get your hand in the shot',
      'Outside: hold up {n} fingers with the sky behind you',
      'Show your front door from the outside',
      'Selfie outside with your shoes on and the sky in frame'
    ] },
    { id: 'run', label: 'Running & walking', match: /\b(run|ran|jog|walk|steps|km|mile|miles|5k|10k|hike|cycle|bike|ride)\b/i, items: [
      'Selfie with your running shoes on, outdoors, holding up {n} fingers',
      'Photo of your watch or tracker showing today\'s run, with {n} fingers up',
      'Show your sweaty face and point at the route behind you',
      'Photo of your shoes on pavement or trail, with your hand making a thumbs-up',
      'Selfie at the farthest point of your route, pointing {dir}'
    ] },
    { id: 'gym', label: 'Gym & workouts', match: /\b(gym|lift|lifting|workout|work out|exercise|push-?ups?|squats?|plank|yoga|pilates|train|training|sit-?ups?)\b/i, items: [
      'Mid-rep selfie holding up {n} fingers on your free hand',
      'Photo of the equipment you\'re using with your hand on it, pointing {dir}',
      'Mirror selfie in workout clothes with {n} fingers up',
      'Hold a plank and get the timer and you in the shot',
      'Show the gym sign or your mat, plus a thumbs-up'
    ] },
    { id: 'study', label: 'Studying & reading', match: /\b(study|studying|read|reading|pages?|chapter|book|homework|essay|write|writing|words|notes|revise|review|practice problems|exam|class)\b/i, items: [
      'Photo of the page you\'re on with your finger on line {n}',
      'Your notes from today, with your hand pointing {dir}',
      'Open book or laptop, plus {n} fingers up in the corner',
      'Photo of the last thing you wrote, with your hand pointing {dir}',
      'Show the page number and hold up {n} fingers'
    ] },
    { id: 'phone', label: 'Less phone', match: /\b(phone|screen|scroll|social|instagram|tiktok|youtube|offline|no phone|screen time)\b/i, items: [
      'Photo of your phone face-down across the room, with {n} fingers up',
      'Show your phone in a drawer or charging outside your bedroom',
      'Selfie doing something else (book, walk, cooking) with your phone nowhere in sight'
    ] },
    { id: 'sleep', label: 'Sleep', match: /\b(sleep|bed|bedtime|lights out|asleep|nap)\b/i, items: [
      'Lights off, lamp on: show your pillow and {n} fingers',
      'Show your alarm set for tomorrow and point {dir}',
      'Selfie in bed with your phone charger plugged in across the room'
    ] },
    { id: 'music', label: 'Practice', match: /\b(practice|practise|guitar|piano|violin|drums|sing|singing|instrument|music|scales)\b/i, items: [
      'Hands on your instrument making a {n}-finger chord or position',
      'Show your sheet music or tab, with your hand pointing {dir}',
      'Selfie playing, with {n} fingers up on your free hand'
    ] },
    { id: 'mind', label: 'Meditation & journaling', match: /\b(meditat\w*|journal\w*|breath\w*|mindful\w*|gratitude|pray\w*)\b/i, items: [
      'Show today\'s journal entry with your hand pointing {dir}',
      'Your timer at the end of the session, plus {n} fingers',
      'Photo of where you sat, with your hand flat on the spot'
    ] },
    { id: 'food', label: 'Food & water', match: /\b(water|drink|eat|meal|cook|cooking|veg\w*|fruit|salad|protein|diet|sugar|snack|breakfast|lunch|dinner)\b/i, items: [
      'Your meal or bottle with {n} fingers up next to it',
      'Show the empty bottle and point {dir}',
      'Photo of what you cooked, with a fork in it'
    ] },
    { id: 'clean', label: 'Chores', match: /\b(clean|tidy|laundry|dishes|vacuum|room|chores?|organi[sz]e|declutter|trash)\b/i, items: [
      'Photo of the cleaned space, standing in the doorway, pointing {dir}',
      'Show the finished job with {n} fingers in the corner of the shot',
      'Photo of the full trash bag or laundry basket, plus a thumbs-up'
    ] },
    { id: 'general', label: 'Anything else', match: /.^/, items: [
      'Show what you did with {n} fingers up in the shot',
      'Point {dir} while showing the finished result',
      'Thumbs-up next to the proof of what you did',
      'Show the result and touch it with your hand'
    ] }
  ];

  function challengeCategory(title) {
    return CHALLENGE_CATEGORIES.find(c => c.match.test(title || '')) || CHALLENGE_CATEGORIES[CHALLENGE_CATEGORIES.length - 1];
  }
  // rand: () => [0,1). Avoids repeating the previous challenge when possible.
  function pickChallenge(title, previous, rand) {
    rand = rand || Math.random;
    const cat = challengeCategory(title);
    let pool = cat.items.map(t => t);
    let text, tries = 0;
    do {
      text = pool[Math.floor(rand() * pool.length)]
        .replace('{n}', String(2 + Math.floor(rand() * 4)))
        .replace('{dir}', ['left', 'right', 'up', 'down'][Math.floor(rand() * 4)]);
    } while (text === previous && ++tries < 5);
    return { text, category: cat.label };
  }

  // Setup flow: what people want to improve, with habits at three difficulty levels.
  const GOALS = [
    { id: 'fitness', label: 'Fitness', habits: ['20 min walk', 'Gym 45 min', 'Train 60 min'] },
    { id: 'sleep', label: 'Sleep', habits: ['In bed by 12', 'In bed by 11', 'In bed by 10:30'] },
    { id: 'mornings', label: 'Mornings', habits: ['Up by 8am', 'Up by 7am', 'Up by 6am'] },
    { id: 'focus', label: 'Focus & study', habits: ['Study 30 min', 'Study 1 hour', 'Study 2 hours'] },
    { id: 'reading', label: 'Reading', habits: ['Read 10 pages', 'Read 20 pages', 'Read 40 pages'] },
    { id: 'health', label: 'Eating & health', habits: ['Drink 2L water', 'No junk food', 'Cook every meal'] },
    { id: 'phone', label: 'Less phone', habits: ['No phone in bed', 'No phone after 11pm', 'Under 2h screen time'] },
    { id: 'practice', label: 'Practice a skill', habits: ['Practice 15 min', 'Practice 30 min', 'Practice 1 hour'] },
    { id: 'mind', label: 'Mindfulness', habits: ['Meditate 5 min', 'Journal one page', 'Meditate 20 min'] },
    { id: 'money', label: 'Money', habits: ['Log every purchase', 'No takeout', 'No-spend day'] }
  ];
  const LEVELS = [
    { id: 'easy', label: 'Easy start', sub: 'Small wins. Build the streak first.', tier: 'mild' },
    { id: 'steady', label: 'Steady', sub: 'Real effort, every day.', tier: 'medium' },
    { id: 'hard', label: 'All in', sub: 'Make it hurt a little.', tier: 'spicy' }
  ];
  // Personal habit ideas: your goals at your level first, then neighbours, then the rest.
  function suggestionsFor(goalIds, levelId) {
    const li = Math.max(0, LEVELS.findIndex(l => l.id === levelId));
    const picked = GOALS.filter(g => (goalIds || []).includes(g.id));
    const out = [];
    picked.forEach(g => out.push(g.habits[li]));
    picked.forEach(g => g.habits.forEach(h => out.push(h)));
    GOALS.forEach(g => out.push(g.habits[li]));
    return out.filter((h, i) => out.indexOf(h) === i);
  }

  global.Content = { DESTINATIONS, PROMPTS, LEARN, TEMPLATES, CHALLENGE_CATEGORIES, challengeCategory, pickChallenge, GOALS, LEVELS, suggestionsFor };
})(window);
