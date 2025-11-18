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

# AI Features (Optional - powered by Google Gemini)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
GEMINI_MAX_TOKENS=150
GEMINI_TEMPERATURE=0.7
```

**AI Features Configuration:**
- `GEMINI_API_KEY` - Your Google Gemini API key (required for AI features). Get it from https://aistudio.google.com/apikey
- `GEMINI_MODEL` - Model to use (default: `gemini-1.5-flash`, or use `gemini-1.5-pro` for better quality)
- `GEMINI_MAX_TOKENS` - Maximum tokens per response (default: 150)
- `GEMINI_TEMPERATURE` - Creativity level 0-1 (default: 0.7)

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

## AI Features

This server includes AI-powered features using Google's Gemini AI models:

### Available AI Endpoints

All AI endpoints require authentication and are available at `/api/ai/`:

1. **Smart Reply Suggestions** - `POST /api/ai/smart-replies`
   - Generates contextual reply suggestions based on recent chat messages
   - Body: `{ chat_id: number, limit?: number }`
   - Returns: Array of suggested replies

2. **Message Translation** - `POST /api/ai/translate`
   - Translates messages to any language
   - Body: `{ message_id?: number, text?: string, target_language: string, source_language?: string }`
   - Supports: English (en), Spanish (es), French (fr), German (de), Hindi (hi), Chinese (zh), Japanese (ja), Korean (ko), Arabic (ar), Portuguese (pt), Russian (ru), Italian (it)

3. **Conversation Summarization** - `POST /api/ai/summarize`
   - Summarizes chat conversations
   - Body: `{ chat_id: number, message_count?: number, summary_type?: 'brief'|'detailed'|'bullet' }`
   - Types: brief (1-2 sentences), detailed (paragraph), bullet (bullet points)

4. **Language Detection** - `POST /api/ai/detect-language`
   - Detects the language of given text
   - Body: `{ text: string }`

5. **Conversation Starters** - `POST /api/ai/conversation-starters`
   - Generates friendly conversation openers
   - Body: `{ chat_id: number }`

6. **AI Status Check** - `GET /api/ai/status`
   - Checks if AI service is configured and lists available features

### Example Usage

```javascript
// Smart Reply Suggestions
fetch('/api/ai/smart-replies', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    chat_id: 123,
    limit: 3
  })
});

// Translate Message
fetch('/api/ai/translate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    text: "Hello, how are you?",
    target_language: "es"
  })
});

// Summarize Conversation
fetch('/api/ai/summarize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    chat_id: 123,
    message_count: 50,
    summary_type: "brief"
  })
});
```

## Notes & troubleshooting

- If Prisma CLI complains about the `DATABASE_URL`, verify `.env` is loaded and the connection string is correct.
- If ports are in use, change `PORT` env var.
- For socket issues, check `src/socket/socketHandler.js` and ensure the client matches expected events.

## Contributing

1. Create a branch.
2. Add tests and keep changes small.
3. Open a PR with a clear description.

---