# Chas Berger Site App: putting it live

About 30 minutes, start to finish. You need two free accounts: **Supabase** (stores the data and photos) and **Vercel** (runs the website).

## 1. Supabase: the database (10 min)
1. Go to supabase.com, click **Start your project** and sign up with your work email.
2. Click **New project**. Name: `cb-site-app`. Pick a strong database password and save it somewhere. Region: **London (eu-west-2)**, so tenant data stays in the UK. Click **Create**.
3. Once it's ready, open **SQL Editor** on the left and click **New query**.
4. Open `supabase/schema.sql` from this folder, copy all of it, paste it in and click **Run**. It should say "Success".
5. Go to **Project Settings > API** and copy two things for step 2:
   - **Project URL**
   - the **service_role** key (click Reveal). This is a master key, so never email it or put it in the app.

## 2. Vercel: the website (10 min)
1. Go to vercel.com and sign up (the free Hobby plan is fine for a pilot. For company use, Pro is £16 a month).
2. Vercel takes the code from GitHub, so first get it on GitHub (free account at github.com):
   - **Easiest:** create an empty private repository called `cb-site-app` and tell Claude its name. Claude pushes the code to it.
   - **Or by hand:** in the new repository click **uploading an existing file**, drag in everything from this folder except `node_modules`, then click **Commit changes**.
3. In Vercel: **Add New > Project**, pick the `cb-site-app` repository and click **Deploy**. Leave the build settings as they are.
4. Under **Settings > Environment Variables**, add each line from `.env.example` with your own values:
   - `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from step 1
   - `ADMIN_PIN`: your own 6+ digit PIN
   - `SESSION_SECRET`: any long random string (at least 32 characters)
   - `APP_URL`: the address Vercel gives you, e.g. `https://cb-site-app.vercel.app`
5. Go to **Deployments**, open the ⋯ menu on the latest one and click **Redeploy** so it picks up the settings.

## 3. Email
The app sends snag emails one of two ways. Pick one.

**A. Through Microsoft 365 (the IT route, recommended).** Emails come from a real company mailbox, e.g. snags@chasberger.co.uk, with a copy in its Sent folder. Send IT the request in `IT-EMAIL-REQUEST.md`. They give you three values, then add these in Vercel:

| Key | Value |
|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID from IT |
| `MS_CLIENT_ID` | Application (client) ID from IT |
| `MS_CLIENT_SECRET` | Client secret value from IT |
| `MAIL_FROM` | `Chas Berger Snags <snags@chasberger.co.uk>` |

**B. Through any email account's outgoing mail (SMTP)**, e.g. a dedicated Gmail with an app password, or Resend: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`.

Redeploy, then check `/api/health`. The email line shows which method is in use. Until email is set up, snags show "Not emailed" with a **Copy email** button for Outlook.

## 3b. Chase emails
Missed snags (fix-by date passed) and missed scaffold strikes are chased automatically at 7am every working day: the first working day after, then every 5 working days until closed out. Weekends and England & Wales bank holidays are skipped. Add `CRON_SECRET` (any random string of 16+ characters) in Vercel's Environment Variables and redeploy; `/api/health` shows "chase_emails: set up" when it's done. Bank holidays are listed in `lib/workdays.js` up to the end of 2028.

## 4. First use
1. Open the web address on your phone. Enter your name and your **admin PIN**.
2. **Projects > New project**: name, your email, and a 6-digit **site team PIN** (one is made for you). Add the contractors.
3. **Addresses > Add addresses**: upload the Excel template.
4. Give your site team the web address and their project PIN. On their phone: open it in Safari or Chrome, then **Share > Add to Home Screen**.
5. Contractors need nothing. Their link arrives in the snag email.

## Who can see what
| Person | How they get in | What they see |
|---|---|---|
| You (admin PIN) | PIN once per phone | Everything, plus project setup and PINs |
| Other PMs (PM PIN) | PIN once per phone | Only the projects they set up, plus their PINs and contractors |
| Site team (project PIN) | PIN once per phone | Only the projects whose PINs they've entered |
| Contractor | Link in their snag email, no login | Only their own snags on that project |

- 8 wrong PINs in 15 minutes from one place locks that place out for 15 minutes.
- If a PIN gets passed around, change it on the project screen. That phone can't unlock it again without the new PIN.
- If a contractor's link gets forwarded, tap **Stop old link and make a new one** on the project.
- Photos are private. They only load for someone with a PIN or the right contractor link.

## Adding another project manager
Projects tab > **Add a project manager**: name, work email and a PIN (one is made for you). Tap **Copy message** and send it to them. It has the link and their PIN. They can then set up their own projects. You still see everything.

## Updating the database after an app update
If `/api/health` says the database needs updating, open `supabase/schema.sql` on GitHub, copy it, paste it into the Supabase SQL Editor and click **Run**. It's safe to run again and never deletes data.

## Works tracker (per project)
PMs can give a project its own tracker, in the CB Works Tracker format:
1. **Projects > the project > Works tracker > Blank template** (also on the Progress tab under Templates).
2. Fill in the headings from column E, the answer type above each one, and the Lists tab (statuses with what they count as, sites, and a list for each pick-from-list column).
3. **Upload tracker**, check the preview, **Apply**.

Every address on the project then has an **Overview** and a **Tracker** tab, the project's statuses replace the standard ones, the Progress tab shows the tracker dashboard, and **Download tracker** gives the spreadsheet in the same format, filled in, with its dashboard. Paste the SharePoint folder link on the project now; the spreadsheet will appear there once SharePoint access is set up.

## No signal (offline mode)
The app keeps a copy of itself and of the last loaded jobs on each phone. With no signal it still opens, shows addresses and lets people raise snags (with photos), do surveys, update the tracker, log delays and asbestos checks. These wait on the phone ("1 waiting to send") and send by themselves when signal comes back. Things that need other people or the office (setting up projects, PINs, uploads) need signal. On iPhones, add the app to the home screen so the saved copy isn't cleared.

## Changing survey questions
In the app: **Projects tab > Survey questions**. PMs can change the questions on projects they run; the admin can also change the **company questions**, which every project uses unless it has its own.
1. **Download template.** It's built from the questions in use right now.
2. Change wording, answer types, options (separated by `;`) or red-flag answers in the yellow cells. Pick **Remove** to drop a question, and add new ones on the **New questions** tab.
3. **Upload edited template.** The app lists every change, and any mistakes, before anything is saved. Tap **Apply changes**.
4. **Undo last change** puts the previous questions back. **Go back to the company questions** removes a project's own set.

New surveys use the new questions straight away. Surveys already done keep their answers and photos. The built-in questions in `public/questions.js` are only used until the first upload. The other two Excel templates are rebuilt with `python3 tools/build_templates.py`.

## Testing locally (for whoever maintains it)
`npm install`, then `npm run dev` (admin PIN `999999`, data kept in memory) and `npm test` for the full browser check.
