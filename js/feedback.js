/* Checkpoint — supportive-climate feedback helper.
 *
 * Based on Jack Gibb's (1961) six pairs of defensive vs. supportive behaviors:
 *   Evaluation  → Description
 *   Control     → Problem orientation
 *   Strategy    → Spontaneity
 *   Neutrality  → Empathy
 *   Superiority → Equality
 *   Certainty   → Provisionalism
 *
 * analyze(text) finds phrases that tend to create a defensive climate and
 * suggests a supportive alternative. It's a heuristic, not a judge — the point
 * is to make the writer pause, not to grade them.
 */
(function (global) {
  'use strict';

  const CATEGORIES = {
    evaluation: {
      defensive: 'Evaluation',
      supportive: 'Description',
      tip: 'Describe what you observed instead of judging the person.'
    },
    control: {
      defensive: 'Control',
      supportive: 'Problem orientation',
      tip: 'Invite them to solve it with you rather than telling them what to do.'
    },
    strategy: {
      defensive: 'Strategy',
      supportive: 'Spontaneity',
      tip: 'Say what you actually want plainly, without a setup.'
    },
    neutrality: {
      defensive: 'Neutrality',
      supportive: 'Empathy',
      tip: 'Acknowledge how it might feel for them.'
    },
    superiority: {
      defensive: 'Superiority',
      supportive: 'Equality',
      tip: 'Talk as a peer, not from above.'
    },
    certainty: {
      defensive: 'Certainty',
      supportive: 'Provisionalism',
      tip: 'Hold your view as one possibility, open to revision.'
    }
  };

  // Each rule: regex, category, and a suggested rewrite (may use $1 for captures).
  const RULES = [
    // Evaluation → Description
    { re: /\byou (always|never)\b/gi, cat: 'evaluation', swap: 'I noticed that this week…' },
    { re: /\byou('re| are) (so )?(lazy|careless|sloppy|unreliable|bad at)\b/gi, cat: 'evaluation', swap: 'The last three check-ins were missed — what got in the way?' },
    { re: /\bthat('s| was) (a )?(stupid|dumb|terrible|pathetic|bad) (idea|excuse|plan)\b/gi, cat: 'evaluation', swap: 'I\'m not sure that plan fits what you said you wanted — can we look at it together?' },
    { re: /\bwhy (can't|don't|didn't|won't) you (just|ever)\b/gi, cat: 'evaluation', swap: 'What made it hard to…' },
    { re: /\byou failed\b/gi, cat: 'evaluation', swap: 'This one didn\'t land — what did you learn?' },

    // Control → Problem orientation
    { re: /\byou (should|need to|have to|must|had better|ought to)\b/gi, cat: 'control', swap: 'One option might be… what do you think would work?' },
    { re: /\bjust do it\b/gi, cat: 'control', swap: 'What\'s the smallest next step you could take today?' },
    { re: /\bno excuses\b/gi, cat: 'control', swap: 'What would make it easier next time?' },
    { re: /\bstop (being|making)\b/gi, cat: 'control', swap: 'I\'d like to understand what\'s happening when…' },

    // Strategy → Spontaneity
    { re: /\bdon't you think (you|that)\b/gi, cat: 'strategy', swap: 'I think… — how does that sit with you?' },
    { re: /\bwouldn't it be better if you\b/gi, cat: 'strategy', swap: 'Here\'s what I\'d try: …' },
    { re: /\bI'm only saying this because\b/gi, cat: 'strategy', swap: 'Straight up: …' },
    { re: /\bno offen[cs]e,? but\b/gi, cat: 'strategy', swap: '(drop the preface and say the thing kindly)' },

    // Neutrality → Empathy
    { re: /\bI don't care (why|how|what)\b/gi, cat: 'neutrality', swap: 'It sounds like that was a hard week.' },
    { re: /\bnot my problem\b/gi, cat: 'neutrality', swap: 'How can I help with this one?' },
    { re: /\bwhatever\b/gi, cat: 'neutrality', swap: 'I\'m here either way — what do you need?' },
    { re: /\bthat's your (problem|issue)\b/gi, cat: 'neutrality', swap: 'That sounds frustrating. Want to think it through together?' },

    // Superiority → Equality
    { re: /\bobviously\b/gi, cat: 'superiority', swap: 'From where I sit, …' },
    { re: /\bas I (already )?(said|told you)\b/gi, cat: 'superiority', swap: 'To come back to the earlier idea: …' },
    { re: /\beveryone knows\b/gi, cat: 'superiority', swap: 'My sense is…' },
    { re: /\bif I were you\b/gi, cat: 'superiority', swap: 'What\'s worked for me is… but you know your situation.' },
    { re: /\bI told you so\b/gi, cat: 'superiority', swap: 'Okay — so now we know. What\'s next?' },
    { re: /\bit's (not that hard|simple|easy)\b/gi, cat: 'superiority', swap: 'What part of it feels hardest right now?' },

    // Certainty → Provisionalism
    { re: /\bclearly\b/gi, cat: 'certainty', swap: 'It seems like…' },
    { re: /\bthe only way\b/gi, cat: 'certainty', swap: 'One way that could work is…' },
    { re: /\bthere's no (way|question|doubt)\b/gi, cat: 'certainty', swap: 'I could be wrong, but I think…' },
    { re: /\byou('re| are) wrong\b/gi, cat: 'certainty', swap: 'I see it differently — here\'s why…' },
    { re: /\bend of (story|discussion)\b/gi, cat: 'certainty', swap: 'That\'s my current take — open to hearing yours.' },
    { re: /\b(definitely|certainly|absolutely) (won't|will never|can't)\b/gi, cat: 'certainty', swap: 'It might be tough to… unless…' }
  ];

  // Phrases that signal a supportive climate; they nudge the meter up.
  const SUPPORTIVE = [
    /\bI noticed\b/i, /\bit seems\b/i, /\bone option\b/i, /\bwhat do you think\b/i, /\bhow can I help\b/i,
    /\bwhat did you learn\b/i, /\bwhat got in the way\b/i, /\bI could be wrong\b/i, /\bsounds like\b/i,
    /\btogether\b/i, /\bI appreciate\b/i, /\bnice work\b/i, /\bthank you\b/i, /\bproud of\b/i, /\bwhat would make it easier\b/i
  ];

  function analyze(text) {
    const flags = [];
    if (!text) return { flags, supportiveHits: 0, score: 50 };
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        flags.push({
          match: m[0],
          index: m.index,
          category: rule.cat,
          label: CATEGORIES[rule.cat],
          suggestion: rule.swap
        });
        if (!rule.re.global) break;
      }
    }
    flags.sort((a, b) => a.index - b.index);
    const supportiveHits = SUPPORTIVE.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
    // Score 0–100: start at 60, lose 15 per flag, gain 8 per supportive phrase.
    const score = Math.max(0, Math.min(100, 60 - flags.length * 15 + supportiveHits * 8));
    return { flags, supportiveHits, score };
  }

  function scoreLabel(score) {
    if (score >= 75) return 'Supportive';
    if (score >= 45) return 'Mixed';
    return 'Leaning defensive';
  }

  // Templates, each built from the supportive side of a Gibb pair.
  // {name} and {goal} are replaced by the composer.
  const TEMPLATES = [
    {
      title: 'After a strong week',
      cat: 'Description + Equality',
      text: 'Hey {name} — I noticed you checked in on "{goal}" every day this week. Nice work. What made it click? I\'d like to borrow whatever you did.'
    },
    {
      title: 'After a missed stretch',
      cat: 'Empathy + Problem orientation',
      text: 'Hey {name}, it looks like "{goal}" slipped for a few days. Sounds like it was a heavy week. No judgment — what got in the way, and what would make it easier to restart tomorrow?'
    },
    {
      title: 'Sharing a different view',
      cat: 'Provisionalism',
      text: 'I could be wrong, but it seems like the target for "{goal}" might be a bit ambitious for right now. One option is to shrink it for two weeks and build back up. What do you think?'
    },
    {
      title: 'Asking for help',
      cat: 'Spontaneity + Equality',
      text: 'Straight up: I\'m stuck on my own goal and could use a check-in buddy this week. Would you be up for a 5-minute call on Wednesday?'
    },
    {
      title: 'Celebrating a lesson, not just a result',
      cat: 'Description + Empathy',
      text: 'Your note on "{goal}" — "{learned}" — stuck with me. That\'s the kind of thing that actually changes next week. Thanks for writing it down.'
    }
  ];

  global.Feedback = { CATEGORIES, RULES, TEMPLATES, analyze, scoreLabel };
})(window);
