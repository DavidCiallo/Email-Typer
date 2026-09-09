# ---- frontend (rsbuild + bun) ----
FROM oven/bun:1-alpine AS web
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.html rsbuild.config.ts tsconfig.json postcss.config.mjs ./
COPY client/ ./client/
COPY shared/ ./shared/
RUN bun run build

# ---- server (pure-Go, no CGo) ----
FROM golang:1.23-alpine AS api
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/cfrs-email .

# ---- runtime ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=api /out/cfrs-email ./cfrs-email
COPY --from=web /app/dist ./dist
RUN mkdir -p data eml
EXPOSE 3300
CMD ["./cfrs-email"]
