# How to edit the app's content

This guide is for clinic staff. You don't need to know how to program, and you can do everything in a web browser on github.com.

## The 3 golden rules

1. **Never guess a fact.** If you are not sure, write it as `:todo[what needs checking]`. The public site shows "Ask clinic staff" instead.
2. **Clinical pages are published only after a clinician reviews them.** Until then, keep `needs_clinical_review: true`.
3. **Every change goes through a "pull request"** (a request to change). The site updates only after someone approves it.

## Where things are

| What | File |
|---|---|
| Page text (English) | `content/pages/en/...` e.g. `content/pages/en/path/intake.md` |
| Page text (other languages) | `content/pages/es/...` (same name as the English file) |
| Phone numbers, hours, address | `content/data/clinic.yaml`, `content/data/emergency.yaml` |
| Buttons and short labels | `content/ui/en.json` |
| Languages | `content/languages.json` |
| Sources (SOGC, AOM…) | `content/sources.yaml` |
| List of facts to confirm | `TODO-VERIFY.md` |

## Editing a page (step by step)

1. Open the file on github.com and tap the ✏️ pencil icon ("Edit this file").
2. Change the text.
3. Tap **Commit changes…** and write one short sentence about what you changed.
4. Choose **"Create a new branch for this commit and start a pull request"**, then tap **Propose changes**, then **Create pull request**.
5. Wait for the green ✓ from the automatic checks (about 3–5 minutes). A red ✗ means something needs fixing; tap **Details** to see what.
6. The reviewer approves and taps **Merge**. The public site updates a few minutes later.

## The top of each page (between the `---` lines)

```yaml
title: "Step 1: Getting your first appointment"
version: 3                    # English only: add 1 when the MEANING changes (not for typos)
clinical: true                # medical content?
needs_clinical_review: false  # true = not shown on the public site
last_reviewed_by: "Dr. X / RM Y"
last_reviewed_on: 2026-12-01
safety_critical: false        # true for emergency / warning signs pages
sources: [sogc, aom]          # ids from content/sources.yaml
```

When a clinician has reviewed a page: set `needs_clinical_review: false` and fill in `last_reviewed_by` and `last_reviewed_on`. The checks fail if a clinical page is marked reviewed without these.

## Writing tips

- Short sentences. One idea per sentence. Aim for about grade 6 reading level; the checks warn if a page is harder.
- Use "you". Avoid medical words, or explain them: "requisition (the form for your tests)".
- Use lists, not long paragraphs.

## Special codes in the text

| Write | What it does |
|---|---|
| `:todo[Clinic hours]` | A fact not yet confirmed. Preview: highlighted in yellow. Public site: "Ask clinic staff". |
| `:data[clinic.phone]` | Puts in a value from `content/data/`. Change the number once and every page and language updates. |
| `:::box{tone="red"}` … `:::` | A coloured box. Tones: red, orange, green, blue. |
| `[link text](../costs/)` | A link to another page. |

## Confirming a phone number, address or hours

In `content/data/clinic.yaml` (or `emergency.yaml`):

```yaml
phone: { value: "416-000-0000", verified: true, tel: true, confirmed_by: "RM Y", confirmed_on: 2026-12-02 }
```

`verified: true` is what makes it appear on the public site.

## Translations

- A translated page has the same name as the English one, in its language folder, e.g. `content/pages/es/path/intake.md`.
- At the top, `source_version` = the English `version` that was translated.
- When the English page changes and its `version` goes up, the translation is marked **out of date**. Patients see a note with a link to the English page.
- **Emergency pages** (`safety_critical: true`): an out-of-date translation **stops publishing** until it is updated. If a translation can't be updated quickly, add `fallback_to_english: true` to show English for now.
- **Adding a language:** add a line to `content/languages.json` with `"status": "draft"`, copy `content/ui/en.json` to `content/ui/<code>.json` and translate it. When it's ready, change the status to `"live"`.

## The preview site and the public site

- **Public site:** only reviewed pages, only confirmed facts, only `live` languages.
- **Preview:** everything, with drafts and TODO-VERIFY items highlighted. Each pull request's checks attach a "reports" file with the full TODO list and screenshots.
