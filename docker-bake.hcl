variable "REGISTRY"       { default = "ghcr.io" }
variable "OWNER"          { default = "openrift" }
variable "REF"            { default = "preview" }
variable "PUSH_LATEST"    { default = false }
variable "CACHE_SCOPE"    { default = "main-build" }
variable "SENTRY_ORG"     { default = "" }
variable "SENTRY_PROJECT" { default = "" }

group "default" {
  targets = ["api", "web", "proxy"]
}

target "_base" {
  context    = "."
  dockerfile = "Dockerfile"
  cache-from = ["type=gha,scope=${CACHE_SCOPE}"]
  cache-to   = ["type=gha,mode=max,scope=${CACHE_SCOPE}"]
  # Sentry source-map upload runs during `bun run build` in stage 1. ORG and
  # PROJECT are non-sensitive build args. The auth token is a BuildKit secret
  # so it stays out of image history. When SENTRY_AUTH_TOKEN is empty, the
  # Sentry Vite plugin skips upload (preview builds work this way).
  args = {
    SENTRY_ORG     = SENTRY_ORG
    SENTRY_PROJECT = SENTRY_PROJECT
  }
  secret = ["id=sentry_auth_token,env=SENTRY_AUTH_TOKEN"]
}

function "tags_for" {
  params = [image]
  result = PUSH_LATEST ? ["${REGISTRY}/${OWNER}/${image}:${REF}", "${REGISTRY}/${OWNER}/${image}:latest"] : ["${REGISTRY}/${OWNER}/${image}:${REF}"]
}

target "api" {
  inherits = ["_base"]
  target   = "api"
  tags     = tags_for("openrift-api")
}

target "web" {
  inherits = ["_base"]
  target   = "web"
  tags     = tags_for("openrift-web")
}

target "proxy" {
  inherits = ["_base"]
  target   = "proxy"
  tags     = tags_for("openrift-proxy")
}
