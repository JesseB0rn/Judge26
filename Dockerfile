# Production image: PocketBase serving the API and the built Vue SPA (pb_public).

FROM node:24-alpine AS web
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @judge26/web
COPY apps/web apps/web
RUN pnpm --filter @judge26/web build-only

FROM alpine:3 AS pocketbase
ARG TARGETARCH
COPY apps/backend/pocketbase.version /tmp/pocketbase.version
RUN apk add --no-cache curl unzip \
 && VERSION=$(cat /tmp/pocketbase.version) \
 && ARCH=${TARGETARCH:-amd64} \
 && FILE=pocketbase_${VERSION}_linux_${ARCH}.zip \
 && curl -fsSLO https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/${FILE} \
 && curl -fsSLO https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/checksums.txt \
 && grep " ${FILE}\$" checksums.txt | sha256sum -c - \
 && unzip ${FILE} pocketbase -d /pb

FROM alpine:3
RUN apk add --no-cache ca-certificates wget
WORKDIR /pb
COPY --from=pocketbase /pb/pocketbase /pb/pocketbase
COPY apps/backend/migrations /pb/migrations
COPY apps/backend/hooks /pb/hooks
COPY --from=web /app/apps/web/dist /pb/pb_public

ENV PB_ENV=production
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/migrations", "--hooksDir=/pb/hooks", "--publicDir=/pb/pb_public"]
