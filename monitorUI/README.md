# Monitor UI

A simple Vue 3 + Vuetify dashboard for visualizing Jobs Service metrics.

## Features

- Real-time monitoring dashboard
- Auto-refresh every 10 seconds
- Display system, job, queue, and worker metrics
- Connection status indicator
- Manual refresh button

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure API URL:
```bash
cp .env.example .env
# Edit .env and set VITE_MONITOR_API_URL if different from default
```

3. Run development server:
```bash
npm run dev
```

The UI will be available at http://localhost:8080

## Environment Variables

- `VITE_MONITOR_API_URL` - Monitor service API URL (default: http://localhost:3002)

## Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Tech Stack

- Vue 3 (Composition API)
- Vuetify 3 (Material Design components)
- Vite (Build tool)
- Axios (HTTP client)

## Future Enhancements

- Charts and graphs for metrics visualization
- Historical data tracking
- Real-time WebSocket updates
- Alerting and notifications
- Dark mode toggle
- Filtering and search
- Export metrics data
