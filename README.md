<div align="center">
  <img src="client/public/logo192.png" alt="SwiftTalk Logo" width="60" height="60">
  <h1>SwiftTalk - Real-Time Chat Messaging Application</h1>
</div>

A modern, full-stack messaging application with real-time communication, AI-powered chat assistance, task management, and smart notifications built with React, Node.js, and WebSockets.

## Features

- **Real-Time Messaging**: Instant message delivery with live read receipts and typing indicators
- **AI-Powered Chat**: AI assistance for writing suggestions, smart replies, message translation, and chat summarization
- **Task Management**: Integrated task management with subtasks, priorities, tags, and due dates
- **Smart Notifications**: Web push notifications with optional email alerts
- **File & Media Sharing**: Send images, documents, and files with instant previews
- **User Authentication**: Secure JWT-based authentication with OTP verification
- **OAuth Integration**: Supports login with Google and GitHub
- **Privacy Controls**: Blocked-user management and private/public chat options
- **Group Chats**: Create and manage group conversations with admin roles
  
---

## Environment Configuration

Create a `.env` file in the `server/` directory with the following variables:

```bash
# Database
DATABASE_URL="mysql://user:password@localhost:3306/swifttalk"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key

# OAuth — Google
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# OAuth — GitHub
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/github/callback

# Frontend URL (used for OAuth redirects)
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# Web Push Notification (VAPID Keys)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:your_email@example.com

# AI Integration
GEMINI_API_KEY=your_gemini_api_key

# Email / OTP
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password
```

---

## Setup: Docker (Recommended)

### Prerequisites

- **Docker** (v20.10+)
- **Docker Compose** (v2.0+)
- Modern web browser with JavaScript enabled

### 1. Clone and Navigate

```bash
cd SwitftTalk
```

### 2. Configure Environment

