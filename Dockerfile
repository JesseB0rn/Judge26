# Production image: PocketBase serving the API and the built Vue SPA (pb_public).

FROM node:24-alpine AS web
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/scoring-engine/package.json packages/scoring-engine/
COPY packages/ranking-engine/package.json packages/ranking-engine/
COPY packages/scheduling-engine/package.json packages/scheduling-engine/
RUN pnpm install --frozen-lockfile --filter @judge26/web --filter @judge26/scoring-engine --filter @judge26/ranking-engine --filter @judge26/scheduling-engine
COPY packages packages
COPY apps/web apps/web
# SPA build, and the engine bundles for PocketBase hooks (apps/backend/hooks/lib).
RUN pnpm --filter @judge26/web build-only \
 && pnpm --filter @judge26/scoring-engine build:hooks \
 && pnpm --filter @judge26/ranking-engine build:hooks \
 && pnpm --filter @judge26/scheduling-engine build:hooks

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
COPY --from=web /app/apps/backend/hooks/lib/scoring-engine.js /app/apps/backend/hooks/lib/ranking-engine.js /pb/hooks/lib/
COPY --from=web /app/apps/web/dist /pb/pb_public

ENV PB_ENV=production
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/migrations", "--hooksDir=/pb/hooks", "--hooksWatch=false", \
     "--publicDir=/pb/pb_public"]
