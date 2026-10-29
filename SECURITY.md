# Chas Berger Site App: security overview

For IT or anyone carrying out a security test. Describes how access works, what was reviewed, and what hasn't been.

## How it's built
- **Front end:** static HTML/JS (`public/`), served by Vercel. No build step, no third-party scripts except SheetJS from cdnjs, loaded only when a user uploads an Excel file.
- **Back end:** two Vercel serverless functions. `api/rpc.js` handles every action through `lib/app.js`; `api/photo.js` serves photos. `api/health.js` is a setup check that reports yes/no only, never secret values.
- **Data:** Supabase Postgres (London region) and a private Supabase Storage bucket. Row Level Security is on for every table with no policies, so the public (anon) key can read nothing. Only the server, holding the service-role key in a Vercel environment variable, can read or write.
- **Email:** Microsoft Graph `sendMail` using client-credentials (app-only) auth. The app only calls `POST /users/{MAIL_FROM}/sendMail`. It never reads mail. The Entra app should be restricted to the snags mailbox with an Application Access Policy / RBAC for Applications.

## Who can do what
| Role | How they get in | Can do |
|---|---|---|
| Admin | `ADMIN_PIN` env var | Everything, including managing PMs |
| Project manager | Own 6-digit PIN (`pms` table) | Create and run their own projects, contractors and PINs. Site work on their projects |
| Site team | Project's 6-digit PIN | Addresses, surveys and snags on that project only. No setup screens |
| Contractor | 24-character random token in their email link (about 119 bits) | See their own snags; close them out with a photo. Nothing else |

All permission checks are on the server (`lib/app.js`: `context`, `inScope`, `ownsProject`), not in the browser.

## Sessions and PINs
- Entering a PIN returns an HMAC-SHA256 signed token (`SESSION_SECRET`), valid 90 days, stored in the phone's localStorage.
- Each token carries a fingerprint of the PIN used. **Changing a project or PM PIN immediately locks out every phone that used the old one.** Rotating `SESSION_SECRET` locks out everyone.
- Wrong PINs: 8 failures per IP per 15 minutes, then that IP is blocked. The IP comes from Vercel's `x-real-ip` header, which callers can't set.
- Contractor links can be replaced in one tap ("Stop old link and make a new one"), which kills the old link.

## Other protections
- All user text is HTML-escaped before display (`esc()`), in the app and in email bodies. Email subjects have line breaks stripped.
- CSV downloads neutralise spreadsheet formulas (cells starting `= + - @`).
- Photos: JPEG/PNG/WebP only, max 6 MB, random UUID file names, private bucket. They're served only to a valid PIN session or the contractor whose snag holds the photo, via 1-hour signed URLs.
- Headers: Content-Security-Policy (scripts from self and cdnjs only, no framing), HSTS, X-Content-Type-Options, Referrer-Policy no-referrer, X-Frame-Options DENY.
- Server inputs are length-limited and whitelisted (statuses, priorities, work types, emails, dates).

## What was tested
`npm test` runs an automated browser test (41 checks) covering the main flows and these access rules: wrong PINs refused and rate-limited, tampered tokens rejected, changed PINs lock out old phones, site teams can't create projects, PMs can't see or change other PMs' projects or create PMs, contractors only see their own snag and can't change addresses, photos aren't public. `test/graph.js` checks the Microsoft Graph request format.

## Known limits / not covered
- **This has not had an independent security test.** The code was written with an AI assistant and reviewed by it. That is not a substitute for a test by a qualified person.
- Six-digit PINs are shared secrets, not personal logins. Anyone who has a PIN has that access until it's changed. There is no per-person audit trail beyond the name a user types in.
- Rate limiting is per IP. A distributed attack across many IPs is only slowed, not stopped (1 million possible PINs).
- A site-team session can load any photo whose random file name it knows (names are unguessable UUIDs).
- Any site-team member can delete addresses and snags on their project. There is no undo apart from Supabase backups (Pro plan).
- Supabase free plan has no backups. Vercel Hobby plan isn't licensed for commercial use.
- Dependencies: `@supabase/supabase-js` and `nodemailer`, pinned versions. Keep them updated.
