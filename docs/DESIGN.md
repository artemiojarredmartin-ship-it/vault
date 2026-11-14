# Design notes (Checkpoint prototype — historical)

> The current product is **Vault**; see [VAULT_DESIGN.md](VAULT_DESIGN.md).
> These notes describe the Checkpoint prototype this repo grew from.


## Why this exists

Accountability tools usually focus on streaks and shame. Checkpoint focuses on
the *communication climate* around a goal. The core insight from the Microsoft
case (stack ranking → growth mindset) is that **systems shape climate**: if the
system rewards looking good, people hide mistakes; if it rewards learning,
people share them. So:

- A missed check-in asks "what did you learn?", not "why did you fail?"
- Partner feedback is composed with Gibb's supportive behaviors in front of you.
- The dashboard shows completion rate *and* lessons logged, side by side.

## Gibb's six pairs (1961)

| Defensive | Supportive | In the app |
|---|---|---|
| Evaluation | Description | Detector flags "you always/never", "lazy", "bad" |
| Control | Problem orientation | Flags "you should/need to/have to" |
| Strategy | Spontaneity | Flags manipulative setups like "don't you think…" |
| Neutrality | Empathy | Templates open with acknowledgement |
| Superiority | Equality | Flags "obviously", "as I said", "everyone knows" |
| Certainty | Provisionalism | Flags "clearly", "always", "the only way"; suggests "it seems", "one option" |

## Data model (localStorage key `checkpoint.v1`)

```js
{
  version: 1,
  goals: [{
    id, title, why, cadence: 'daily'|'weekly',
    createdAt, endDate|null, archived: false
  }],
  checkins: [{
    id, goalId, date: 'YYYY-MM-DD',
    status: 'done'|'partial'|'missed',
    note, learned, createdAt
  }],
  partners: [{ id, name, contact }],
  settings: { name }
}
```

One check-in per goal per period (day, or ISO week for weekly goals).
Streak = consecutive periods ending today (or yesterday) with status `done`
or `partial`.

## Rendering

`js/app.js` keeps a single `state` object and re-renders the active tab from
scratch on every change (`render()`). No virtual DOM; the app is small enough
that this is fast and simple. Event handlers are attached with delegation on
`#app`.

## Styling

CSS custom properties in `:root`, with a `prefers-color-scheme: dark` override.
Layout is a single column with a max width of 880px; cards stack on mobile.
