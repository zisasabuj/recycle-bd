# Recycle BD — Blind Bidding Auction Platform

Sealed-bid (blind) auction marketplace. Bidders don't see other bids; highest sealed bid wins when timer ends.

## Stack
- **Backend:** Node.js + Express + Prisma + Socket.IO + JWT
- **Database:** PostgreSQL (15+)
- **Frontend:** Static HTML/CSS/JS (served by backend on same port)
- **Image storage:** Local `/uploads/products/*` (Render deploys commit these to repo)

## Quick Start (local Docker)

```bash
# 1. Start Postgres + Redis (Redis is optional — code falls back to in-memory timers)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env   # edit DATABASE_URL if needed
npm install
npx prisma migrate deploy
npm start              # http://localhost:5000

# 3. Visit http://localhost:5000
```

## Environment Variables

| Var | Required | Example |
|---|---|---|
| `DATABASE_URL` | ✓ | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | ✓ | `change-me-to-32+-chars-random` |
| `PORT` | – | `5000` (Render sets automatically) |
| `NODE_ENV` | – | `production` |
| `CLIENT_URL` | – | `https://yourapp.onrender.com` (for CORS) |
| `REDIS_URL` | – | Optional, code falls back to in-memory timers |

## Deploy to Render

1. Push this repo to GitHub
2. Sign up at [render.com](https://render.com) with GitHub
3. **New → PostgreSQL** (free 90 days)
4. **New → Web Service** → connect repo
   - **Build Command:** `npm install --prefix backend && npx --prefix backend prisma migrate deploy`
   - **Start Command:** `npm start --prefix backend`
   - **Root Directory:** leave empty
5. Add env vars (DATABASE_URL from Postgres, JWT_SECRET, NODE_ENV=production)
6. Deploy → first request after idle takes ~30s (free tier spin-up)

## User Roles

`BUYER | SELLER | BOTH | ADMIN | SUPER_ADMIN`

- **Buyer:** place sealed bids, watchlist, chat after winning
- **Seller:** create auctions, see dashboard, upload images
- **Admin / Super Admin:** moderation, user management

## Demo Credentials

- `rootadmin` / `Admin@123` / SUPER_ADMIN (created on first run via `backend/scripts/create-admin.js`)

## License

Private — Recycle BD. All rights reserved.