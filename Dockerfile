# Multi-stage build for NG Forward Curve Application
# Stage 1: Build the application
FROM node:22-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Stage 2: Production image
FROM node:22-slim AS runner

# Install Python and pip for gas_storage integration
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy package files for production dependencies
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy Python bridge script and requirements
COPY server/gas_storage_bridge.py ./dist/gas_storage_bridge.py
COPY requirements.txt ./requirements.txt

# Create a virtual environment and install Python dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies including gas_storage from GitHub
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir git+https://github.com/AnattaResearch/gas_storage.git@main

# Copy drizzle migrations (needed for db:push if running migrations)
COPY drizzle ./drizzle
COPY drizzle.config.ts ./drizzle.config.ts

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Health check - using curl to check the tRPC health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/api/trpc/system.health', (res) => { let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => { try { const json = JSON.parse(data); process.exit(json.result?.data?.ok ? 0 : 1); } catch(e) { process.exit(1); } }); }); req.on('error', () => process.exit(1));"

# Start the application
CMD ["node", "dist/index.js"]
