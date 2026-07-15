FROM node:22-alpine

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies using yarn (adhering to user rules)
RUN yarn install

# Copy application files
COPY index.js ./

# Create data directory for persistence
RUN mkdir -p data

# Expose ports:
# 3005: HTTP Status / Health check server
# 4001: libp2p TCP transport
EXPOSE 3005
EXPOSE 4001

# Run the app
CMD ["yarn", "start"]
