# Quantity Measurement Microservice

Lightweight Node.js microservice matching the frontend API contract.

## Routes

- POST /api/v1/auth/signup
- POST /api/v1/auth/login
- POST /api/v1/quantities/convert
- POST /api/v1/quantities/compare
- POST /api/v1/quantities/add
- POST /api/v1/quantities/subtract
- POST /api/v1/quantities/divide
- GET /api/v1/quantities/history (JWT required)

## Run

1. Install dependencies:
   - npm install
2. Copy env file:
   - copy .env.example .env
3. Start service:
   - npm start

Service runs on http://localhost:5097 by default, which matches the frontend fallback base URL.

## Notes

- Data is stored in memory (users, history). Restarting the process resets all data.
- Passwords are hashed with SHA-256 for demo use.
