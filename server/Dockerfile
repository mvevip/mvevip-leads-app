FROM node:20-alpine

WORKDIR /app

# Instalar dependencias necesarias para openssl (Prisma)
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 6411

CMD ["npm", "start"]
