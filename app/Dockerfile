# VydeoAI Production Renderer & Worker Container
# OS: Debian 12 (Bookworm Slim) / Node 20 LTS
# Includes native FFmpeg with libfreetype, libass, and multilingual open-source fonts

FROM node:20-bookworm-slim AS base

# Install system dependencies: FFmpeg, fonts, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-cjk \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application code and bundled fonts
COPY . .

# Ensure font directories and temporary render SSD directories exist with proper permissions
RUN mkdir -p /var/tmp/ai-video-renders public/fonts && \
    chmod 777 /var/tmp/ai-video-renders

ENV NODE_ENV=production
ENV GOOGLE_VERTEX_LOCATION=global

EXPOSE 3000

# Default command: run worker or web server based on CMD
CMD ["npm", "start"]
