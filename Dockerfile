# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install production dependencies based on root package.json
COPY package*.json ./
# Skip lifecycle scripts (e.g., husky prepare) during install
ENV HUSKY=0
RUN npm ci --omit=dev --ignore-scripts

# Ensure ws is available at runtime without modifying repo deps
RUN npm i ws@^8 --no-save

# Copy only the WebSocket server code
COPY server ./server

ENV NODE_ENV=production \
    TWILIO_WS_PORT=8787

EXPOSE 8787

CMD ["node", "server/twilio-media-ws.js"]
