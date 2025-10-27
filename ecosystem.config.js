// PM2 Configuration for Production
module.exports = {
  apps: [{
    name: 'convohub-server',
    script: './src/server.js',
    instances: 1, // Use 'max' for cluster mode based on CPU cores
    exec_mode: 'fork', // Use 'cluster' for multiple instances
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Restart policies
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    // Advanced features
    listen_timeout: 10000,
    kill_timeout: 5000,
    shutdown_with_message: true
  }]
};
