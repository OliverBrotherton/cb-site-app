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

## 3. Email (ask IT, 10 min of their time)
Snag emails go out from a company mailbox, e.g. `snags@chasberger.co.uk`. Ask IT:

> "Please set up a mailbox snags@chasberger.co.uk and turn on Authenticated SMTP for it, so our site app can send emails through smtp.office365.com port 587. I need the password for it."

Put the mailbox and password into `SMTP_USER` and `SMTP_PASS` in Vercel and redeploy. Until email is set up, the app still works: snags show "Not emailed" with a **Copy email** button for sending from Outlook.

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

## Changing survey questions
They're in `public/questions.js`. Send Claude the filled-in Survey Questions template and it updates the file.

## Testing locally (for whoever maintains it)
`npm install`, then `npm run dev` (admin PIN `999999`, data kept in memory) and `npm test` for the full browser check.
