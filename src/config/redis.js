const { createClient } = require('redis');

let redisClient = null;

const initRedis = async () => {
  if (redisClient) {
    return redisClient; // Already connected
  }

  try {
    // Configuration for AWS ElastiCache Valkey with TLS support
    const redisConfig = {
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Max reconnection attempts reached');
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 100, 3000); // Exponential backoff
        }
      }
    };

    // Check if using AWS ElastiCache/Valkey with TLS
    if (process.env.REDIS_HOST) {
      redisConfig.socket.host = process.env.REDIS_HOST;
      redisConfig.socket.port = parseInt(process.env.REDIS_PORT || '6379');
      
      // Enable TLS if specified
      if (process.env.REDIS_TLS === 'true') {
        redisConfig.socket.tls = true;
        redisConfig.socket.rejectUnauthorized = false; // AWS ElastiCache uses self-signed certs
      }

      // Add password if specified
      if (process.env.REDIS_PASSWORD) {
        redisConfig.password = process.env.REDIS_PASSWORD;
      }
    } else {
      // Fallback to URL-based connection (local Redis)
      redisConfig.url = process.env.REDIS_URL || 'redis://localhost:6379';
    }

    redisClient = createClient(redisConfig);

    redisClient.on('error', (err) => {
      console.error('Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('Redis connecting...');
    });

    redisClient.on('ready', () => {
      console.log('Redis connected and ready');
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error.message);
    redisClient = null;
    throw error;
  }
};

// Graceful shutdown
const closeRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('Redis connection closed gracefully');
    } catch (error) {
      console.error('Error closing Redis:', error.message);
    }
  }
};

// Export a promise that resolves to the client
let clientPromise = null;

const getRedisClient = () => {
  if (!clientPromise) {
    clientPromise = initRedis();
  }
  return clientPromise;
};

// Export the initialized client (wrapped)
module.exports = new Proxy({}, {
  get: (target, prop) => {
    // Return async wrapper for all Redis methods
    return async (...args) => {
      const client = await getRedisClient();
      return client[prop](...args);
    };
  }
});

// Also export control functions
module.exports.initRedis = initRedis;
module.exports.closeRedis = closeRedis;
module.exports.getRedisClient = getRedisClient;