//import required modules
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io'); 
const { initializeSocket } = require('./socket/socketHandler');
const { testConnection } = require('./config/database');

// Load environment variables based on NODE_ENV
const dotenv = require('dotenv');
const envFile = '.env';
const envPath = path.join(__dirname, '..', envFile);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(`❌ Error loading ${envFile} file:`, result.error);
} else {
  console.log(`✅ Loaded ${Object.keys(result.parsed || {}).length} environment variables from ${envFile}`);
}

// create express application
const app = express();

// create http server using express app
const server = http.createServer(app);

// create socket.io instance and attach it to the http server
const io = new Server(server, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 100 * 1024 * 1024, // 100MB to support large file uploads
    cors: {
        origin: function (origin, callback) {
            // Log the origin for debugging
            console.log('🔍 Socket.IO CORS Origin:', origin);
            
            // Allow localhost, trycloudflare domains, and GitHub Pages
            const allowedOrigins = [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "https://localhost:3000",
                "https://127.0.0.1:3000",
                "http://localhost:3002",
                "http://127.0.0.1:3002",
                "https://localhost:3002",
                "https://127.0.0.1:3002",
                "https://rushik8626.github.io",
                "https://convohub-kv2qalfll-rushikeshs-projects-0260b878.vercel.app",
                "https://convohub-api.me"
            ];
            
            // Allow if no origin, or if in allowed list, or if it's a trycloudflare domain, github.io, convohub-api.me, or Vercel-hosted frontend
            if (!origin || allowedOrigins.includes(origin) || 
                (origin && (origin.includes('.trycloudflare.com') || origin.includes('.github.io') || origin.includes('convohub-api.me') || origin.includes('vercel.app')))) {
                console.log('✅ Socket.IO CORS Allowed');
                callback(null, true);
            } else {
                console.log('❌ Socket.IO CORS Blocked:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true
    }
});

// Add CORS middleware for REST API
const cors = require('cors');
app.use(cors({
    origin: function (origin, callback) {
        // Log the origin for debugging
        console.log('🔍 CORS Origin:', origin);
        
        // Allow localhost, trycloudflare domains, and GitHub Pages
        const allowedOrigins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://localhost:3000",
            "https://127.0.0.1:3000",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
            "https://localhost:3002",
            "https://127.0.0.1:3002",
            "https://rushik8626.github.io",
            "https://convohub-kv2qalfll-rushikeshs-projects-0260b878.vercel.app",
            "https://convohub-api.me"
        ];
        
        // Allow if no origin, or if in allowed list, or if it's a trycloudflare domain, github.io, convohub-api.me, or Vercel-hosted frontend
        if (!origin || allowedOrigins.includes(origin) || 
            (origin && (origin.includes('.trycloudflare.com') || origin.includes('.github.io') || origin.includes('convohub-api.me') || origin.includes('vercel.app')))) {
            console.log('✅ CORS Allowed');
            callback(null, true);
        } else {
            console.log('❌ CORS Blocked:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400 // 24 hours
}));

// basic express middleware
app.use(express.json()); // parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // parse URL-encoded bodies

// Log all incoming requests for debugging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// simple test route to check if server is running (MUST BE BEFORE STATIC FILES)
app.get('/', (req, res) => {
    res.json({
        message: 'ConvoHub Chat Server is running!',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            messages: '/api/messages',
            chats: '/api/chats',
            health: '/health',
            socket: '/socket.io/ (WebSocket only - use browser or Socket.IO client)'
        }
    });
});

// Import routes
const userRoutes = require('./routes/user.routes');
const messageRoutes = require('./routes/message.routes');
const chatRoutes = require('./routes/chat.routes');
const authRoutes = require('./routes/auth.routes');
const uploadRoutes = require('./routes/upload.routes');

// Use routes
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/auth', authRoutes);
app.use('/uploads', uploadRoutes); // Secure file serving

// Serve static files AFTER API routes to avoid conflicts
app.use(express.static('.'));

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    server: 'running',
    database: dbStatus ? 'connected' : 'disconnected'
  });
});

// Initialize socket handler
initializeSocket(io);

// start the server
const PORT = process.env.PORT || 3001;

// Start server only after DB connection is confirmed
async function startServer() {
  const dbUrl = process.env.DATABASE_URL || 'Database URL not set';
  console.log(`🔗 Attempting to connect to database at: ${dbUrl}`);

  const dbConnected = await testConnection();
  
  if (!dbConnected) {
    console.error('❌ Failed to connect to database. Server not started.');
    process.exit(1);
  }
  
  server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📡 Socket.IO is ready for connections`);
    console.log(`🔐 JWT Authentication enabled`);
  });
}

startServer();
