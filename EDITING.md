# Editing the site, in plain steps

## Every time you want to edit

1. Open **GitHub Desktop**. Check the top bar says **Current branch: editor-preview**.
2. Press **Fetch origin** (and **Pull origin** if it appears). That brings down anything new.
3. In the site folder, double-click **start-editor.bat** (Windows) or **start-editor.command** (Mac).
   A black window opens and Chrome opens the editor. Leave the black window open while you work.
4. First time only: press **connect folder** in the editor and pick the site folder (the one with index.html).

## While editing

- Work list: `work.html?edit` (it opens there). Add projects, set each name's colour, reorder, hide/show.
- A project: press **edit page** next to it.
- **Save** (or Ctrl/⌘ + S) writes your changes into the site folder on your laptop. Nothing goes online yet.
- To look at it like a visitor: **preview** (P), or the small blue **edit** link on any page takes you back.

## Putting it online

1. **Save** in the editor.
2. In GitHub Desktop you'll see your changed files on the left. Type a short summary (e.g. "Narayanpet page"), press **Commit to editor-preview**, then **Push origin**.
   Your work is now backed up on GitHub, but **not live yet**.
3. When you're happy and want it live: in GitHub Desktop, switch the branch to **main**, then
   **Branch → Merge into current branch… → editor-preview → Merge**, then **Push origin**.
   About a minute later it's on atuldgr8.github.io.
4. Switch back to **editor-preview** before you edit again.

## The whole loop, in one picture

`editor-preview` is your sketchbook. `main` is the published site. Merging is the only moment anything goes live.

1. Fetch + Pull (so you have everything)
2. Edit in the editor, press **Save**
3. Commit + Push (to editor-preview)
4. Happy? Merge into main + Push (now it's live)
5. Back to **editor-preview**, repeat

## Before you ask Claude for changes

Claude pushes to the same branch you work on. So first **Save, Commit and Push** your own work, then ask.
When Claude says it's pushed, press **Fetch**, then **Pull**. This stops the two of you overwriting each other
(the likeliest clash is `projects/index.json`).

## After you've gone live and want to edit again

- Switch back to **editor-preview**. It is never deleted by merging in GitHub Desktop, so it's always there.
- Keep editing on it as before. Don't edit while on **main**: anything pushed from main goes live immediately.
- Only if you ever merged on **github.com** (a pull request) instead of in GitHub Desktop: then also use
  **Branch → Update from main** once, so the two branches match. And on github.com, never press
  **Delete branch** after merging, since that removes editor-preview.

## Sections (the side nav on project pages)

- Every page starts as one section, **intro**. Everything belongs to the section above it, until the next one starts.
- Start a new section: select anything and tick **a new section starts here** (in its panel), or press
  **+ new section here** in the page panel (an invisible marker at what you've selected, or where you are).
- Pink dashed lines on the page show where each section starts. The section you're in is tinted pink.
- In the page panel: rename sections, and **↑ ↓** move a whole section with everything in it.
- The side nav only appears once a page has two or more sections.

## Pictures

- Pictures over about 500 KB are shrunk automatically when you add them (max 2400px, saved as .webp).
  GIFs and small pictures are left alone.

## Captions and video

- Select a picture, video or embed: its **Caption** part has the words and an **always show** switch.
  Off: the caption appears when someone points at it (phones always show it). Leave a little room under it.
- **+ video** in the bottom bar: paste a YouTube, Vimeo or Google Drive link, or leave it empty to pick a video file.
  Google Drive videos must be shared as "Anyone with the link".

## Text sizes and the project colour

- Click a text box: **size** has small, medium (the usual) and large. Large is for a big statement or a number; once or twice a page is plenty. Small is for quieter reading text and notes.
- **colour → project** uses the project's own colour from the work list (Work editor → its colour). Change it there and every "project" bit on the page follows. Boxes have it too.
- The side nav shows the section you're in, in the project's colour.

## Coming soon

- In the work-list editor, press **soon** on a project: its name shows in grey with "(coming soon)" and doesn't open.
  Press it again when the page is ready.

## Fun (behind the asterisk)

- In the work-list editor, press **fun** on a project to move it out of the work list.
- Once there's one, "work" in the top bar becomes **work*** and a footnote under the list opens them.
  Change the footnote's words in the **Fun** box below the list.

## If you don't see a change after pulling

Press **Ctrl + Shift + R** (Mac: **⌘ + Shift + R**) on the page once. That makes Chrome forget its old copy.
(start-editor now tells Chrome not to keep old copies, so this should rarely be needed.)

## Good to know

- Close the tab without saving? Your changes come back as a draft next time.
- Pictures you drop in are copied into `projects/media/<project>/`.
- Files: `projects/index.json` is the work list, `projects/<project>.json` is each page,
  `projects/components.json` holds your saved components.
- Press `?` in the editor for every shortcut. **B** opens the blocks.
- Delete the "Sample project" before the first time you go live.
- Motion (the swell on/off) is at the very bottom of the work-list editor. The blue **swell** button
  (next to **edit**) shows on the visitor pages on your laptop, not inside the editor.
