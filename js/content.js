/* Checkpoint — Learn-tab content and daily prompts.
 * Plain data so it's easy to edit without touching app logic.
 */
(function (global) {
  'use strict';

  const PROMPTS = [
    'What is one thing you got wrong this week that you now understand better?',
    'Where did you choose "learn-it-all" over "know-it-all" today?',
    'Which goal felt heaviest today, and what is the smallest version of it you could still do?',
    'Who could you ask for help with one of your goals, and what would you say?',
    'Describe a miss from this week without using the word "should."',
    'What did a partner say recently that made it easier to be honest?',
    'If your check-in log were a team\'s log, what climate would it show — supportive or defensive?',
    'What system around you makes a goal easier or harder, regardless of willpower?',
    'Name one thing you can do today that your future self will thank you for.',
    'What would you tell a friend who missed three days in a row?'
  ];

  // Each section: heading + array of paragraphs (strings) or special blocks.
  const LEARN = [
    {
      id: 'climate',
      title: 'What is a communication climate?',
      body: [
        'Every group of people who talk to each other has a communication climate: the overall feeling created by the way people respond to one another. It decides whether people feel respected and safe enough to share ideas, or guarded and ready to defend themselves.',
        'Climates can be supportive or defensive. In a supportive climate, mistakes are information. In a defensive climate, mistakes are threats, so people hide them. Jack Gibb (1961) described six pairs of behaviors that push a conversation one way or the other.',
        'Checkpoint is built around a simple idea: an accountability relationship is a tiny communication climate. The way you and your partner talk about a missed check-in matters more than the streak counter.'
      ]
    },
    {
      id: 'gibb',
      title: 'Gibb\'s six pairs',
      body: [
        'Each defensive behavior has a supportive counterpart. The Partners tab watches your draft for the defensive side and nudges you toward the supportive one.'
      ],
      table: [
        ['Evaluation', 'Description', '"You always skip Mondays." → "I noticed the last three Mondays were missed."'],
        ['Control', 'Problem orientation', '"You need to wake up earlier." → "What would make mornings easier?"'],
        ['Strategy', 'Spontaneity', '"Don\'t you think you should…" → "Here\'s what I\'d try: …"'],
        ['Neutrality', 'Empathy', '"Not my problem." → "That sounds like a rough week."'],
        ['Superiority', 'Equality', '"Obviously you just…" → "From where I sit, one option is…"'],
        ['Certainty', 'Provisionalism', '"The only way is…" → "It seems like… I could be wrong."']
      ]
    },
    {
      id: 'microsoft',
      title: 'Case: Microsoft\'s shift from defensive to supportive',
      body: [
        'Through the early 2010s, Microsoft was described as having a "lost decade" — a period where internal culture, not just products, held the company back (Eichenwald, 2012). A key culprit was stack ranking: managers had to sort every team into fixed performance buckets, so someone always had to land at the bottom even on a strong team.',
        'Because rankings drove raises and job security, coworkers became competitors. People protected their position instead of sharing ideas. That is a defensive climate produced by a system, not by bad individuals.',
        'Microsoft dropped stack ranking in November 2013 (Miller, 2013). When Satya Nadella became CEO in 2014, he pushed the culture from "know-it-all" to "learn-it-all," drawing on Carol Dweck\'s growth mindset: abilities grow with effort and feedback (Ibarra & Rattan, 2018). About 180 executives, split into 17 teams at an off-site, became a "culture cabinet" that defined what growth mindset would look like day to day.',
        'The lesson: climate is shaped by policies, incentives, and leader behavior, not just by individual conversations. Change the system and the conversations follow.'
      ],
      quote: 'Systems shape climate. If the system rewards looking good, people hide mistakes. If it rewards learning, people share them.'
    },
    {
      id: 'themes',
      title: 'Three themes',
      body: [
        '1. Systems shape climate. Stack ranking made competition rational. Dropping it made cooperation rational. In Checkpoint, a miss asks "what did you learn?" because the system should reward honesty.',
        '2. Leaders model behavior. Nadella\'s "learn-it-all" framing gave people permission to not know. Your accountability partner is a leader in miniature — how they respond to your first miss sets the tone.',
        '3. Psychological safety enables learning. People only report what they feel safe reporting. A partner who flags defensive language in their own drafts is building safety on purpose.'
      ]
    },
    {
      id: 'recommendations',
      title: 'Recommendations for any group',
      body: [
        'Audit the incentives. Ask what behavior your rating or ranking system actually rewards. If it rewards beating peers, expect defensiveness.',
        'Separate learning from judgment. Make it normal to say "I was wrong" by having leaders go first.',
        'Train the language. Gibb\'s pairs are teachable. Practice rewriting evaluative sentences as descriptive ones.',
        'Measure climate, not just output. Track how often people ask for help, admit mistakes, or share a lesson — not only whether targets were hit.',
        'Make it structural. A one-time speech fades. A "culture cabinet," a rewritten review template, or a check-in form that asks about lessons learned keeps the change alive.'
      ]
    },
    {
      id: 'references',
      title: 'References',
      body: [
        'Dweck, C. S. (2006). Mindset: The new psychology of success. Random House.',
        'Eichenwald, K. (2012, August). Microsoft\'s lost decade. Vanity Fair.',
        'Gibb, J. R. (1961). Defensive communication. Journal of Communication, 11(3), 141–148.',
        'Ibarra, H., & Rattan, A. (2018). Microsoft: Instilling a growth mindset. London Business School.',
        'Miller, C. C. (2013, November 12). Microsoft drops employee ranking system. The New York Times.'
      ]
    }
  ];

  global.Content = { PROMPTS, LEARN };
})(window);
