FROM node:22-slim

WORKDIR /app

# Copy backend code and simulator
COPY backend/ ./backend/
COPY simulator/ ./simulator/

# Install dependencies
WORKDIR /app/backend
RUN npm ci --omit=dev

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]
