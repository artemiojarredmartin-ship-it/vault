# Checkpoint — supportive accountability

> **Direction change (Nov 2026):** this repo is becoming **Vault**, a bet-on-yourself
> accountability app where missed stakes are locked, not lost, and can be earned back
> with harder challenges. The full build prompt and competitor research are in
> [docs/BET_ON_YOURSELF_PROMPT.md](docs/BET_ON_YOURSELF_PROMPT.md). The Checkpoint code
> below is the foundation it will be built on.

> Learn-it-all, not know-it-all.

Checkpoint is a small, open-source accountability web app. You set goals,
check in on them, and share progress with an accountability partner. The
twist: every piece of partner feedback is written in a **supportive
communication climate**, using Jack Gibb's (1961) six supportive behaviors
instead of the defensive ones.

It is built on the ideas from a paper about Microsoft's cultural shift under
Satya Nadella — away from stack ranking and internal competition, toward a
growth mindset and psychological safety. The **Learn** tab in the app
summarizes those lessons.

## Features

- **Goals** — title, your "why", cadence (daily or weekly), optional end date.
- **Check-ins** — done / partial / missed, a note, and a "what I learned" line.
  Streaks and completion rates are computed for you.
- **Dashboard** — what's due today, current streaks, this week's completion,
  and a daily growth-mindset prompt.
- **Partners** — a feedback composer that flags defensive language
  ("you always", "obviously", "you should") and suggests supportive rewrites
  based on Gibb's categories. Export a progress report to send to a partner.
- **Learn** — the communication-climate concepts and the Microsoft case.
- **Your data stays yours** — everything is stored in your browser
  (`localStorage`). Export/import as JSON to move between computers.

No build step, no framework, no backend. Plain HTML, CSS, and JavaScript.

## Run it locally

Any static file server works. From the project folder:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. (Or just double-click `index.html`.)

## Put it on GitHub Pages

1. Create a new repository on GitHub (public).
2. Push this folder:
   ```bash
   git remote add origin https://github.com/YOUR-USER/accountability-site.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root**.
4. Your site will be live at `https://YOUR-USER.github.io/accountability-site/`.

## Project layout

```
index.html        single-page app shell (all tabs)
css/style.css     styles, light + dark mode
js/storage.js     localStorage load/save, import/export
js/feedback.js    Gibb supportive-climate helper + defensive-phrase detector
js/content.js     Learn-tab content and daily prompts
js/app.js         state, rendering, event handling
docs/DESIGN.md    design notes and data model
docs/ROADMAP.md   what's done and what's next
```

## Working on it with Claude (or any AI assistant)

The code is intentionally simple and well-commented so an AI assistant can
pick it up with little context. Good starting prompts:

- "Read docs/DESIGN.md and docs/ROADMAP.md, then implement the next roadmap item."
- "Add a weekly review screen that summarizes check-ins and lessons learned."
- "Add an optional backend so two partners can see each other's goals."

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests welcome.

## License

MIT — see [LICENSE](LICENSE).

## References

- Gibb, J. R. (1961). Defensive communication. *Journal of Communication*, 11(3), 141–148.
- Eichenwald, K. (2012, August). Microsoft's lost decade. *Vanity Fair*.
- Miller, C. C. (2013, November 12). Microsoft drops employee ranking system. *The New York Times*.
- Ibarra, H., & Rattan, A. (2018). Microsoft: Instilling a growth mindset. *London Business School* case study.
- Dweck, C. S. (2006). *Mindset: The new psychology of success*. Random House.