Create the `.env` file in the root directory as described in [Environment Configuration](#environment-configuration).

The `.env` file is automatically loaded by Docker Compose.

### 3. Start Services

```bash
# This starts all services
docker-compose up -d
```

```bash
# Start only the backend server
docker-compose up -d mysql redis server
``` 

```bash
# Start only the frontend client
docker-compose up -d client
```

This starts the following services:

| Service         | Port | Description                   |
|-----------------|------|-------------------------------|
| MySQL Database  | 3306 | Primary database              |
| Redis Cache     | 6379 | Session and cache store       |
| Node.js Server  | 3001 | REST API & WebSocket server   |
| React Client    | 3000 | Web application               |


### 4. Access the Application

- **Frontend**: http://localhost:3000
- **API Server**: http://localhost:3001

### 5. Manage Services

```bash
# Stop all services (keeps data volumes)
docker-compose down

# Stop and remove all data (hard reset)
docker-compose down -v
```

### Database Migrations (Docker)

```bash
# Create a new migration
docker exec switfttalk-server-1 npx prisma migrate dev --name your_migration_name

# Open Prisma Studio (GUI for database)
docker exec switfttalk-server-1 npx prisma studio
```

### Testing the Docker Setup

```bash
# Test frontend
curl http://localhost:3000

```
---

## Setup: Local Development (Without Docker)

### Prerequisites

- **Node.js** (v18+)
- **MySQL** (v8.0+) — running locally or remotely
- **Redis** (v6.2+) — running locally or remotely
- **npm** or **yarn**

### 1. Clone and Navigate

```bash
cd SwitftTalk
```

### 2. Configure Environment

Create the `.env` file in the root directory as described in [Environment Configuration](#environment-configuration).

Additionally, configure database and Redis connections in `server/.env`:

```bash
# Database
DATABASE_URL="mysql://root:your_password@localhost:3306/swifttalk"

# Redis
REDIS_URL="redis://localhost:6379"
```

### 3. Install Dependencies

```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

### 4. Set Up the Database

```bash
cd server

# Run migrations to create schema
npx prisma migrate dev

# (Optional) Seed initial data
npx prisma db seed
```

### 5. Start the Application

Open two terminal windows:

```bash
# Terminal 1 — Start backend server (from /server)
cd server
npm run dev

# Terminal 2 — Start frontend (from /client)
cd client
npm start
```

### 6. Access the Application

- **Frontend**: http://localhost:3000
- **API Server**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

### Database Migrations (Local)

```bash
# Create a new migration
cd server
npx prisma migrate dev --name your_migration_name

# Open Prisma Studio (GUI for database)
npx prisma studio
```
---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/verify-registration-otp` - Verify OTP to complete registration
- `POST /api/auth/resend-registration-otp` - Resend registration OTP
- `POST /api/auth/cancel-registration` - Cancel pending registration
- `POST /api/auth/login` - Login user (initiates OTP flow)
- `POST /api/auth/verify-otp` - Verify login OTP
- `POST /api/auth/resend-otp` - Resend login OTP
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh-token` - Refresh access token
- `GET  /api/auth/me` - Get current authenticated user
- `POST /api/auth/request-password-reset` - Request password reset email
- `POST /api/auth/reset-password` - Reset password with token
- `GET  /api/auth/google` - Initiate Google OAuth login
- `GET  /api/auth/google/callback` - Google OAuth callback
- `GET  /api/auth/github` - Initiate GitHub OAuth login
- `GET  /api/auth/github/callback` - GitHub OAuth callback

### Users
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/:id` - Get user by ID
- `POST /api/users/block/:id` - Block a user

### Chats
- `GET /api/chats` - List all chats
- `POST /api/chats` - Create new chat
- `GET /api/chats/:id` - Get chat details
- `DELETE /api/chats/:id` - Delete chat

### Messages
- `GET /api/messages/:chatId` - Get chat messages
- `POST /api/messages` - Send message
- `DELETE /api/messages/:id` - Delete message

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Uploads
- `POST /api/upload` - Upload a file (image, document, etc.)

### Notifications
- `GET /api/notifications` - Get notifications
- `POST /api/notifications/subscribe` - Subscribe to push notifications
- `POST /api/notifications/send` - Send notification

### AI
- `POST /api/ai/smart-replies` - Get AI generated smart replies
- `POST /api/ai/translate` - Translate a message to a target language
- `POST /api/ai/summarize` - Summarize the current chat
- `POST /api/ai/sessions` - Create new AI chat session
- `GET /api/ai/sessions` - Get all AI sessions for current user
- `GET /api/ai/sessions/:id` - Get AI session by ID
- `DELETE /api/ai/sessions/:id` - Delete AI session by ID

---

## 🔌 WebSocket Events

Real-time communication uses Socket.IO:

```javascript
// Client connects
io.on('connect', () => { /* handle connection */ })

// Listen for new messages
socket.on('message:new', (data) => { /* handle new message */ })

// Listen for typing indicators
socket.on('user:typing', (data) => { /* handle typing */ })

// Listen for read receipts
socket.on('message:read', (data) => { /* handle read */ })

// Listen for online status
socket.on('user:online', (data) => { /* handle online status */ })
```

---

## Technology Stack

### Frontend
- **React 19** - UI framework
- **React Router 7** - Client-side routing
- **Socket.IO Client** - Real-time communication
- **Axios** - HTTP client
- **React Helmet** - Document head management

### Backend
- **Node.js 18** - Runtime
- **Express.js** - Web framework
- **Prisma** - Database ORM
- **Socket.IO** - WebSocket library
- **Passport.js** - OAuth authentication (Google, GitHub strategies)
- **JWT** - Authentication tokens
- **Redis** - Caching & session management
- **Langchain** - AI pipeline
- **Gemini API** - AI integration (smart replies, translation, summarization)
- **Nodemailer** - Email delivery for OTP & notifications
- **node-cron** - Scheduled background jobs

### Infrastructure
- **MySQL 8.0** - Primary database
- **Redis 6.2** - Cache & session store
- **Nginx** - Reverse proxy & static file server
- **Docker** - Containerization
- **Docker Compose** - Service orchestration
- **GitHub Actions** - CI/CD pipelines

---

## Security Features

- ✅ JWT-based authentication with refresh tokens
- ✅ OTP email verification for login and registration
- ✅ OAuth 2.0 via Google and GitHub (Passport.js)
- ✅ Password hashing with bcrypt
- ✅ CORS protection with allowlist
- ✅ Rate limiting on API endpoints
- ✅ User blocking/privacy controls
- ✅ Secure WebSocket connections
- ✅ Environment variable isolation

---

## License

See [LICENSE](LICENSE) file for details.

## Author

Created by Rushikesh

---

**Last Updated**: June 16, 2026
