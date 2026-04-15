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

## Run

1. Start backend:
   - HTTPS profile: `https://localhost:7136`
   - HTTP profile: `http://localhost:5097`
2. Install dependencies:
   - `npm install`
3. Start Angular dev server:
   - `npm start`
4. Open `http://localhost:4200`.

## Config

Edit `src/assets/data/app-config.json`:

- `apiBaseUrl`: default `https://localhost:7136/api`
- `fallbackApiBaseUrl`: default `http://localhost:5097/api`

## Security Note

JWT is stored in `sessionStorage` only and never rendered on UI. It is used only in request headers for protected endpoints.
