# Mail relay image (M9-D): delivers PocketBase's email to Microsoft 365 with OAuth 2.0. Runs next
# to the app when SMTP_AUTH=oauth2 (compose profile "mail-oauth"). See
# docs/operations/deployment.md#email-with-oauth-microsoft-365.
#
#   docker build -f docker/mail-relay.Dockerfile --build-arg APP_VERSION=1.2.0 .

# Same Node image as the main Dockerfile; update the digests together.
ARG NODE_IMAGE=node:24.22.2-alpine3.24@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mail-relay/package.json apps/mail-relay/
# Production dependencies only, from the lockfile.
RUN pnpm install --frozen-lockfile --prod --filter @judge26/mail-relay

FROM ${NODE_IMAGE}
ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.title="Judge26 mail relay" \
      org.opencontainers.image.description="SMTP relay delivering Judge26 email with OAuth 2.0" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="https://github.com/JesseB0rn/Judge26"
# The pnpm layout of the deps stage, so the package's node_modules links resolve.
WORKDIR /app/apps/mail-relay
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/mail-relay/node_modules ./node_modules
COPY apps/mail-relay/package.json ./
COPY apps/mail-relay/src ./src
ENV NODE_ENV=production
USER node
EXPOSE 2525
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD \
  node -e "require('net').connect(2525,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
# Node runs the TypeScript sources directly (type stripping).
CMD ["node", "src/index.ts"]
