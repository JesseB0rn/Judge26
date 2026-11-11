# Production image (M7-14): PocketBase serving the API and the built Vue SPA (pb_public).
# See docs/operations/deployment.md.
#
# Reproducible: base images are pinned by digest, dependencies by pnpm-lock.yaml (frozen) and the
# pnpm version in package.json, PocketBase by apps/backend/pocketbase.version and its checksum.
#
#   docker build --build-arg APP_VERSION=1.2.0 --build-arg GIT_COMMIT=$(git rev-parse HEAD) .

# Update the digests together with the tags (docker buildx imagetools inspect <image>).
ARG NODE_IMAGE=node:24.22.2-alpine3.24@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
ARG ALPINE_IMAGE=alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf

FROM ${NODE_IMAGE} AS web
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/scoring-engine/package.json packages/scoring-engine/
COPY packages/ranking-engine/package.json packages/ranking-engine/
RUN pnpm install --frozen-lockfile --filter @judge26/web --filter @judge26/scoring-engine --filter @judge26/ranking-engine
COPY packages/scoring-engine packages/scoring-engine
COPY packages/ranking-engine packages/ranking-engine
COPY apps/web apps/web
# SPA build, and the scoring/ranking bundles for PocketBase hooks (apps/backend/hooks/lib).
# (The scheduling engine is used by neither the SPA nor the hooks.)
RUN pnpm --filter @judge26/web build-only \
 && pnpm --filter @judge26/scoring-engine build:hooks \
 && pnpm --filter @judge26/ranking-engine build:hooks

FROM ${ALPINE_IMAGE} AS pocketbase
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

FROM ${ALPINE_IMAGE}
ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.title="Judge26" \
      org.opencontainers.image.description="WRO competition management platform" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="https://github.com/JesseB0rn/Judge26"
# su-exec: the entrypoint fixes data ownership as root, then runs PocketBase unprivileged.
RUN apk add --no-cache ca-certificates tzdata wget su-exec \
 && addgroup -S -g 10001 judge26 \
 && adduser -S -D -H -u 10001 -G judge26 judge26 \
 && mkdir -p /pb/pb_data \
 && chown judge26:judge26 /pb/pb_data
WORKDIR /pb
COPY --from=pocketbase /pb/pocketbase /pb/pocketbase
COPY apps/backend/migrations /pb/migrations
COPY apps/backend/hooks /pb/hooks
COPY --from=web /app/apps/backend/hooks/lib/scoring-engine.js /app/apps/backend/hooks/lib/ranking-engine.js /pb/hooks/lib/
COPY --from=web /app/apps/web/dist /pb/pb_public
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV PB_ENV=production \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT}
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8090/api/app/health || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# --encryptionEnv: SMTP and S3 secrets in the settings are encrypted with PB_ENCRYPTION_KEY
# (32 characters) when it is set. Never change the key of an existing installation.
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/migrations", "--hooksDir=/pb/hooks", "--hooksWatch=false", \
     "--publicDir=/pb/pb_public", "--encryptionEnv=PB_ENCRYPTION_KEY"]
