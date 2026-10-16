# 1. Programmcode verschleiert zusammenbauen
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 2. Server ohne Zusatzpakete; lesbare Programmquellen werden nicht ausgeliefert
FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY server ./server
COPY site ./site
COPY legal ./legal
COPY css ./css
COPY fonts ./fonts
COPY index.html ./
# nur was der Server braucht: Formatcode (Export), Daten (Schriften), pdf.js; Programm-Quelltexte bleiben im Build
COPY js/geometry.js js/dst.js js/dst_io.js js/formats.js js/fonts.js js/garment_assets.js ./js/
COPY js/stickfonts ./js/stickfonts
COPY js/vendor ./js/vendor
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "--no-warnings", "server/server.js"]
