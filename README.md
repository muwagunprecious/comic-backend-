# Slum Art Foundation Comic Backend (Vercel Serverless API)

This is the backend API for the **Largest Collaborative Comic Book Project** by the **Slum Art Foundation**.

---

## 🚀 Quick Deployment to Vercel

### Step 1: Deploy with Vercel CLI or GitHub
1. Install Vercel CLI if needed: `npm i -g vercel`
2. In the `backend` folder, run:
   ```bash
   vercel
   ```
   Or push this repository to GitHub and import the `backend` folder as a project in the [Vercel Dashboard](https://vercel.com/new).

### Step 2: Configure Environment Variables in Vercel
Go to **Project Settings > Environment Variables** on Vercel and add:

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL/Supabase database connection string (run `schema.sql` first) |
| `FRONTEND_URL` | Your frontend URL on cPanel (e.g. `https://slumart.org` or `https://yourdomain.com`) |
| `ADMIN_SECRET` | Secret password for admin login (default: `slumart2026admin`) |
| `JWT_SECRET` | Random string for JWT tokens |
| `PAYSTACK_SECRET_KEY` | Paystack Secret Key (`sk_live_...` or `sk_test_...`) |
| `PAYSTACK_PUBLIC_KEY` | Paystack Public Key (`pk_live_...` or `pk_test_...`) |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave Secret Key (optional) |
| `FLUTTERWAVE_PUBLIC_KEY` | Flutterwave Public Key (optional) |

---

## 🗄️ Database Setup (PostgreSQL / Supabase / Neon)
1. Create a PostgreSQL database (e.g. on [Supabase](https://supabase.com) or [Neon](https://neon.tech)).
2. Open the SQL Editor and run the SQL commands from [`schema.sql`](schema.sql).
3. Copy your database connection string and set `DATABASE_URL`.

---

## 💻 Local Development
```bash
cd backend
npm install
npm run dev
```
Backend will start on `http://localhost:5000`.

---

## 📡 API Endpoints

- `GET /api/health` - Health check
- `GET /api/config` - Campaign configuration and public settings
- `POST /api/register` - Create registration & pending payment record
- `GET /api/registration/:reference` - Fetch registration & payment details
- `POST /api/payment/initialize` - Initialize Paystack/Flutterwave transaction
- `GET /api/payment/verify` - Authoritative payment verification with gateway
- `POST /api/payment/webhook` - Payment webhook handler
- `POST /api/admin/login` - Admin login
- `GET /api/admin/metrics` - Admin analytics metrics
- `GET /api/admin/registrations` - Search, filter, and view registrations
- `GET /api/admin/export` - Export registrations to CSV
- `PATCH /api/admin/registration/:id/fulfilment` - Update delivery/fulfilment status
- `POST /api/admin/config` - Update campaign settings
