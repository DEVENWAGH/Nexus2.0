FROM node:22-alpine

WORKDIR /app

# Install build tools needed for native modules (node-datachannel / node-gyp)
RUN apk add --no-cache python3 make g++ cmake linux-headers

# Copy package.json and install deps inside the container
COPY package.json ./
RUN npm install --production

# Copy application files
COPY index.js ./

# Create data directory for persistence
RUN mkdir -p data

# Expose ports:
# 3005: HTTP Status / Health check / Query server
# 4001: libp2p TCP transport
EXPOSE 3005
EXPOSE 4001

CMD ["node", "index.js"]
