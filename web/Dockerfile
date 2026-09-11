FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts server.ts ./
COPY src ./src
COPY public ./public
COPY scripts/build-sw.mjs ./scripts/build-sw.mjs
RUN npm run build
ENV NODE_ENV=production HOST=0.0.0.0
CMD ["npm","start"]
