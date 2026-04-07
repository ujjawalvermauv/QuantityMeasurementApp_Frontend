# QuantityMeasurementApp Frontend

Static frontend for QuantityMeasurementApp backend API.

## Pages

- `index.html` - Redirects to calculator dashboard
- `login.html` - Login
- `signup.html` - Signup
- `app.html` - Quantity dashboard + operation history

## Backend API Used

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/quantities/convert`
- `POST /api/v1/quantities/compare`
- `POST /api/v1/quantities/add`
- `POST /api/v1/quantities/subtract`
- `POST /api/v1/quantities/divide`
- `GET /api/v1/quantities/history` (requires JWT)

## Run

1. Start backend:
   - HTTPS profile: `https://localhost:7136`
   - HTTP profile: `http://localhost:5097`
2. Serve frontend folder with any static server (Live Server extension is fine).
3. Open `index.html` (it redirects to calculator in `app.html`).

## Config

Edit `assets/data/app-config.json`:

- `apiBaseUrl`: default `https://localhost:7136/api`
- `fallbackApiBaseUrl`: default `http://localhost:5097/api`

## Security Note

JWT is stored in `sessionStorage` only and never rendered on UI. It is used only in request headers for protected endpoints.
