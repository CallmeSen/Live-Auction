#!/bin/sh
set -e

python -m app.commands.seed_db

exec "$@"