#!/bin/bash

# ConvoHub Server Deployment Script for AWS EC2

echo "🚀 Starting ConvoHub deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as ubuntu user
if [ "$USER" != "ubuntu" ]; then
    echo -e "${YELLOW}Warning: This script is designed to run as ubuntu user${NC}"
fi

# Create logs directory
mkdir -p logs

# Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
npm install --production

# Generate Prisma Client
echo -e "${GREEN}🔧 Generating Prisma Client...${NC}"
npx prisma generate

# Run database migrations
echo -e "${GREEN}🗄️  Running database migrations...${NC}"
npx prisma db push

# Optional: Seed database (comment out if not needed)
# echo -e "${GREEN}🌱 Seeding database...${NC}"
# npm run db:seed

# Stop existing PM2 process if running
echo -e "${GREEN}⏹️  Stopping existing server...${NC}"
pm2 stop convohub-server 2>/dev/null || true
pm2 delete convohub-server 2>/dev/null || true

# Start server with PM2
echo -e "${GREEN}▶️  Starting server with PM2...${NC}"
pm2 start ecosystem.config.js --env production

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo -e "${GREEN}✅ Deployment completed!${NC}"
echo -e "${YELLOW}📊 Check server status: pm2 status${NC}"
echo -e "${YELLOW}📜 View logs: pm2 logs convohub-server${NC}"
echo -e "${YELLOW}🔄 Restart server: pm2 restart convohub-server${NC}"
echo -e "${YELLOW}⏹️  Stop server: pm2 stop convohub-server${NC}"
