# Potties Order Desk

One secure web app for the whole order pipeline: **Shopify order → Potties HQ check → foundry accepts → manufacturing → packing (with proof photos and customisation check) → courier collects → tracking sent to the customer via Shopify → delivered**. It also covers LL Manufacturing purchase orders, covers & accessories stock, and every supplier invoice and proof of payment.

Built with Next.js 16, PostgreSQL (Drizzle ORM) and Supabase Storage. Runs on the free plans of **Netlify** (hosting) and **Supabase** (database and files). `vercel.json` is included in case you move to Vercel later.

## Who sees what

| | Foundry login | Potties HQ login |
|---|---|---|
| Orders | Only orders HQ has sent them | All orders |
| Accept / ask a question | ✓ | — |
| Change status (Accepted → Manufacturing → Packing → Packed) | ✓ | ✓ (correction, logged) |
| Download packing slip, waybill, artwork | ✓ | ✓ |
| Upload proof photos | ✓ | ✓ |
| Add tracking (sent to Shopify, customer emailed) | ✓ | ✓ |
| Notes | ✓ | ✓ plus **HQ-only** notes the foundry never sees |
| Own invoice status (paid / awaiting) | ✓ | ✓ |
| Invoices, proof of payment, LL Manufacturing, stock, logins | — | ✓ |

The foundry can’t open any HQ page, and every file download checks the login. Invoices and proofs of payment are never served to a foundry login.

**Compliance rules built in**

- HQ must tick “checked customisation and address” before sending to the foundry. Any change to the custom text is recorded.
- The foundry can’t mark **Packed** until it has ticked the customisation check and “packing slip is in the box”, and uploaded a photo of the packed box.
- Tracking can only be added once an order is packed. Set `REQUIRE_HQ_PROOF_APPROVAL=true` to also require HQ to approve the photos first.
- Every action is written to the order’s history with who did it and when.

## Going live (about an hour, all on free plans)

