# QuantityMeasurementApp Frontend (Angular)

Angular frontend for QuantityMeasurementApp backend API.

## Routes

- `/dashboard` - Quantity dashboard + operation history
- `/login` - Login
- `/signup` - Signup
- `/` - Redirects to dashboard

## Backend API Used

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/quantities/convert`
- `POST /api/v1/quantities/compare`
- `POST /api/v1/quantities/add`
- `POST /api/v1/quantities/subtract`
- `POST /api/v1/quantities/divide`
- `GET /api/v1/quantities/history` (requires JWT)

## Local Run

1. Install dependencies:
   - `npm install`
2. Copy env file:
   - `copy .env.example .env`
3. Update `.env` values as needed.
4. Start Angular dev server:
   - `npm start`
5. Open `http://localhost:3000`.

`npm start` and `npm run build` generate `app-config.json` from environment variables before running.

## Frontend Environment Variables

- `APP_NAME`
- `API_BASE_URL`
- `FALLBACK_API_BASE_URL`
- `GOOGLE_CLIENT_ID`

## Deploy On Render

Use two Render services:

1. Backend Web Service (from `microservice` folder)
   - Runtime: Node
   - Root Directory: `microservice`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables:
     - `JWT_SECRET` = strong random secret
     - `JWT_EXPIRES_IN` = `2h`
     - `CORS_ORIGIN` = your frontend Render URL (example: `https://quantity-frontend.onrender.com`)

2. Frontend Static Site (this repo root)
   - Runtime: Static Site
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist/quantity-measurement-app/browser`
   - Environment Variables:
     - `APP_NAME` = `Quantity Measurement App`
     - `API_BASE_URL` = your backend Render URL + `/api`
     - `FALLBACK_API_BASE_URL` = optional fallback URL
     - `GOOGLE_CLIENT_ID` = your Google OAuth client ID (optional)

After setting env vars, trigger a redeploy so generated config contains production values.

## Security Note

JWT is stored in `sessionStorage` only and never rendered on UI. It is used only in request headers for protected endpoints.
