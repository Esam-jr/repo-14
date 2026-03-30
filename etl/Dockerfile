FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY cleanse.js run_etl.sh ./
RUN chmod +x /app/run_etl.sh

CMD ["sh", "/app/run_etl.sh"]
