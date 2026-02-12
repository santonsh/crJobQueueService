#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API endpoint
API_URL="http://localhost:3000"

# Helper functions
pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    if [ ! -z "$2" ]; then
        echo -e "${RED}  Details: $2${NC}"
    fi
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Wait for service to be ready
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=0

    info "Waiting for $name to be ready..."

    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            pass "$name is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    fail "$name failed to start within 30 seconds"
    return 1
}

# Wait for job to reach a specific status
wait_for_status() {
    local job_id=$1
    local expected_status=$2
    local max_attempts=${3:-30}
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local status=$(curl -s "$API_URL/jobs/$job_id" | jq -r '.status')

        if [ "$status" == "$expected_status" ]; then
            return 0
        fi

        attempt=$((attempt + 1))
        sleep 1
    done

    return 1
}
