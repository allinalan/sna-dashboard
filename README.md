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
- **The key** — four cards above the skills saying what a 1–10 means (table
  below), and under it a fold-out **How to use the skillset tracker**. The
  how-to is open until a rep has rated something, then folds to one line; it
  remembers if they open or close it. A rated skill also wears its level in
  words beside its name (`6 · Varsity`).
- **What each section means** — one line under every section heading
  ("Selling Ultimates", "Dropping Down Sets", …) so a rep in their first month
  knows what they are rating. The wording for the sections off Alan's sheet is
  built in (`SK_GROUP_DESC` in `index.html`); a coach rewrites any of them from
  **Edit skills**, and that line is stored on the section in the catalog and wins.
- **A Save bar** pinned to the bottom of the screen — see [Saving](#saving).

Colour is the grade, so a board reads at arm's length. The levels are Alan's
wording (2026-10-06; before that they were Ben's "Learning it / Adequate /
Strong / Master"):

| | | |
|---|---|---|
| **1–3** | New Rep / New to You | Still memorizing it. Not getting results with it yet. |
| **4–6** | Varsity / Adequate | Getting results. Probably your second year using this skill. |
| **7–8** | CSP Level | You're a pro at this. You can do it at the level of someone who sells $300k+ a year. |
| **9–10** | Elite CSP | You could give a national-level talk on this topic. |

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
  stopped teaching, add a block or a category, reword a section's description,
  or reset the lot back to the original sheet. Retiring archives rather than
  deletes, so the ratings already given to a skill survive in the versions that
  carry them, and renaming keeps a skill's id so its history follows the new
  name. Emptying a description box means "show nothing there", not "go back to
  the built-in line". Reps can't reach any of it.

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

Pick a version from the row of dates to see what a board looked like then.

### Correcting a past version

Past versions used to be strictly read-only ("they're the record", Ben,
2026-09-21). Since 2026-10-06 (Alan) a closed version can be **corrected in
place**: open the date, press **Edit this version**, change it, then **Save
changes** or **Cancel**. A rep corrects their own column, a coach corrects the
coach column, and neither can touch the other's.

- It is always a deliberate act. Nothing is sent until Save changes is pressed,
  the leave-the-page net never sends a correction, and stepping away with
  unsaved changes asks first.
- A corrected version wears **edited &lt;date&gt;** on its date pill (its
  `UpdatedAt` is later than its `ClosesAt`).
- Later versions keep the numbers they carried forward at the time. Correcting
  September does not rewrite October.
- It needs the storage script at **API 2**. Against an older deployment the same
  save would land in the *open* version, so the Edit button, and the how-to
  line about it, only appear once the feed answers `api: 2`. The page also
  checks that the answer names the version it aimed at.

### Saving

Ratings used to save themselves a second after each tap, behind a small
"saved ✓" in the heading that had scrolled out of sight by the second skill.
Since 2026-10-06 there is a **Save bar pinned to the bottom of the screen**
whenever the board can be rated:

| The bar says | Meaning |
|---|---|
| *No changes to save* | nothing waiting; shows when the version was last saved |
| *3 changes not saved yet* · **Save** | tapped, not sent |
| *Saving…* | waiting for the sheet |
| *Saved ✓ 2:14PM · the sheet has it* | the script wrote the row, **read it back**, and the numbers match what was sent |
| *⚠ Not saved* · **Try again** | the sheet couldn't be reached or refused; the changes are still on screen and in the queue |
| *⚠ Check the board* | the sheet answered, but its copy doesn't match what was tapped |
| *Correcting the Sep 22 version* · **Cancel** · **Save changes** | a past version is being corrected |

There is one net under the button: leaving the page, switching to the
Performance tab, or picking another mentee **sends whatever is still waiting**,
so a rep who rates forty skills on a phone and closes the tab loses none of
them. (Corrections to a past version are the exception, above.)

Inside the hub the dashboard is a frame as tall as its content, so "the bottom
of the screen" is the hub's. The bar reads where the frame sits in the hub's
window (same origin in production) and floats there. If that can't be read, as
with the local dev pair on two ports, it sits in the flow above the board.

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
New version**, or the web app keeps serving the old code. The script says what
it can do in every reply (`api`, currently **2**); the page hides anything a
deployment is too old for instead of getting it wrong.

To check which version is deployed, open the feed with a rep id nobody has
(it returns the catalog and no ratings) and look for `"api":2`:

```
<SKILLS_URL>?token=sharpninja&rep=none
```

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

A save normally lands in the open version (or opens a new one). A save that
carries a `versionId` is merged into **that** version instead, open or closed,
and never opens a new one; an id that isn't one of that mentee's versions is
refused rather than falling through to the open version. After every write the
script reads the row back from the sheet and answers with what it found.

A section's description rides in the catalog as `d` on the section
(`{k, n, d, s:[…]}`). No `d` = the built-in line; `""` = cleared on purpose.

### Tests and local preview

```
node tests/skills-sync.test.js    # the storage script on in-memory fakes
node tools/dev-server.js          # http://localhost:8822/?rep=r01&tab=skills
```

The dev server serves `index.html` with the sample mentees and the **real**
`SNA-Skills-Sync.gs` running on a fake sheet, so the whole Skillset tab can be
driven (rate, Save, correct a past version, fail a save) without touching
Google or anyone's ratings. `API=1` runs the script as it was before API 2;
`/__hub` shows the page inside a stand-in for the hub. The other options are at
the top of `tools/dev-server.js`.

---

## The rest of the page

The performance board is unchanged: campaign snapshot, standards heatmap,
weekly trend, channel diagnostics, planner, assignments, check-in and call
notes. It's fed by the **Weekly** check-in form through the Google Sheet named
in `CONFIG.SHEET_ID`, and refreshes every 60 seconds.

Every load asks for all its data **at once**: the eight sheet tabs, the hub feed
and the rep-links switch. So the first paint waits for the slowest request,
not the sum of them. That's about 2 s, set by Google's Apps Script. One at a time
it was about 6 s on wifi and 7–10 s on a phone. Until the data lands, a loading
card shows, never the empty coach board.

Reps reach the [Design Your Life worksheet](https://allinalan.github.io/sna-design-your-life/)
(`CONFIG.DYL_URL`) from two places: a **Plan your hours** row at the foot of the
"Your week" card, and a link beside the Campaign Planner's heading. The row has no
status dot of its own — the worksheet saves on the rep's phone, so the dashboard can
never tell whether it's been done — and its button is outlined, not solid, so it
never outshouts a check-in or a 1-on-1 that's actually due.

### Group calls

Each mentee sees their own group-call attendance, read from the hub's **Call
Attendance** rolls (the hub's shared data, the same feed that already brings in
the calendar and the check-in board). Only rolls that are in count.

- **Your week** gets a **Group calls** row. It shows how many of the calls that
  were for them they've been on this campaign, and how many replays they still owe.
  **Your replay ↓** jumps to the make-up in their Assignments.
- A **Group Calls** section under Assignments lists every call that was for them,
  plus any they dropped in on. Each shows **On the call**, **Missed** or **Excused**,
  and, for a missed or excused call, how the replay is going: due, overdue, waiting
  on a coach, or **Made up ✓**. It follows the campaign picker. Calls that weren't
  for them and that they weren't on don't appear.
- Coaches see the same section on **Rep ▸ pick a mentee**, with a link to take the
  roll on the hub.

The counting matches the hub: calls they were on, out of the calls that were for
them, with excused calls left out. Replays never count as being on a call. A call
belongs to the campaign its Vector week's Friday falls in.
