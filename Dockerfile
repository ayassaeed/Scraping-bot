# Use official Playwright image (includes all browser deps)
FROM mcr.microsoft.com/playwright:v1.44.1-jammy

WORKDIR /app

# Install Node deps first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Install Chromium browser
RUN npx playwright install chromium

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Non-root user for security
RUN groupadd -r botuser && useradd -r -g botuser botuser
RUN chown -R botuser:botuser /app
USER botuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/server.js"]
