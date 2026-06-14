FROM node:20-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

# Copy the rest of the application.
COPY . .

# Persistent data directory for the JSON store (DATA_FILE defaults to /data/domains.json).
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 80

CMD ["node", "server.js"]
