# PLAN.md — REACH Prenatal Clinic Patient App

> Status: **approved 2026-11-27.** Implementation starts with Phase 0 (§8).

---

## 0. Context

Patients at the REACH clinic (Access Alliance, Toronto) are pregnant and have no OHIP. They arrive without the right documents and don't know what the clinic does, what is free, where they will give birth, or what to do in an emergency. Because of this, visits run long, and much of the time goes to explaining things through a phone interpreter.

The app is a **static, no-login, offline-capable, multilingual PWA**. It:
1. explains the REACH path (intake → first visit → midwife practice referral → birth) and the costs,
2. lets patients prepare: a document checklist and a pre-visit form that **stays on the phone** and is shown to staff as an English summary, a printout or a QR code,
3. puts emergency and safety information one tap away on every screen.

Decisions already made in Q&A:
- **New repo**, separate from the Nutrition app.
- **Content editing:** you edit at first, then hand it over to someone else. The editing workflow must be documented and must not depend on you. A form-based CMS comes in phase 2.
- **Home-safety / violence:** the app **gives information only**. No screening question appears anywhere in the app, form, summary, PDF or QR. Screening happens in person.
- **Audio:** none in the MVP. Phase 2 adds recorded audio for key pages, starting with the most common languages (see Open questions Q1).

---

## 1. Stack, hosting, PWA, budget

