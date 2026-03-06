FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache git python3 make g++ libuuid coreutils nano

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN apk add --no-cache git \
    libuuid \
    coreutils \
    ffmpeg

RUN npm install --production

EXPOSE 10000

CMD ["npm", "start"]
