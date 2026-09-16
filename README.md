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
whole interaction: tap a number.

It sits on its own tab rather than at the bottom of the performance page on
purpose. 137 rows would bury the sales numbers reps actually open the page for,
and a rep who has to scroll past their pace chart to rate themselves won't.

### What a rep sees

- **Four numbers up top** — overall average, how much of the skillset they've
  rated, their sharpest skill and the one that needs the reps.
- **Six bars** — the whole skillset at a glance. Tap one to open that category.
- **One category at a time.** Nobody rates 137 things in a sitting; they rate
  Demos tonight and Service Calls next week. The pills remember where they are.
- **Star up to five** as this campaign's focus. Starred skills pin to the top.
- **Tap the live number again to clear it** — a rating you're no longer sure of
  is worse than no rating.

Colour is the grade, so a board reads at arm's length:

| | |
|---|---|
| **1–3** | learning it |
| **4–6** | workable |
| **7–8** | strong |
| **9–10** | could teach it |

### What a coach sees

From the Performance tab: **Rep** ▸ pick a mentee ▸ **Skillset**. Or straight
from the team board's **Skillset** section, or the `skillset ↗` link on the
hub's Mentees roster.

- Their mentee's self ratings, read-only under the **Self rating** lens.
- **Coach rating** — the coach's own read of the same skill, in its own column.
  A rep rating themselves and their coach rating them never overwrite each
  other: only the cells that changed go up the wire, and the script merges them.
- **Blind spots** — anywhere self and coach are **3 or more apart**. That list is
  the conversation. A rep who scores themselves a 9 on closing while their coach
  has them at 4 doesn't need more reps, they need to see the tape.
- A **team board** on the Performance tab: who's actually rated themselves, the
  academy average, and **where the academy is thinnest** — the six skills with
  the lowest mean across everyone who rated them. Those are next campaign's call
  topics, chosen from evidence rather than memory.

### Ratings are stamped with the campaign

A self rating with no history is a mood ring. Every rating is stored against the
campaign it was given in, so September's numbers stay put when someone rates
themselves again in January, and the board shows the delta — per skill, per
category, and overall. Growth is the point; the number on its own isn't.

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
2. Run **`setup()`** once and approve the prompt. The Execution log prints the
   URL of the new **SNA Skills Data** spreadsheet.
3. **Deploy ▸ New deployment ▸ Web app**, *Execute as* **Me**, *Who has access*
   **Anyone** ▸ Deploy ▸ copy the `/exec` URL.
4. Paste it into `CONFIG.SKILLS_URL` in `index.html` and push.

It is deliberately its own script and its own spreadsheet, separate from the
performance sheet and from the hub's data: a rep tapping numbers on their phone
can never reach the sheet the whole academy's sales run on.

If you edit the `.gs` afterwards you must **Deploy ▸ Manage deployments ▸ edit ▸
New version**, or the web app keeps serving the old code.

### How it stores things

One row per mentee per campaign:

| RepID | Campaign | Self | Coach | Focus | UpdatedAt | UpdatedBy |
|---|---|---|---|---|---|---|

`Self` and `Coach` are JSON maps of `skillId → 1–10`; `Focus` is a list of skill
ids. Forty reps rating themselves on a Tuesday night is forty rows, not forty
thousand, and a whole board saves in one write.

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
