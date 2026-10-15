FROM node:22-alpine
WORKDIR /app
COPY . .
RUN rm -rf tests tools data && mkdir -p /data && chown node:node /data
USER node
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "--no-warnings", "server/server.js"]
