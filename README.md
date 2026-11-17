# Home Sync

Shared household finance + shopping list app.

## Stack

- Frontend: React + Vite
- Backend: Express + serverless-http + AWS Lambda
- DB: MongoDB Atlas
- Auth: JWT email/password
- Deploy:
  - Frontend -> Vercel
  - Backend -> AWS Lambda (Serverless Framework)
  - DB -> MongoDB Atlas

## Setup

Node.js `22.12.0+` is required (`.nvmrc` is set to `22.17.1`).

```bash
nvm use
npm install
npm install --workspaces
```

## Access the development app from another device

Start the backend with `npm run dev -w backend` and the frontend with
`npm run dev -w frontend -- --host`. Open the network address printed by Vite
on a device connected to the same network. Vite forwards `/api` requests to
the backend on port 4000, so the other device only needs access to the Vite
port. Restart the frontend after changing environment files. If an existing
`frontend/.env.local` sets `VITE_API_URL`, remove that setting or set it to
`/api` for local development.

## Keep Frontend Prod API URL In Sync

After backend deploys, run:

```bash
npm run sync:frontend:api-url
```

This command:

- Runs `npx serverless info --stage prod` in `backend/`
- Extracts the current API Gateway invoke URL
- Writes `VITE_API_URL=<invoke-url>/api` into `frontend/.env.production`

### Optional profile / extra Serverless args

You can pass extra args directly to the script:

```bash
node scripts/sync-frontend-api-url.mjs prod --aws-profile your-profile
```
