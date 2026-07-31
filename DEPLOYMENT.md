# Deploying Canopy HR (Vercel + Neon)

Fifteen minutes, two free accounts. The result is a live URL you can send to anyone.

## 1. Database — Neon (free tier)

1. Sign up / log in at [neon.tech](https://neon.tech).
2. Create a project (name it `canopy-hr`, any region near you).
3. On the project dashboard, copy the **connection string** (the pooled one is fine). It looks like:
   `postgresql://user:password@ep-xxx-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require`

## 2. Hosting — Vercel (free Hobby tier)

1. Sign up / log in at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project** → import the `canopy-hr` repository.
3. Before deploying, add these **Environment Variables**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `AUTH_SECRET` | any long random string — generate with `npx auth secret` or `openssl rand -base64 32` |
   | `AUTH_TRUST_HOST` | `true` |

4. Override the **Build Command** to: `npm run vercel-build`
   (this runs `prisma generate && prisma migrate deploy && next build`, so the schema is applied automatically on deploy).
5. Deploy. First build takes a couple of minutes.

## 3. Seed the demo company (one-time, from your machine)

Run the seed locally, pointed at the Neon database:

```powershell
cd "D:\Documents\Claude Local\canopy-hr"
$env:DATABASE_URL = "<your Neon connection string>"
npx prisma db seed
```

Re-run that same command any time you want to reset the demo to a clean, fully-populated state (it wipes and re-creates everything).

## 4. Verify

Open the Vercel URL in a private/incognito window:

- The login page should show the three demo cards; each one should log in.
- As **Admin**: Payroll should list 36 historical runs; click **Run payroll** to create the current draft.
- `/careers` should be reachable logged-out.

## Notes

- The Vercel Hobby tier is for non-commercial use — fine for a candidate demo.
- File *upload* to blob storage is not wired up (documents are authored inline); if you later want it, add a `BLOB_READ_WRITE_TOKEN` from Vercel Blob and extend `src/actions/files.ts`.
- The demo login cards are seeded accounts (`admin@canopyhr.demo` / `manager@` / `employee@`, password `canopy-demo`).
