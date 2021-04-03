FROM node:12-alpine

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ src/
RUN npm install

RUN mkdir build
RUN ["npm", "run", "build"]
CMD ["npm", "start"]