### 1. Supabase (database and file storage)
1. Create a project at [supabase.com](https://supabase.com) (region: *South Africa* or *EU West*).
2. **Storage → New bucket** named `fulfilment`. Leave it **private**.
3. Keep these three values for step 2:
   - **Project Settings → Database → Connection string → Transaction pooler**. This is `DATABASE_URL`.
   - **Project Settings → API → Project URL**. This is `SUPABASE_URL`.
   - **Project Settings → API → service_role key**. This is `SUPABASE_SERVICE_ROLE_KEY`. Keep it secret.

### 2. Netlify (hosting)
1. Sign up at [netlify.com](https://netlify.com) with GitHub. Choose **Add new site → Import an existing project → GitHub** and pick this repository.
2. The build settings come from `netlify.toml`, so leave them as they are. The build runs `npm run db:migrate && npm run build`, which applies database changes on every deploy.
3. Under **Environment variables**, add the values from `.env.example`. You need at least:
   - `DATABASE_URL`, `SESSION_SECRET` (any 32+ random characters), `APP_URL`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=fulfilment`
   - `CRON_SECRET` and `SETUP_CODE` (any long random text)
4. Deploy. Under **Site configuration → Change site name**, choose a name like `potties-orders`, which gives `https://potties-orders.netlify.app`. Set `APP_URL` to that address and redeploy. You can add your own domain later under **Domain management**.

The daily 07:00 job runs as a Netlify scheduled function (`netlify/functions/daily-reminders.mts`).

**Free plan limits to know about**
- **Netlify:** 300 credits a month, which is plenty for a team of a few people.
- **Supabase:**
  - 500 MB database and 1 GB file storage. Photos are shrunk to about 300 KB, so that's roughly 800 orders of photos. After that, delete old photos or upgrade.
  - Free projects pause after a week with no activity. The daily job keeps the project awake.
- **Uploads:** each file can be up to 4 MB.

### 3. First login
Open your app’s address. Because there are no logins yet, it shows **First-time setup**. Enter the `SETUP_CODE` you added in Netlify and create your Potties HQ login. The page closes for good once a login exists. Then add the foundry’s login under **Logins** and choose “Foundry” as the access.

### 4. Shopify
Since January 2026, Shopify makes new private apps in the **Dev Dashboard**. They no longer give a permanent token; the app logs in with a client ID and secret.
1. In Shopify admin, go to **Settings → Apps → Develop apps** and choose **Build apps in Dev Dashboard**. Create an app called “Potties Order Desk”.
   - Create it from **your own store’s account**. Shopify only lets an app log in like this when the app and the store belong to the same organisation.
2. In the app’s **Configuration / Versions**, set the Admin API scopes:
   - `read_orders`
   - `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`
   - `read_fulfillments`, `write_fulfillments`

   Then **release** the version.
3. **Install** the app on your store (Home → Install app).
4. From **Settings / Client credentials**, copy the **Client ID** into `SHOPIFY_CLIENT_ID` and the **Client secret** into `SHOPIFY_CLIENT_SECRET`. Set `SHOPIFY_STORE_DOMAIN` to `your-store.myshopify.com`.
5. Webhooks make new orders appear instantly. Without them, orders still come in when you press **Sync Shopify** and every morning. To add them:
   - Go to Shopify admin → **Settings → Notifications → Webhooks**.
   - Add `Order creation`, `Order update`, `Order cancellation` and `Fulfillment update`, all in JSON format, each pointing to `https://<your app>/api/shopify/webhooks`.
   - Copy the signing key shown on that page into `SHOPIFY_WEBHOOK_SECRET`.
6. Redeploy on Netlify. In the app, go to **Logins → Check connections**, which should say Shopify is *Working*. Then press **Sync Shopify**.

If you still have an older custom app with a permanent `shpat_` token, put it in `SHOPIFY_ADMIN_TOKEN` instead of the client ID and secret.

**How customisation is detected:** the sync reads each order line's custom properties. Any property whose name includes *engraving, lid, cast, name, initials, monogram, personal, custom, text* or *message* is shown to the foundry as the customisation. Properties starting with `_` are ignored.

### 5. Email notifications (optional, recommended)
Create a free [Resend](https://resend.com) account and verify your domain. Then set:
- `RESEND_API_KEY`, `EMAIL_FROM`
- `HQ_NOTIFY_EMAIL`, `FOUNDRY_NOTIFY_EMAIL`
- `LL_ORDER_EMAIL` (purchase orders are emailed to LL)

Emails sent:
- **To the foundry:** each new order, HQ replies, requests for new photos, reminders, and a 07:00 summary of deadlines (Mon–Sat).
- **To HQ:** foundry questions, problems flagged by the foundry, failed tracking pushes, and a daily summary.

Without email set up, the app still works. Reminders are recorded in the order history only.

### 6. Your real products
Under **Pot stock** and **LL Manufacturing**, add your products. Use **the same SKUs as Shopify**: stock reserved for open orders is matched by SKU.

## COGS sheet, Google Drive and Gmail sync

Your daily Claude routine (“Potties COGS sheet daily refresh”) keeps the dashboard and the **Potties_COGS_Streamlined** sheet in step. Each system is in charge of different things:

- **The COGS sheet is in charge of money**: supplier invoices, amounts and payments (tab 8. Invoices).
- **The dashboard is in charge of fulfilment**: stages, deadlines, tracking, proof photos and packing slips.

Each morning the routine:
1. Sends every row of **8. Invoices** to the dashboard (`POST /api/integration/invoices`). Each invoice is created or updated by supplier + number, with a link to its PDF in Drive.
2. Reads the dashboard (`GET /api/integration/export`) and writes a **15. Fulfilment** tab into the sheet, with each order's stage, ship-by date, courier and tracking number.
3. Saves the dashboard’s packing slips, proof photos and proofs of payment into Drive (**Potties › Fulfilment › <order>**).
4. Links waybills or artwork it finds in Gmail or Drive to the right order (`POST /api/integration/documents`).
5. Logs how the run went (`POST /api/integration/report`). The result shows on **Today**, **Invoices** and **Logins → Check connections**.

Every call needs the header `Authorization: Bearer <INTEGRATION_TOKEN>`. The Netlify site must be **public**, because the app’s own login protects the pages. A payment marked in the dashboard is kept until the sheet records it.

## Day to day

- **Potties HQ** starts on **Today**. It lists everything that needs you (new orders to send, foundry questions, late orders, proof to approve, invoices due, low stock), each with a button to act.
- **The foundry** starts on **My orders**, sorted by ship-by date. They tap an order to accept it, change its status, upload photos, download the packing slip and add tracking. The **Deadlines** tab shows a two-week timeline.
- **Invoices**: attach the foundry’s Xero invoice on the order screen and LL’s invoice on its purchase order. Then mark it paid and upload the proof of payment. The **Invoices** tab shows what’s still owed to each supplier.

## Not built yet (next steps)

- **Automatic import of Xero invoices from Gmail.** For now, invoices are attached by hand: upload the PDF on the order or purchase order. Automatic import needs a Google Cloud app with Gmail access.
- Users can’t reset their own password yet. HQ sets new passwords on the **Logins** page.
- Deliveries are marked delivered automatically when Shopify receives courier tracking updates. Not every South African courier reports deliveries to Shopify, so HQ can also press **Mark delivered**.

## Local development

Needs Node 20+ and PostgreSQL.
```bash
cp .env.example .env.local        # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate
npm run db:seed                    # example data; only runs on an empty database
npm run dev                        # http://localhost:3000
```
Example logins after seeding: `hq@example.com` / `foundry@example.com`, password `potties-demo-2026`.
Without Supabase keys, uploaded files are stored in `.data/uploads`.

Checks: `npm test` (business rules, attention list, webhook signature) and `npm run lint` (TypeScript).

After changing `src/lib/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
