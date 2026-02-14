#!/bin/bash

# Resource Monitoring Script
# Monitors Docker container resources during load test
# Usage: ./monitor-resources.sh [duration_seconds]

DURATION=${1:-60}
INTERVAL=2  # Sample every 2 seconds

echo "================================================================================
Resource Monitoring - Duration: ${DURATION}s, Interval: ${INTERVAL}s
================================================================================
"

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running"
    exit 1
fi

# Get container names
API_CONTAINER="jobs-api"
POSTGRES_CONTAINER="jobs-postgres"
REDIS_CONTAINER="jobs-redis"
MONITOR_CONTAINER="jobs-monitor"

echo "Monitoring containers:"
echo "  - $API_CONTAINER"
echo "  - $POSTGRES_CONTAINER"
echo "  - $REDIS_CONTAINER"
echo "  - $MONITOR_CONTAINER"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo "================================================================================
"

# CSV output file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="resource-metrics-${TIMESTAMP}.csv"

# Write CSV header
echo "Time,Container,CPU%,MemUsage,MemLimit,MemPercent,NetIn,NetOut,BlockIn,BlockOut" > "$OUTPUT_FILE"

START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))

echo "Started monitoring at $(date)"
echo "Saving data to: $OUTPUT_FILE"
echo ""

printf "%-8s %-20s %8s %12s %12s %10s %12s\n" "Time" "Container" "CPU%" "Mem" "Mem%" "NetIO" "BlockIO"
echo "--------------------------------------------------------------------------------"

while [ $(date +%s) -lt $END_TIME ]; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    # Get stats for each container
    for CONTAINER in $API_CONTAINER $POSTGRES_CONTAINER $REDIS_CONTAINER $MONITOR_CONTAINER; do
        # Check if container exists
        if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
            continue
        fi

        # Get container stats (one-time snapshot)
        STATS=$(docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" "$CONTAINER" 2>/dev/null)

        if [ -n "$STATS" ]; then
            # Parse stats
            NAME=$(echo "$STATS" | cut -d',' -f1)
            CPU=$(echo "$STATS" | cut -d',' -f2)
            MEM=$(echo "$STATS" | cut -d',' -f3)
            MEM_PERC=$(echo "$STATS" | cut -d',' -f4)
            NET=$(echo "$STATS" | cut -d',' -f5)
            BLOCK=$(echo "$STATS" | cut -d',' -f6)

            # Extract memory usage and limit
            MEM_USAGE=$(echo "$MEM" | awk '{print $1}')
            MEM_LIMIT=$(echo "$MEM" | awk '{print $3}')

            # Extract network in/out
            NET_IN=$(echo "$NET" | awk '{print $1}')
            NET_OUT=$(echo "$NET" | awk '{print $3}')

            # Extract block in/out
            BLOCK_IN=$(echo "$BLOCK" | awk '{print $1}')
            BLOCK_OUT=$(echo "$BLOCK" | awk '{print $3}')

            # Write to CSV
            echo "${ELAPSED}s,${NAME},${CPU},${MEM_USAGE},${MEM_LIMIT},${MEM_PERC},${NET_IN},${NET_OUT},${BLOCK_IN},${BLOCK_OUT}" >> "$OUTPUT_FILE"

            # Display summary (only API and Postgres for readability)
            if [ "$CONTAINER" = "$API_CONTAINER" ] || [ "$CONTAINER" = "$POSTGRES_CONTAINER" ]; then
                printf "%-8s %-20s %8s %12s %10s %12s %12s\n" "${ELAPSED}s" "$NAME" "$CPU" "$MEM_USAGE" "$MEM_PERC" "$NET_IN" "$BLOCK_IN"
            fi
        fi
    done

    sleep $INTERVAL
done

echo ""
echo "================================================================================
Monitoring Complete
================================================================================
"

# Analyze results
echo "Resource Summary:"
echo ""

# Find peak CPU usage
echo "Peak CPU Usage:"
awk -F',' 'NR>1 {gsub(/%/, "", $3); if ($3 > max[$2]) max[$2] = $3} END {for (c in max) printf "  %-20s %6.2f%%\n", c, max[c]}' "$OUTPUT_FILE"
echo ""

# Find peak Memory usage
echo "Peak Memory Usage:"
awk -F',' 'NR>1 {gsub(/MiB|GiB/, "", $4); if ($4 > max[$2]) max[$2] = $4} END {for (c in max) printf "  %-20s %8s MiB\n", c, max[c]}' "$OUTPUT_FILE"
echo ""

# Check for disk I/O (should be zero with tmpfs)
echo "Total Block I/O (should be minimal with tmpfs):"
awk -F',' 'NR>1 && $2=="'$POSTGRES_CONTAINER'" {gsub(/[kMGBB]/, "", $9); total+=$9} END {printf "  PostgreSQL: %s (if > 1GB, not using tmpfs!)\n", total}' "$OUTPUT_FILE"
echo ""

echo "Detailed data saved to: $OUTPUT_FILE"
echo "To analyze: cat $OUTPUT_FILE | column -t -s,"
