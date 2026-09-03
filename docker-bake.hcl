variable "REGISTRY"       { default = "ghcr.io" }
variable "OWNER"          { default = "openrift" }
variable "REF"            { default = "preview" }
variable "SHA_TAG"        { default = "" }
variable "CACHE_SCOPE"    { default = "main-build" }
variable "SENTRY_ORG"     { default = "" }
variable "SENTRY_PROJECT" { default = "" }

group "default" {
  targets = ["api", "web", "proxy", "bot"]
}

target "_base" {
  context    = "."
  dockerfile = "Dockerfile"
  # Sentry source-map upload runs during `bun run build` in stage 1. ORG and
  # PROJECT are non-sensitive build args. The auth token is a BuildKit secret
  # so it stays out of image history. When SENTRY_AUTH_TOKEN is empty, the
  # Sentry Vite plugin skips upload (local `docker build` works this way).
  args = {
    SENTRY_ORG     = SENTRY_ORG
    SENTRY_PROJECT = SENTRY_PROJECT
  }
  secret = ["id=sentry_auth_token,env=SENTRY_AUTH_TOKEN"]
}

function "tags_for" {
  params = [image]
  result = concat(
    ["${REGISTRY}/${OWNER}/${image}:${REF}"],
    SHA_TAG != "" ? ["${REGISTRY}/${OWNER}/${image}:sha-${SHA_TAG}"] : [],
  )
}

# One cache ref per target: parallel bake targets exporting to a shared ref
# clobber each other, and type=gha evicts at GitHub's 10 GB per-repo cap.
function "cache_from_for" {
  params = [stage]
  result = ["type=registry,ref=${REGISTRY}/${OWNER}/openrift-buildcache:${CACHE_SCOPE}-${stage}"]
}

function "cache_to_for" {
  params = [stage]
  result = ["type=registry,mode=max,image-manifest=true,oci-mediatypes=true,ref=${REGISTRY}/${OWNER}/openrift-buildcache:${CACHE_SCOPE}-${stage}"]
}

target "api" {
  inherits   = ["_base"]
  target     = "api"
  tags       = tags_for("openrift-api")
  cache-from = cache_from_for("api")
  cache-to   = cache_to_for("api")
}

target "web" {
  inherits   = ["_base"]
  target     = "web"
  tags       = tags_for("openrift-web")
  cache-from = cache_from_for("web")
  cache-to   = cache_to_for("web")
}

target "proxy" {
  inherits   = ["_base"]
  target     = "proxy"
  tags       = tags_for("openrift-proxy")
  cache-from = cache_from_for("proxy")
  cache-to   = cache_to_for("proxy")
}

target "bot" {
  inherits   = ["_base"]
  target     = "bot"
  tags       = tags_for("openrift-bot")
  cache-from = cache_from_for("bot")
  cache-to   = cache_to_for("bot")
}
