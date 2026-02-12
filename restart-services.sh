#!/bin/bash

echo "Stopping any running services..."
pkill -f "nest start" 2>/dev/null || true

echo "Waiting for services to stop..."
sleep 2

echo "Starting API server..."
cd codebase
npm run start:api > ../logs/api.log 2>&1 &
API_PID=$!
echo "API PID: $API_PID"

sleep 3

echo "Starting Worker..."
npm run start:worker > ../logs/worker.log 2>&1 &
WORKER_PID=$!
echo "Worker PID: $WORKER_PID"

sleep 3

echo "Starting Monitor..."
npm run start:monitor > ../logs/monitor.log 2>&1 &
MONITOR_PID=$!
echo "Monitor PID: $MONITOR_PID"

sleep 3

echo ""
echo "Services started:"
echo "  API:     PID $API_PID (port 3000)"
echo "  Worker:  PID $WORKER_PID (port 3001)"
echo "  Monitor: PID $MONITOR_PID (port 3002)"
echo ""
echo "Logs:"
echo "  tail -f logs/api.log"
echo "  tail -f logs/worker.log"
echo "  tail -f logs/monitor.log"
echo ""
echo "To stop: pkill -f 'nest start'"
