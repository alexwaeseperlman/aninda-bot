FROM node:12-alpine

WORKDIR /app
COPY . .
RUN npm install --only=prod

CMD ["npm", "build"]
CMD ["npm", "start"]
