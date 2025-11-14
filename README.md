# Chat-Messaging-App-Server

Lightweight Node.js server for a chat/messaging application. This repository contains the server, Prisma schema and migrations, routes, controllers, and socket handling used by the ConvoHub mobile/web client.

## Quick overview

- Language: JavaScript (Node.js)
- ORM: Prisma (schema in `prisma/schema.prisma`, migrations in `prisma/migrations`)
- Entry point: `src/server.js`

## Important folders/files

- `src/` — application source: controllers, middleware, routes, services, socket handler
- `prisma/` — Prisma schema and generated migrations
- `uploads/` — uploaded files (sample/test files present)
- `package.json` — NPM scripts and dependencies
- `nginx.conf`, `ecosystem.config.js` — example deployment / process manager configs

## Prerequisites

- Node.js (14+ recommended)
- npm (or yarn)
- A running MySQL/Postgres database matching `src/config/database.js` and `prisma/schema.prisma`
- (Optional) Redis or other services if the project uses them for sockets/notifications (check `src/socket` and `src/services`)

## Setup (Windows PowerShell)

1. Install dependencies:

```powershell
cd C:\Users\RUSHIKESH\Projects\ConvoHub\server
npm install
```

2. Create environment variables

- Add a `.env` file at the project root (or set system env vars) with your DB connection and any jwt/otp secrets. Example keys you may need:

```
DATABASE_URL="mysql://user:pass@host:3306/dbname"
JWT_SECRET=your_jwt_secret
PORT=3000
```

3. Run Prisma migrations (apply existing migrations to your DB):

```powershell
npx prisma migrate deploy
# or for development:
npx prisma migrate dev
```

4. Start the server

```powershell
npm run start       # production start (if defined)
npm run dev         # development (if defined)
node src/server.js  # direct start
```

Check `package.json` for exact script names available in this repo.

## Testing / Uploads

- Uploaded sample files live in `uploads/` in this workspace for reference. Use the upload routes in `src/routes/upload.routes.js` and controller `src/controller/upload.controller.js`.

## Notes & troubleshooting

- If Prisma CLI complains about the `DATABASE_URL`, verify `.env` is loaded and the connection string is correct.
- If ports are in use, change `PORT` env var.
- For socket issues, check `src/socket/socketHandler.js` and ensure the client matches expected events.

## Contributing

1. Create a branch.
2. Add tests and keep changes small.
3. Open a PR with a clear description.

## License

This project does not include a license file in this repository snapshot. Add a `LICENSE` if you plan to publish or share.

---

If you want, I can update the README to include exact npm scripts from `package.json`, sample `.env` contents tailored to `src/config/database.js`, or a small run script for Windows PowerShell — tell me which you'd like.
