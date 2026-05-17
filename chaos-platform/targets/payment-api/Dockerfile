FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache stress-ng

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5001

CMD ["node", "index.js"]
