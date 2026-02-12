# Multi-stage Dockerfile for Jobs Service
# Builds API, Worker, and Monitor services

# Stage 1: Base - Install dependencies
FROM node:18-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Copy source code
COPY src ./src

# Stage 2: Build - Compile TypeScript
FROM base AS build

WORKDIR /app

# Build the application
RUN npm run build

# Stage 3: Production - Runtime
FROM node:18-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built application from build stage
COPY --from=build /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Default environment variables (can be overridden by docker-compose)
ENV NODE_ENV=production

# Expose ports (will be overridden in docker-compose)
EXPOSE 3000

# Entry point will be specified in docker-compose
# CMD will be overridden by docker-compose command
CMD ["node", "dist/apps/api/main.js"]
