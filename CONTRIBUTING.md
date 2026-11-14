# Contributing to Vault

Thanks for helping. This project is deliberately simple: no build tools,
no framework, no dependencies. Please keep it that way unless a change
really needs otherwise.

## Ground rules

- **Plain HTML/CSS/JS.** ES2020 is fine; no bundlers.
- **Data stays local by default.** Any networked feature must be opt-in.
- **Supportive climate applies to us too.** Code review comments should be
  descriptive, not evaluative; provisional, not certain. See the Learn tab. Rules live in `js/core.js`; every rule change needs a test in `tests/`.

## Workflow

1. Fork and clone.
2. Serve locally: `python3 -m http.server 8765`
3. Make your change. Test in at least one desktop and one mobile-width viewport.
4. Open a pull request describing what changed and why.

## Where things live

| Want to… | Edit |
|---|---|
| Change a rule (stakes, harder, decay) | `js/core.js` + `tests/core.test.js` |
| Change layout or add a tab | `index.html`, `js/app.js` |
| Change styles | `css/style.css` |
| Change how data is saved | `js/storage.js` |
| Add supportive/defensive phrases | `js/feedback.js` |
| Edit Learn content or prompts | `js/content.js` |

## Ideas

See `docs/ROADMAP.md`.
