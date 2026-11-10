# Instructions for AI agents (Antigravity / Gemini) working on this repo

You are helping **Atul Suresh** with his portfolio site, atuldgr8.github.io. Two other assistants (Claude chats) also work
on this repo, and Atul edits pages himself in a browser editor. Read this whole file before every task.
Follow it exactly. When unsure, ask Atul instead of guessing.

## Who you're working for

- Atul is a design student (NID Gandhinagar, New Media Design). He is not a programmer, and he uses **GitHub Desktop**, not the
  command line. Explain things in plain, non-technical words. No jargon dumps.
- He likes to make the decisions: ask short clarifying questions, offer options, and mark any wording you write as DRAFT.
- Keep replies short. Say what you changed, where, and what he should look at.

## Your job: the menial work

Good tasks for you:
- Applying a list of comments to a project page (often a `comments-<slug>-<date>.md` file from the site's review mode).
- Text fixes: typos, trimming copy Atul has approved, captions, alt text, section names.
- Moving, resizing and aligning items on a page (see the format below), and evening out spacing.
- Adding pictures Atul gives you to a page: shrink them first (see "Pictures").
- Updating a project's entry in the work list (`projects/index.json`): title, year, tags, summary, colour, coming soon / hidden.

**Not your job; tell Atul to ask Claude instead:**
- Anything in `assets/` (the site's code: editor, renderer, styles), `index.html`, `project.html`, `work.html`, `serve.py`, `tools/`.
- New features, new block types, interactive pieces, bugs in how the site behaves.
- Writing new case-study copy from scratch, or deciding what a page should say.
- The top-level settings in `projects/index.json` (palette, hover, motion, tldr, funLabel …): leave them alone.

If a task needs any of those, stop and say: "This needs a code change. Please ask Claude for it."

## The non-negotiable rules

1. **Branch:** work only on `editor-preview`. Check with `git branch --show-current` before touching anything.
   **Never commit to or push `main`** (main is the live site; Atul merges into it himself in GitHub Desktop).
2. **Get the latest first:** `git pull --rebase origin editor-preview` before you start, and again right before you push.
3. **Take the lock** (a "working here" sign shared with the Claude chats) before changing anything:
   ```
   python3 tools/lock.py status
   python3 tools/lock.py take project-<slug> antigravity "what you're doing"
   ... edit, check, commit, push ...
   python3 tools/lock.py drop project-<slug> antigravity
   ```
   Use `project-<slug>` for the page you're editing (e.g. `project-spanda`). If `take` says **LOCKED**, stop and tell Atul who has it.
   Never use `--force` unless Atul says so. Always drop the lock when you're done, even if you gave up.
4. **Only touch what the task needs:** `projects/<slug>.json`, `projects/media/<slug>/`, and that project's own object
   in `projects/index.json`. Never reformat a whole file; change only the lines you need, so other people's work merges cleanly.
5. **Never force-push, never rewrite history, never re-author commits** (some commits are Atul's own; that's fine).
6. **Atul may have the editor open.** Before you start, ask him to Save in the editor and Commit + Push in GitHub Desktop.
   When you've pushed, tell him to **Fetch, then Pull** in GitHub Desktop before he edits again.
7. **Facts:** never invent numbers, quotes, names or results. Use only what Atul gives you or what's already on the page.
8. **Copy must not sound like AI:** no aphorisms ("Quiet isn't the same as absent."), no colon reveals ("Here's the thing:"),
   no neat triads, no "not X, but Y" flips, no em-dash flourishes. Plain, specific, Atul's own sentences, cut down.

## How the site is built

Plain HTML/CSS/JS, no build step, hosted on GitHub Pages.

```
index.html               home: landing → work list → TL;DR
project.html?p=<slug>    a case-study page, drawn from projects/<slug>.json
project.html?p=<slug>&edit     the page editor (Atul uses this)
project.html?p=<slug>&review   review mode: click things, leave comments, download them as Markdown
projects/index.json      the work list (+ site settings you must not touch)
projects/<slug>.json     one file per case-study page
projects/media/<slug>/   that page's pictures and videos
EDITING.md               Atul's plain-language guide to the editor
serve.py                 local server: python3 serve.py 8000 → http://localhost:8000
```

## Page file format: `projects/<slug>.json`

```json
{ "v": 2, "items": [ ... ], "intro": "intro" }
```

- The page is **1000 units wide** and scales with the window. Content starts at **x = 32** and ends at **x = 968**.
- 12 columns: column `i` starts at `x = 32 + i × 79.33`; `n` columns are `n × 63.33 + (n − 1) × 16` wide.
  Handy values: 3 columns = 222, 6 columns = 460, 9 columns = 698, full = 936. Column starts: 32, 111, 191, 270, 349, 429, 508, 587, 667, 746, 825, 905.
- Leave room for the fixed top bar: content starts around **y = 190–200**.
- Text: medium is ~13.7 units tall, line height 1.42 (one line ≈ 19.5 units). Small is 0.78×, large 2.2×.
  Text boxes grow to fit their words; `h` is only a minimum. When you lengthen text, push everything below it down.
- **Alignment matters a lot to Atul.** Every item's left/right edge should line up with the grid and with edges of other items.
  Leave **lots of space between sections** (about 200+ units) and ~16–24 units between related things.
- Phones: the page reflows into one column in **y order**, so y order must match reading order.

Each item: `{ "id", "type", "x", "y", "w", "h", ...type fields }`. Every `id` must be unique on the page (e.g. `"i" + 8 random letters`).
Never change an existing item's `id` (comments and links point at it).

| type | fields |
|---|---|
| `text` | `text` (HTML: `<br>`, `<b>`, `<i>`, `<a href>`, `<span class="c-mute|c-faint|c-accent sz-s|sz-l">`), `size` (`s` / omit for medium / `l`), `weight` (700 = bold), `color` (`mute`, `faint`, `accent` = the project's colour), `bg` (`accent`/`faint`), `align` |
| `image` | `src` (`projects/media/<slug>/file.webp`), `fit` (`cover`/`contain`), `alt`, `round`, `zoom: true` (visitors can click to enlarge) |
| `video` | `src` (mp4 in media; plays muted on loop) |
| `embed` | `src` (YouTube / Vimeo / Google Drive / Figma link) |
| `slides` | `slides: [{src, alt}]`, `mode` (`click`/`auto`/`row`). `row` = carousel: `show` (how many at once), `gap` |
| `box` | `fill` (`line`/`fill`/`ghost`/`faint`/`accent`), `round`, optional `text` |
| `button` | `text`, `look` (`line`/`fill`/`text`), `size`, `link: {href, newTab}` |
| `group` | `children: [...]` with x/y relative to the group |
| `marker` | invisible section start: `{type:"marker", x:0, y, w:1000, h:1, nav:"name"}` |

Shared fields: `nav: "name"` (this item starts a side-nav section; short lowercase names), `caption` + `capShow`
(caption under the item; leave ~30 units below), `tilt` (degrees), `shadow: true`, `bleed: true` (edge to edge, x 0, w 1000),
`link: {href, newTab}`, `anim` (leave existing animations alone unless asked).

## Pictures

- Save into `projects/media/<slug>/` with lowercase-dashed names (`empathy-map-2.webp`).
- Shrink before committing: at most **2400 px** on the long side and under **~500 KB** (WebP quality ~80 is usually right).
  Keep detailed boards a bit larger rather than blurry.
- Every picture needs real `alt` text or a caption. No HEIC files (browsers can't show them): convert to JPG/WebP.
- Interview photos/boards may show real people's names; ask Atul before publishing anything with names.

## Check your work before pushing

1. `python3 serve.py 8000`, then open `http://localhost:8000/project.html?p=<slug>` (and the home page `http://localhost:8000/#work`).
2. Look at a wide window and a phone-width window: nothing overlapping, captions not running into the next item,
   nothing wider than the screen, side nav lists the right sections, no errors in the browser console.
3. Validate the JSON (`python3 -m json.tool projects/<slug>.json > /dev/null`).

## Committing

- One commit per task, with a plain message saying what changed (e.g. `Spanda: cut the problem framing to one line, crop the mind map`).
- `git pull --rebase origin editor-preview`, then `git push origin editor-preview`, then drop your lock.
- Tell Atul: what changed, where to look, and "Fetch, then Pull in GitHub Desktop".
