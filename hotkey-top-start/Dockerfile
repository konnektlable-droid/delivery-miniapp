FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY prisma ./prisma
COPY src ./src
COPY public ./public
COPY storage ./storage
COPY .env.example ./
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "src/index.js"]
