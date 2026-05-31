#!/usr/bin/env bash
set -e

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — review and update values before use."
fi

npm run dev
