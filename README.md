# sna-dashboard

The Sharp Ninja Academy mentee dashboard. One page, three audiences:

| How it's opened | Who sees it |
|---|---|
| `?rep=<RepID>` | that mentee, locked to their own numbers |
| `?embed=1` | the hub's **Performance** tab, in an iframe |
| bare URL | a coach (redirects to the hub's Performance tab in production) |

**Live:** https://allinalan.github.io/sna-dashboard/

Every mentee page carries two boards, on their own tabs:

**Performance** · **Skillset**

---

## Skillset

137 skills off Alan's skillset sheet, in six categories — Demos, Service Calls,
Events, General Skills, Biz Gifts, Productivity — each rated **1–10**. That's the
whole interaction: tap a number. The catalog isn't hardcoded: coaches add,
rename and retire skills from the board itself.

It sits on its own tab rather than at the bottom of the performance page on
purpose. 137 rows would bury the sales numbers reps actually open the page for,
and a rep who has to scroll past their pace chart to rate themselves won't.

### What a rep sees

- **Four numbers up top** — overall average, how much of the skillset they've
  rated, their sharpest skill and the one that needs the reps.
- **Six bars** — the whole skillset at a glance. Tap one to open that category.
- **One category at a time.** Nobody rates 137 things in a sitting; they rate
  Demos tonight and Service Calls next week. The pills remember where they are.
- **Star up to five** as this campaign's focus, **ranked**. They pin to the top
  with `#1`…`#5`, and the top three are marked as the ones that actually count.
  Arrows reorder them.
- **Sort** any category: sheet order, lowest first, highest first, A–Z, or
  biggest change since the last version. Sorting by anything but sheet order
  dissolves the blocks — when you ask for "lowest first" you want the weakest
  skills in the category, not the weakest inside each block — so each row wears
  its block name instead.
- **Tap the live number again to clear it** — a rating you're no longer sure of
  is worse than no rating.

Colour is the grade, so a board reads at arm's length:

| | | |
|---|---|---|
| **1–3** | Learning it | new or revisiting this skill |
| **4–6** | Adequate | getting consistent results |
| **7–8** | Strong | can teach it confidently to the program |
| **9–10** | Master | almost the level of Ben, Alan, Brandon Brown, Josh Mueller, Christian Hogg |

**The overall number is the average of the six section averages**, not of all 137
skills. Otherwise General Skills — 44 of the 137 — quietly decides a rep's score
on its own while Productivity's 8 barely register. Each category carries a
weight so that can be tilted later; every weight is 1 today.

### What a coach sees

From the Performance tab: **Rep** ▸ pick a mentee ▸ **Skillset**. Or straight
from the team board's **Skillset** section, or the `skillset ↗` link on the
hub's Mentees roster.

- Their mentee's self ratings, read-only under the **Self rating** lens.
- **Coach rating** — the coach's own read of the same skill, in its own column.
  **Reps never see it.** A rep rating themselves and their coach rating them
  never overwrite each other: only the cells that changed go up the wire, and
  the script merges them.
- **Blind spots** — anywhere self and coach are **3 or more apart**. That list is
  the conversation. A rep who scores themselves a 9 on closing while their coach
  has them at 4 doesn't need more reps, they need to see the tape.
- A **team board** on the Performance tab: who's actually rated themselves, the
  academy average, each mentee's movement since their last version and their top
  three focus skills, and **where the academy is thinnest** — the six skills with
  the lowest mean across everyone who rated them. Those are next campaign's call
  topics, chosen from evidence rather than memory. Sort the mentees by most
  rated, highest, lowest, most improved or name.
- **Edit skills** — add a skill to a block, rename anything, retire what you've
  stopped teaching, add a block or a category, or reset the lot back to the
  original sheet. Retiring archives rather than deletes, so the ratings already
  given to a skill survive in the versions that carry them, and renaming keeps
  a skill's id so its history follows the new name. Reps can't reach any of it.

### Ratings are versioned, and never reset

A self rating with no history is a mood ring. Each rep's board is a series of
dated **versions**. A version stays editable for **a week**; the first rating
after that week closes opens a new one, **carrying every rating forward**. So a
rep always just rates "now" without thinking about versions, September's board
is still there in January, and the delta between two versions is the progress —
per skill, per category and overall.

The rollover is decided by the **script**, not the browser, so forty devices with
forty slightly wrong clocks can't disagree about which version an edit belongs
to. The browser proposes the new version's id and the script adopts it, so both
sides name the same version; if two people roll over at once, the second finds
the first's version already open and merges into it.

Older versions are read-only — they're the record. Pick one from the row of
dates to see what a board looked like then.

### Deep links

- `?rep=r01&tab=skills` — opens that mentee straight onto their skillset.
- `#skills` works too.

---

## Setting up skillset storage

The tracker keeps working with no setup at all — it just saves each rating in
the browser that made it, and says so on the page. To share the ratings between
a rep and their coaches, deploy the script once:

1. **script.google.com** ▸ New project ▸ paste
   [`SNA-Skills-Sync.gs`](SNA-Skills-Sync.gs) over whatever is there ▸ name it
   **SNA Skills Sync**.
2. **Save first** (disk icon, or Cmd/Ctrl+S), then pick **`setup`** in the
   toolbar's function dropdown and click **▷ Run**. Saving matters: the dropdown
   only lists functions from the *saved* file, so before you save it still says
   `myFunction` and there's no `setup` to choose — which looks exactly like the
   step is missing.

   Google then warns **"Google hasn't verified this app"** — expected for a
   script you wrote yourself. *Review permissions* ▸ your account ▸ **Advanced**
   (bottom left) ▸ **Go to SNA Skills Sync (unsafe)** ▸ **Allow**. It only
   touches the spreadsheet it creates itself.

   The Execution log prints the URL of the new **SNA Skills Data** spreadsheet.
3. **Deploy ▸ New deployment ▸ Web app**, *Execute as* **Me**, *Who has access*
   **Anyone** ▸ Deploy ▸ copy the `/exec` URL.
4. Paste it into `CONFIG.SKILLS_URL` in `index.html` and push.

It is deliberately its own script and its own spreadsheet, separate from the
performance sheet and from the hub's data: a rep tapping numbers on their phone
can never reach the sheet the whole academy's sales run on.

If you edit the `.gs` afterwards you must **Deploy ▸ Manage deployments ▸ edit ▸
New version**, or the web app keeps serving the old code.

### How it stores things

Two tabs. **`Skills`** — one row per mentee per version:

| RepID | VersionID | CreatedAt | ClosesAt | Campaign | Self | Coach | Focus | UpdatedAt | UpdatedBy |
|---|---|---|---|---|---|---|---|---|---|

`Self` and `Coach` are JSON maps of `skillId → 1–10`; `Focus` is an ordered list
of skill ids, where the order is the rank. A whole board saves in one write.

**`Catalog`** — the skill list itself, as a revision-numbered JSON blob split
across cells so it can grow. The dashboard offers its built-in list the first
time it finds the tab empty; after that the stored copy wins and the board's
**Edit skills** controls write to it.

Writes are **patches** — only the skills that changed are sent, and the script
merges them into what's stored. A `null` clears one. Anything that isn't a whole
number 1–10 is dropped rather than stored.

---

## The rest of the page

The performance board is unchanged: campaign snapshot, standards heatmap,
weekly trend, channel diagnostics, planner, assignments, check-in and call
notes. It's fed by the **Weekly** check-in form through the Google Sheet named
in `CONFIG.SHEET_ID`, and refreshes every 60 seconds.

`sna-dashboard.html` is an older standalone copy kept for reference; `index.html`
is the one that ships.