| Concern | Choice | Why |
|---|---|---|
| Framework | **Astro 7** (static output; current major at build time) | Content-first. Ships **zero JS by default**: most pages are HTML and CSS, which suits low-end Android. Its content collections check frontmatter against a zod schema, which enforces the review fields (`last_reviewed_by`, `needs_clinical_review`, …) at build time. |
| Interactive parts | **Preact islands** (~4 KB) | Only the form, checklist, finder, stepper progress, and the emergency/safety overlay need JS. Preact uses React syntax, so React knowledge transfers. |
| i18n | Astro i18n routing (`/en/…`, `/es/…`) + a tiny in-house `t()` over JSON UI strings | No runtime i18n library is needed, because pages are pre-rendered per language. Languages come from a registry file, so adding one needs no code change (§3). |
| PWA | `@vite-pwa/astro` (Workbox) | Precaches the app shell and the **current language only**. Other languages are cached when first visited. |
| QR | `qrcode-generator` (~12 KB), lazy-loaded | Fully client-side. |
| Compression | Native `CompressionStream('deflate-raw')` | 0 KB of library code. Keeps the QR payload small. |
| PDF | **Print stylesheet + `window.print()`** ("Save as PDF / Print") | 0 KB. Renders any script (Arabic, Ge'ez, Vietnamese) with system fonts, which a JS PDF library can't do without embedding large fonts. Also avoids leaving a file in Downloads by default (§7). A JS-generated PDF can come in phase 2 if staff ask for one. |
| Storage | `localStorage` for settings, IndexedDB (`idb-keyval`, ~1 KB) for form data | §4 |
| Hosting | **GitHub Pages** via GitHub Actions; custom domain optional | Free and static. Every content change is a git commit with history. |
| Review previews | Optional **Cloudflare Pages** preview per pull request (free) | Lets midwives review unpublished or flagged content at a private preview URL before it reaches production. You already use Cloudflare. |
| CI checks | GitHub Actions: schema validation, translation staleness, TODO-VERIFY report, link check, Lighthouse CI, English readability warning | §3 and §6 |

**Bundle / performance budget (enforced in CI):**
- Content page: ≤ 15 KB JS gzip (overlay + language switcher) and ≤ 25 KB CSS.
- Form island: ≤ 60 KB JS gzip. The QR library loads only when the patient taps "Show QR".
- First load of one language, including precache: **≤ 600 KB**. Icons are inline SVG; there are no hero images and no web fonts except a lazy-loaded Noto Ethiopic subset for Tigrinya and Amharic.
- Lighthouse mobile (Moto G Power, slow 4G profile): Performance ≥ 90, Accessibility 100.

**Offline:** a cache-first service worker for the shell, the emergency pages and the current language, with network-first for the data files (practices and clinic info) so updates appear quickly. A small banner shows when the content is older than 30 days and the phone is offline ("Information may have changed. Check with the clinic.").

---

## 2. Information architecture & flows

### Sitemap (per language: `/{lang}/…`)
```
/                       Language picker (each language in its own name + script), remembered
/{lang}/                Home: "Where am I?" stepper summary + big tiles
├── path/               A. Your path through REACH (stepper)
│   ├── intake          1. Getting your first appointment
│   ├── first-visit     2. First visit with a REACH midwife
│   ├── referral        3. Connecting you to a midwife practice (and why)
│   └── birth           4. Where you will give birth
├── costs/              B. What is free, what isn't
├── prepare/
│   ├── checklist       D. What to bring
│   ├── form            C. Pre-visit form (multi-step, saved on phone)
│   ├── summary         English summary → Show / Print / QR
│   └── forms-to-sign   What the clinic forms say (info only; signed on paper)
├── care-options/       E. Midwife practices & hospitals near you (phase 1.5)
├── learn/              F. Pregnancy information, by stage
│   ├── tests  · genetic-screening · diabetes-test · anatomy-scan
│   ├── baby-movements · warning-signs · vaccines · vitamins
│   ├── food-safety · activity · common-symptoms · mental-health
│   └── after-birth
├── clinic/             H. Clinic info (address, TTC, days, how to book)
├── help/medical/       G1. Medical help (also an overlay, see below)
├── phrase-card         "Show this at the hospital" (English)
├── my-data             Clear all data · auto-delete · PIN · saved numbers
└── about               Disclaimer, sources, last updated
(staff/scan)            Staff-only QR decoder (static, works offline; phase 1.5)
```
**G2 (safety / violence) has no URL.** It lives inside the "Help now" overlay (§7).

### Persistent chrome on every screen
- **"Help now"** button (red, fixed at the bottom, 56 px). It opens an overlay with two large choices: **Medical** and **Safety & support**. The safety label is neutral; see §7.
- Language switcher (globe icon + native name).
- The home stepper shows the stage the patient chose ("I am here"). The choice is stored locally and is optional.

### Flow 1: first-time patient (often sent the link by SMS or a poster QR)
Language picker → Home → "New to REACH? Start here" → Path stage 1 (how to book) → What to bring → (optional) "Fill your form before your visit" → Summary → "Show this at reception".
Weeks of pregnancy can be entered once (as the date of the last period or the due date). That shows "You are about X weeks". It also highlights time-sensitive items, for example the **genetic screen window 11w2d–13w6d** with a downloadable `.ics` calendar reminder (generated on the phone, no server), and the late-pregnancy note "booking is harder after ~30 weeks — come anyway".

### Flow 2: returning patient
Home opens on the saved language and the saved stage → "Your next step" card → edit the form or show the summary/QR → for stage 3, "If another clinic calls you, take the appointment" and "Save your midwife's 24/7 number" (stored locally, shown in the emergency overlay).

### Flow 3: emergency (from any screen, offline)
"Help now" → **Medical** → three colour-coded blocks: **Call 911 now** (tap-to-call) / **Go to hospital now** / **Can wait**. If a midwife number or nearest hospital is saved, it is shown first under "Your midwife / your hospital". There is a link to the **phrase card**, and a 9-8-8 block for a mental health crisis.
"Help now" → **Safety & support** → content + **Quick exit** (§7).

---

## 3. Content model & translations

### Folder structure
```
content/
  languages.json            registry: code, native name, dir (ltr/rtl), status (draft|live), font hint
  ui/en.json  ui/es.json …  short UI strings (buttons, labels)
  pages/
    en/path/intake.md
    en/costs/index.md
    en/learn/vaccines.md
    es/path/intake.md …     same relative paths per language
  forms/
    intake.schema.json      language-neutral form definition (§4)
    intake.en.json          labels, help text, "why we ask", option text
    intake.es.json …
  data/
    clinic.yaml             hours, address, phone, booking — all TODO-VERIFY initially
    practices.yaml          midwife practices / CHCs / hospitals (§5)
    fsa-centroids.json      Toronto/GTA postal-prefix centroids (open data)
    emergency.yaml          numbers (911, 9-8-8, Health811, helplines)
  sources.yaml              shared citation list (SOGC, NACI, PHO, AOM, Health Canada …) referenced by id
```

### Page frontmatter (validated by zod; the build fails if it's invalid)
```yaml
id: path-intake
title: Getting your first appointment
version: 3                     # bump on any meaning change (English only)
clinical: true
needs_clinical_review: false
last_reviewed_by: "Dr. X / RM Y"
last_reviewed_on: 2026-12-01
sources: [aom-uninsured, pho-prenatal-labs]
# translations only:
source_version: 3              # which English version this translates
translated_by: "…"
translated_on: 2026-12-10
```

### Content rules
- **`TODO-VERIFY`** is written inline as `:todo[Clinic days and hours]` (a remark directive).
  - **Review/preview build:** shown as a yellow highlighted box.
  - **Production:** rendered as *"Ask clinic staff"* in neutral styling, so a guess is never shown.
  - CI generates `TODO-VERIFY.md`, a running list with the file and line of each item.
- **`needs_clinical_review: true`**: the page **is not published to production**. It appears only in preview builds, with a banner. This prevents unreviewed clinical text from going live.
- Data values (numbers, fees, hours) live in `data/*.yaml` and are referenced from the Markdown, e.g. `:data[clinic.days_hours]`. When a phone number changes, you edit it once and every language updates.

### Keeping translations in sync
- A build script compares each translation's `source_version` with the English `version`:
  - **Up to date** → shown normally.
  - **Stale** → the translated page is shown with a banner: "This page was updated in English. [Read the English version]". The page is listed in the CI report.
  - **Missing** → the English page is shown with "Not yet available in your language".
  - **Stale on a safety-critical page** (`emergency`, `warning-signs`, `baby-movements`, `phrase-card`, the safety section): **the build fails**. It cannot be published until the page is re-translated or temporarily marked to fall back to English. Emergency text must never be out of date.
- **Adding a language** means one line in `languages.json` (status `draft`), plus `ui/xx.json`, `forms/intake.xx.json` and whichever pages are translated. No code changes. `draft` languages appear only in preview builds; set `live` when ready.
- **Handover:** `CONTRIBUTING-CONTENT.md` (a plain-language editing guide with screenshots of the GitHub web editor), `CODEOWNERS` that requires a clinical reviewer on `content/pages/**/` and `data/emergency.yaml`, and a PR template with a review checklist. Phase 2 adds a Git-backed form-editing CMS (Sveltia CMS, free, runs on the same files), so the next owner never has to touch Markdown directly.

---

## 4. Form engine (pre-visit form)

### Schema-driven
`intake.schema.json` defines sections and fields **language-neutrally**:
```json
{ "id": "prev_csection", "type": "yesno", "section": "obstetric",
  "summary_label": "Previous C-section", "qr_code": "pc",
  "show_if": { "has_prev_births": true },
  "why": "why_prev_csection" }
```
- Types: `text`, `date`, `number`, `yesno`, `choice`, `multichoice`, `repeat` (e.g. one block per previous pregnancy), `info` (explanation only).
- Each choice option has a **stable code**, and the labels come from `intake.{lang}.json`. So **the English summary is generated from codes**, whatever language the patient used. No machine translation is needed.
- **Free text** is kept to a minimum (name, address, medication names, "anything else"). It is shown as typed, tagged *"(written in Vietnamese)"* so staff know to use the interpreter.
- Computed helpers: estimated due date and weeks from the last period (LMP + 280 days), shown as an estimate, with "the ultrasound date may change this".
- "Why we ask" expanders on sensitive or optional items (ethnic background for the genetic screen, substances, weight).
- Sections follow the brief: Contact · Pregnancy · Previous pregnancies · Health & surgeries (uterine surgery highlighted) · Medicines & allergies · Wellbeing & habits (non-judgmental) · Optional genetic-screen info · Preferences (from the finder, phase 1.5).
- **No home-safety / violence question exists in the schema.** It is information-only (decision above). Immigration status is never asked.
- Every section can be skipped. The summary shows "Not answered", never an error. Save is automatic on each change.

### Local storage & protection
- Answers are stored in IndexedDB under a neutral key. Nothing is sent anywhere. There is no analytics on form pages.
- **Optional PIN:** a 4–6 digit PIN derives a key (WebCrypto PBKDF2 → AES-GCM) that encrypts the stored answers. Without a PIN, the data is stored unencrypted.
  - Honest framing in the UI: this stops a casual look at the phone. It is not strong protection against someone determined.
  - If the PIN is forgotten → "Clear and start again".
- **Clear all my data:** one button on `my-data` and at the end of the summary. It wipes IndexedDB, localStorage and the caches of form pages, then confirms.
- **Auto-delete:** default **90 days after last edit** (adjustable: 30 days / after due date + 8 weeks / never). It is checked on each app open.
- **Saved items** (midwife 24/7 number, nearest hospital) are stored separately, so clearing the form doesn't remove them (and there is an option to clear everything).

### Outputs
1. **On-screen summary** (English, large type, sections, "Not answered" rows collapsed). A "Show to staff" mode adds high contrast, keeps the screen awake, and hides navigation.
2. **Print / Save as PDF** via the print stylesheet, one A4/Letter page where possible. The header reads "Prepared by patient — not verified". The footer gives the date generated and "Patient-entered information".
3. **QR code:**
   - Payload = `v1.` + base45(deflate(compact JSON of codes + short free text)).
   - Target ≤ ~1,200 characters, which fits a medium-density QR that cheap screens can display. If the payload is larger, it is split into **"1 of 2", "2 of 2"** codes.
   - The QR encodes a URL: `https://<site>/staff/scan#v1.…`. The data is in the **URL fragment, which browsers never send to the server**. Any staff phone camera opens the static decoder page, which decodes **on the staff device**, shows the English summary, and offers **Copy as text** for pasting into the EMR. The decoder then clears the fragment from history (`history.replaceState`).
   - The PHIPA note on this is in §7.

### "Forms to sign" page
Plain-language explanations, per language, of: (a) the non-OHIP patient agreement (incl. Ontario law/courts), and (b) consent to request records from previous providers. It is **information only**. Signing stays on paper in clinic for the MVP. An electronic signature would need organisational approval and record-keeping, so it is noted for phase 3 rather than proposed now.

---

## 5. "Where will I get care?" finder (phase 1.5)

### `practices.yaml` schema
```yaml
- id: west-end-midwives
  name: West End Midwives
  type: midwife_practice        # midwife_practice | chc | hospital | mfm_clinic
  hospitals: [humber-river]
  serves_fsas: [M6M, M6N, M9N]  # catchment as postal prefixes, if known
  approx_location_fsa: M6M      # for distance sorting; no street geocoding needed
  languages: [en, es, pt]
  accepts_uninsured: true
  hospital_fee_agreement: TODO-VERIFY
  notes: { en: "…", es: "…" }   # e.g. harder to place summer due dates
  referral: clinic_refers        # clinic_refers | self_referral_ok
  verified_on: null              # stays TODO-VERIFY until set
```
Seed entries (all TODO-VERIFY): West End Midwives (Humber River), Parkdale Queen West CHC (St. Joseph's), Mount Sinai MFM (high-risk referral), St. Michael's (specific high-risk care). Hospitals get their own entries: L&D address, emergency entrance, and catchment notes.

### Postal code → options, offline, no paid API
- The patient types a postal code. Only the **first 3 characters (FSA)** are used and kept. The full code is never needed.
- `fsa-centroids.json` holds approximate centroids for Toronto and GTA FSAs. It's built once from Statistics Canada FSA boundary open data and is ~8 KB.
- Ranking:
  1. Practices whose `serves_fsas` includes the patient's FSA ("serves your area").
  2. Other practices, by straight-line distance between FSA centroids.
  3. High-risk centres shown separately with "Your clinic refers you if needed".
- **No postal code?** Pick a neighbourhood from a short list mapped to FSAs, or tap "Use my location" (optional, one-shot `getCurrentPosition` → nearest FSA centroid computed on the phone; the coordinates are never stored).
- **Preferences** (preferred hospital, female provider, language, interest in home or birth-centre birth) are saved into the form and appear on the summary and QR.
- Always-visible copy: *"You don't need to contact them yourself. REACH sends the referral. If a midwife practice calls you, take the appointment."*

---

## 6. Accessibility, RTL, low literacy, low bandwidth

- **WCAG 2.2 AA:**
  - Tap targets ≥ 44×44 px (beyond the 24 px minimum).
  - Contrast ≥ 4.5:1, and the emergency colours are tested for colour-blindness.
  - Visible focus, logical heading order, `lang` and `dir` on `<html>` and on any mixed-language text, every icon paired with text, no timeouts, `prefers-reduced-motion`, and layout that holds at 200% text size.
  - CI runs axe through Lighthouse.
- **RTL:**
  - CSS uses **logical properties only** (`margin-inline-start`, `inset-inline-end`), enforced by a stylelint rule.
  - Direction-dependent icons (arrows, the stepper direction) are mirrored with `[dir=rtl]`.
  - Numbers, phone numbers and the English phrase card are wrapped in `<bdi>`/`dir=ltr`.
  - Tested in Arabic and Farsi before those languages go live.
- **Low literacy:**
  - Grade ~6 English. CI warns when a page's Flesch-Kincaid grade is above 7.
  - Short sentences, one idea per card, a consistent icon set (same icon = same meaning everywhere).
  - The emergency page is mostly icons + 2–5 word labels.
  - "Show to interpreter / family" mode enlarges text.
- **Audio (phase 2, per decision):** recorded clips for Emergency, the 4 Path stages, What to bring and Costs, starting with the most common clinic languages. They are lazy-loaded Opus files of ~30–60 s and ~100–200 KB each, never precached unless the patient taps "Save audio for offline".
- **Low bandwidth:** budgets in §1; system fonts; no images in the content beyond SVG; per-language precache; works fully offline after the first visit.

---

## 7. Privacy & safety review

### What is stored where (MVP)
| Data | Where | Leaves phone? |
|---|---|---|
| Language, chosen stage, weeks/LMP | localStorage | No |
| Form answers | IndexedDB (optionally PIN-encrypted) | Only when the patient **shows**, **prints** or **displays a QR** |
| Saved midwife number / hospital | localStorage | No |
| Postal code | Only the FSA (3 chars), inside the form | Only through the summary |
| Anything about violence / safety | **Nothing, ever** | — |
| Server | GitHub Pages serves static files only. It sees normal web request logs (IP, URL), the same as any website. No health data is in any URL, because the QR data is in the fragment. | — |

### PHIPA position (to confirm with the Access Alliance privacy officer)
- **MVP:** no personal health information is collected, transmitted or stored by the clinic or the app operator. The patient keeps it on their own device and chooses to show it. Once staff copy it into the EMR, it becomes clinic data under the existing PHIPA processes. **Still recommended:** a short privacy notice in the app, and sign-off by Access Alliance's privacy officer on (a) the staff QR decoder and (b) using the Access Alliance/REACH name.
- **Needs a PHIPA-compliant backend, consent and organisational approval (phase 3, not built):** online intake submission to staff, SMS reminders (they need phone numbers stored), referral status tracking, e-signature of clinic forms, and any analytics tied to a person or device.

### Threat model
| Threat | Mitigation |
|---|---|
| Shared phone / partner or family looks at the phone | Optional PIN; auto-delete; "Clear all"; neutral app name and icon (e.g. "REACH Pregnancy"); no notifications. |
| Abuser checks the phone for help-seeking | See the safety section design below. |
| Summary printout or PDF left somewhere | Print rather than auto-download. The header says "Patient-entered". The patient is told to give it to staff and not leave it. |
| QR photographed by a bystander | The QR is only shown on tap, auto-hides after 2 minutes, and its data is compressed (not readable at a glance). Honest note: anyone who scans it with the decoder can read it. |
| Staff decoder leaving data on staff devices | The fragment is cleared from history after decoding; nothing is stored; a "Clear" button; use on clinic devices recommended. |
| Unreviewed or wrong clinical content | `needs_clinical_review` blocks production; TODO-VERIFY renders as "Ask clinic staff"; the build fails on stale safety-critical translations; every page shows its review date. |
| Patient delays emergency care over cost | The emergency copy says first: "Your safety comes first, even if you are worried about cost." |

### Safety & support section (G2): safety by design
- **No URL and no navigation.** The section is an in-page overlay inside the "Help now" dialog, rendered from content bundled with the app shell. Opening it does not change the URL, so **no browser-history entry and no app history** are created. Its open/closed state is never written to storage.
- **Quick exit:**
  - A large button that is always visible, plus Esc / triple-tap on desktop and mobile.
  - It calls `location.replace('https://weather.gc.ca/…')`, which replaces the current history entry, so Back does not return to the app.
  - It also closes the overlay and clears in-memory state.
  - The PWA's own title stays neutral throughout.
- **Neutral labelling:** the button says "Safety & support". Home tiles never say "violence" or "abuse".
- **"Hide this section" option:** removes the second choice from the Help overlay; it can only be restored from `my-data → Display options`. It is stored as a generic setting name, so a person looking at storage won't see "safety".
- **Never in the form, summary, PDF or QR**, and there are no links to these resources from the form.
- **In-app guidance:** a line teaches the patient how to use a private / incognito tab and how to delete browser history. It's honest that a determined person with phone access may still find things, and recommends calling from a safe phone.
- **Honest limits:** the operating system's app-switcher screenshot may show the last screen. The overlay sets a neutral page underneath, and Quick exit is recommended before closing.

### Disclaimers (all pages, footer + about)
"This app gives general information. It does not replace your midwife or doctor. **It is not for emergencies — call 911.** The REACH clinic is open only on clinic days."

---

## 8. Scope & rough effort

Effort is in focused developer-days (my implementation time), excluding your content-review time.

| Phase | Contents | Effort |
|---|---|---|
| **0. Foundation** | Repo, Astro + Preact, content collections + schemas, language registry, RTL base, PWA, Help-now overlay shell, CI (schema, staleness, TODO report, Lighthouse), GitHub Pages deploy, editing guide | 3–4 d |
| **MVP (v1)**, English first | **G1 Medical emergency** + phrase card + saved numbers · **G2 Safety & support** (info + quick exit) · **A Path** (4 stages + "REACH follows you until you're connected / tests are free" banner) · **B Costs** · **D Checklist** (interactive, local) · **H Clinic info** · **C Form**: contact + pregnancy + previous pregnancies + uterine surgery + medicines/allergies → summary / print / QR · **my-data** (clear, auto-delete, PIN) · a minimal set of **F** pages linked from the stages (tests overview, baby movements, warning signs) | 10–14 d |
| **v1 translations** | Spanish, Portuguese (BR), Vietnamese, after English sign-off. Translation itself is by translators you choose; my part is the pipeline and QA. | 2 d + translation |
| **1.5** | **E Finder** (FSA data, preferences into the summary) · **staff QR decoder** · rest of the form (wellbeing, genetic info) · the rest of **F** · `.ics` reminder for the genetic-screen window | 6–8 d |
| **2** | Recorded audio (most common languages first) · Sveltia CMS for the content handover · more languages incl. RTL (Arabic, Farsi, Dari) and Ge'ez (Tigrinya, Amharic) · cookieless page-count analytics (e.g. Cloudflare Web Analytics, excluded from the form and safety parts) | 5–8 d + recordings |
| **3** (needs PHIPA backend + Access Alliance approval) | Staff intake submission, SMS reminders, referral status, e-signature, interpreter-booking integration. Options: Access Alliance's existing EMR patient portal, if any (preferred); a Canadian-hosted PHIPA-assessed form service; or a custom backend (highest cost and risk). Requires a privacy impact assessment. | Scoped later |

---

## 9. TODO-VERIFY list (to confirm with the clinic team)

**Clinic (H, A1)**
- [ ] Address, entrance and floor; nearest TTC routes and stops
- [ ] Clinic days and hours; how to book (Monday-morning phone calls?); phone number; walk-ins?
- [ ] Interpreter availability (phone interpretation; languages; does the patient need to ask ahead?)
- [ ] What the clinic does and doesn't do (no deliveries; which procedures, if any; rubella/other vaccines given in clinic?)
- [ ] Other Access Alliance services and locations (e.g. NP at another site), and eligibility
- [ ] Permission to use the Access Alliance / REACH name and logo; preferred app name

**Process (A)**
- [ ] Typical time from first call → first visit; from referral → midwife practice acceptance
- [ ] Follow-up interval at REACH (every 2–4 weeks?) and how results are communicated ("we call if abnormal"; 3–5 business days?)
- [ ] Billing letter: exact name; does every LifeLabs/Dynacare/ultrasound clinic accept it; list of locations that know it well
- [ ] Wording: "all tests ordered by REACH are free to you": any exceptions (e.g. NIPT, extra ultrasounds)?
- [ ] How practices contact patients (call/email/unknown number); "take the appointment" wording; what if the patient misses the call
- [ ] What happens when no practice has a spot (late pregnancy, summer/holiday due dates)

**Costs (B)**
- [ ] Scope of Ontario midwifery funding for uninsured clients (visits, labs, US, birth, OB/anaesthesia consults); wording and source (AOM / MOH)
- [ ] Which practices/hospitals have fee agreements, and the amounts (~CAD 1,000/night quoted)
- [ ] Hospital birth cost without a midwife (~CAD 10,000–15,000 quoted)
- [ ] Catchment (primary/secondary by postal code): how to explain it, and does it change fees?
- [ ] "Ontario resident" wording in this context
- [ ] Early pregnancy loss: medication vs. procedure; costs; where funding exists
- [ ] Postpartum contraception: availability and costs
- [ ] Vaccine cost/availability for uninsured (Tdap, flu, COVID-19, RSV)
- [ ] NIPT: current Ontario funded criteria vs. self-pay cost

**Emergency & safety (G)**
- [ ] Health811: available to uninsured callers? Languages?
- [ ] 9-8-8 wording (call/text, languages)
- [ ] Nearest hospitals with L&D for typical REACH patients (addresses, entrances)
- [ ] Each safety resource: number, hours, languages, status requirements: Assaulted Women's Helpline, Toronto shelter Central Intake, Victim Services Toronto, TRCC/MWAR, Women's College SA/DV centre, Talk4Healing, FCJ Refugee Centre, Barbra Schlifer Clinic
- [ ] "Help is available regardless of immigration status": confirm per service

**Finder (E)**
- [ ] West End Midwives ↔ Humber River; Parkdale Queen West CHC ↔ St. Joseph's; Mount Sinai MFM; St. Michael's high-risk: confirm affiliations, catchments, languages, uninsured acceptance, referral route
- [ ] Other midwife practices / CHCs that take uninsured clients

**Forms (C)**
- [ ] Exact fields the clinic intake needs; field order to match the EMR
- [ ] Which ethnic-background options the genetic-screen lab uses
- [ ] Text of the non-OHIP agreement and the records-consent form (for plain-language explanation)
- [ ] EMR used, and whether pasting text into it is acceptable

**Clinical content (F)**: every page gets clinical review. The items flagged in the brief: results wording, NT/genetic screen timing and logistics, GDM test fasting instructions, kick-count wording, iron dosing advice, food-safety list (Health Canada), activity (Canadian guideline), vaccines (current NACI/PHO).

---

## 10. Open questions for you

1. **Audio:** I read your answer as "no audio in the MVP; phase 2 adds recorded audio, starting with the most common languages". Did "common translations" mean something else, e.g. a set of pre-translated common phrases, or picking languages by clinic volume? Which languages are most common at REACH right now?
2. **Content handover:** who takes over editing (role, comfort with GitHub)? This decides whether the CMS moves from phase 2 to the MVP. Should the repo live under an **Access Alliance GitHub organisation** from the start?
3. **Privacy officer:** is there an Access Alliance privacy contact who should review §7 before launch?
4. **Translation:** who translates (professional service, staff, interpreters), and who reviews the clinical meaning in each language?
5. **Staff workflow:** do staff have a phone or tablet at reception to scan a QR? Or is "patient shows the screen / hands over a printout" enough for v1, so the decoder can wait?
6. **Distribution:** how will patients get the link (SMS from reception, poster QR in the waiting room, the Access Alliance website)? This affects the app name and the domain.
7. **Domain:** is `<user>.github.io/reach-prenatal` OK, or do you want a custom domain (≈ CAD 15–20/yr)?
8. **Pregnancy loss and termination information:** how much should the app say, given the audience, and should it be in the MVP?
9. **Weeks input:** should the app ask for weeks/LMP on the home screen (more personalised) or only inside the form (less on the phone)?

---

## 11. On approval: next steps & verification

1. You create the empty repo (e.g. `LgFirimar/reach-prenatal`). I attach it with `add_repo`, commit this file as `PLAN.md` plus an empty `TODO-VERIFY.md`, and push to a working branch.
2. Phase 0, then the MVP in small PRs. Each PR includes the preview URL and the CI reports (schema, staleness, TODO list, Lighthouse).
3. **Verification for each milestone:**
   - Lighthouse CI on mobile/slow-4G profiles.
   - Playwright run on emulated Pixel 4a and iPhone SE, covering: language picker → path → checklist → form → summary → QR. Also: offline reload, the RTL screenshot test (with a test language using `dir=rtl`), Quick exit (history length and the Back button), and "Clear all" (storage empty afterwards).
   - axe accessibility checks.
   - A manual test on a real low-end Android phone before launch.
