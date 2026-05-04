# Money Sync

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
```bash
npm install
npm install --workspaces
```

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
