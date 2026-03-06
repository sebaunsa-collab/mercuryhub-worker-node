# STAGE 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Instalación de dependencias de compilación para paquetes nativos
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    libuuid

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# STAGE 2: Production
FROM node:20-alpine

WORKDIR /app

# Dependencias necesarias para la ejecución y procesamiento de medios (Voz/QR)
RUN apk add --no-cache \
    git \
    libuuid \
    ffmpeg \
    coreutils

# Solo instalamos dependencias de producción para mantener la imagen ligera
COPY package*.json ./
RUN npm install --production

# Copiamos solo el código compilado desde el builder
COPY --from=builder /app/dist ./dist

# Variables de entorno por defecto
ENV PORT=10000
EXPOSE 10000

# Iniciamos la antena
CMD ["npm", "start"]
