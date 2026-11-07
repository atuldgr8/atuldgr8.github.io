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

## Good to know

- Close the tab without saving? Your changes come back as a draft next time.
- Pictures you drop in are copied into `projects/media/<project>/`.
- Files: `projects/index.json` is the work list, `projects/<project>.json` is each page,
  `projects/components.json` holds your saved components.
- Press `?` in the editor for every shortcut. **B** opens the blocks.
- Delete the "Sample project" before the first time you go live.
