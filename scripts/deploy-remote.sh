#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-agent-hub}"
FEATURE="${FEATURE:-remote-deploy}"
PLATFORM="${PLATFORM:-linux/amd64}"
SSH_TARGET="${SSH_TARGET:-}"
SSH_PORT="${SSH_PORT:-22}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
CONTEXT="${CONTEXT:-.}"
TAG="${TAG:-$(date '+%Y%m%d')-${FEATURE}}"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

if [[ -z "${SSH_TARGET}" ]]; then
  echo "SSH_TARGET is required, for example: SSH_TARGET=user@example.com $0" >&2
  exit 1
fi

echo "Building ${FULL_IMAGE} for ${PLATFORM}"
docker buildx build \
  --platform "${PLATFORM}" \
  -t "${FULL_IMAGE}" \
  --output type=docker,dest=- \
  --progress=plain \
  -f "${DOCKERFILE}" \
  "${CONTEXT}" \
| gzip \
| ssh -p "${SSH_PORT}" "${SSH_TARGET}" "gunzip | docker load"

echo "Loaded image on remote: ${FULL_IMAGE}"
ssh -p "${SSH_PORT}" "${SSH_TARGET}" "docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | grep '^${IMAGE_NAME}[[:space:]]' || true"
