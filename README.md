# ⚡ ChaosLab — Chaos Engineering & Auto-Repair Platform

> Deliberately break your applications before production does. ChaosLab injects real-world faults into containerised services under load, observes the blast radius, and autonomously repairs what breaks.

![Platform](https://img.shields.io/badge/platform-Docker-2496ED?logo=docker&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black)
![Prometheus](https://img.shields.io/badge/Prometheus-monitored-E6522C?logo=prometheus&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📌 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Running the Platform](#running-the-platform)
- [Fault Types](#fault-types)
- [Auto-Repair Logic](#auto-repair-logic)
- [API Reference](#api-reference)
- [Monitoring & Observability](#monitoring--observability)
- [Load Testing](#load-testing)
- [Contributing](#contributing)

---

## Overview

ChaosLab is a self-hosted chaos engineering platform built as a DevOps/SRE engineering project. It allows you to:

1. **Register** any containerised application as a test target
2. **Design** chaos experiments combining multiple fault types
3. **Inject** faults while simultaneously ramping traffic with k6
4. **Observe** real-time container metrics via Prometheus and cAdvisor
5. **Auto-repair** — the platform detects what broke and heals it automatically
6. **Report** — every run produces a full audit log of faults injected, metrics breached, and repairs applied

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChaosLab Platform                        │
│                                                                  │
│   ┌──────────┐    ┌──────────────┐    ┌─────────────────────┐  │
│   │  React   │◄──►│  Chaos API   │◄──►│   RepairWorker      │  │
│   │Dashboard │    │  (Express)   │    │  (auto-healing loop) │  │
│   └──────────┘    └──────┬───────┘    └─────────┬───────────┘  │
│        ▲                 │                       │              │
│   Socket.io         BullMQ Queue           Prometheus          │
│        │                 │                  (metrics)          │
│        └─────────────────┼───────────────────────┘             │
│                          │                                      │
│   ┌───────────┐   ┌──────▼──────┐   ┌──────────────────────┐  │
│   │ k6  Load  │   │Fault Workers│   │   cAdvisor + Docker   │  │
│   │Generator  │   │cpu/mem/net/ │   │   (container stats)   │  │
│   └─────┬─────┘   │kill/latency │   └──────────────────────┘  │
│         │         └──────┬──────┘                              │
└─────────┼────────────────┼────────────────────────────────────┘
          │                │
          ▼                ▼
   ┌─────────────────────────────┐
   │     Target Applications     │
   │  ┌─────────────┐  ┌──────┐  │
   │  │ Payment API │  │ Auth │  │
   │  │  (Node.js)  │  │ Svc  │  │
   │  └─────────────┘  └──────┘  │
   └─────────────────────────────┘
```

---

## Features

- **Fault injection** — CPU spike, memory exhaustion, network latency, packet loss, disk I/O throttle, container kill
- **Traffic generation** — k6 load profiles (ramp-up, spike, soak) run programmatically
- **Real-time observability** — Prometheus scrapes container metrics every 5s, streamed live to the dashboard
- **Auto-repair engine** — detects violations and applies the right remediation without human input
- **Blast radius control** — per-target concurrency lock, auto-rollback after timeout, global kill switch
- **Full audit trail** — every fault, metric breach, and repair action logged to PostgreSQL
- **Live dashboard** — React UI with Socket.io log streaming and Recharts metric graphs
- **Grafana integration** — pre-wired dashboards for container CPU, memory, and network

---

## Tech Stack

| Layer | Technology |
|---|---|
| Control plane API | Node.js, Express, Socket.io |
| Job queue | BullMQ + Redis |
| Container control | Dockerode (Docker SDK) |
| Fault proxy | Toxiproxy (network faults) |
| Load generator | k6 |
| Metrics | Prometheus, cAdvisor, prom-client |
| Visualisation | Grafana |
| Database | PostgreSQL (pg) |
| Frontend | React, Vite, TypeScript, Recharts |
| Deployment | Docker Compose |

---

## Project Structure

```
chaos-platform/
├── api/                          # Control plane
│   └── src/
│       ├── routes/               # REST API endpoints
│       │   ├── targets.js        # Register/manage target apps
│       │   ├── experiments.js    # Experiment CRUD
│       │   └── runs.js           # Trigger & abort runs
│       ├── workers/
│       │   ├── chaosWorker.js    # Executes fault jobs from queue
│       │   └── repairWorker.js   # Auto-repair loop
│       ├── faults/
│       │   ├── cpu.js            # stress-ng CPU injection
│       │   ├── memory.js         # stress-ng memory injection
│       │   ├── network.js        # Toxiproxy latency/loss
│       │   └── kill.js           # Container kill + redeploy
│       ├── repair/
│       │   ├── scaleOut.js       # Spin up replica container
│       │   ├── restart.js        # Restart container
│       │   ├── rollback.js       # Roll back to last good image
│       │   └── rateLimiter.js    # Enable rate limiting
│       ├── observer/
│       │   ├── metricsPoller.js  # Polls Prometheus every 5s
│       │   └── thresholdDetector.js  # Detects violations
│       ├── lib/
│       │   ├── dockerClient.js   # Dockerode wrapper
│       │   └── loadGenRunner.js  # k6 child_process runner
│       └── db/
│           └── migrate.js        # DB migrations
├── load-gen/
│   └── scripts/
│       ├── rampUp.js             # Gradual ramp load profile
│       └── spike.js              # Sudden spike load profile
├── targets/
│   ├── payment-api/              # Fragile Node.js test target
│   └── auth-service/             # Fragile Python Flask test target
├── dashboard/                    # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Targets.tsx
│       │   ├── NewRun.tsx
│       │   ├── RunDetail.tsx     # Live log + metrics view
│       │   └── RepairLog.tsx
│       └── components/
├── infra/
│   ├── prometheus.yml
│   └── toxiproxy-config.json
├── docker-compose.yml
└── .env.example
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| k6 | Latest | `brew install k6` |
| Git | Any | `brew install git` |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/hustlr2004/chaos-engg-platform.git
cd chaos-engg-platform

# 2. Set up environment
cp .env.example .env

# 3. Install dependencies
cd api && npm install && cd ..
cd dashboard && npm install && cd ..

# 4. Start all infrastructure
docker compose up -d

# 5. Run database migrations
cd api && npm run migrate && cd ..

# 6. Start the API
cd api && npm run dev

# 7. Start the dashboard (new terminal)
cd dashboard && npm run dev
```

Open **http://localhost:3000** — you're live.

---

## Running the Platform

### Start infrastructure

```bash
docker compose up -d
```

Verify all services are up:

```bash
docker compose ps
```

### Build and start target apps

```bash
# Payment API
cd targets/payment-api
docker build -t payment-api .
docker run -d --name payment-api \
  --network chaos-platform_chaos-net \
  -p 5001:5001 payment-api

# Auth Service
cd ../auth-service
docker build -t auth-service .
docker run -d --name auth-service \
  --network chaos-platform_chaos-net \
  -p 5002:5002 auth-service
```

Verify health:

```bash
curl http://localhost:5001/health
curl http://localhost:5002/health
```

### Register a target

```bash
curl -X POST http://localhost:4000/api/targets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Payment API",
    "url": "http://payment-api:5001",
    "stack": "Node.js",
    "imageName": "payment-api",
    "lastHealthyTag": "latest"
  }'
```

### Start a chaos run

```bash
curl -X POST http://localhost:4000/api/runs/start \
  -H "Content-Type: application/json" \
  -d '{
    "targetId": 1,
    "experimentConfig": {
      "faults": ["cpu", "latency"],
      "loadProfile": {
        "startRps": 10,
        "peakRps": 200,
        "rampSeconds": 60
      }
    }
  }'
```

Watch it live at **http://localhost:3000/runs/1**

---

## Fault Types

| Fault | Method | What it simulates |
|---|---|---|
| `cpu` | `stress-ng --cpu` inside container | CPU-bound processing overload |
| `memory` | `stress-ng --vm` inside container | Memory leak / OOM condition |
| `latency` | Toxiproxy latency toxic | Slow downstream dependency |
| `packet_loss` | Toxiproxy bandwidth toxic | Unreliable network |
| `disk_io` | `stress-ng --hdd` inside container | Slow disk / log flooding |
| `kill` | `docker kill SIGKILL` | Sudden container crash |

---

## Auto-Repair Logic

The repair worker polls Prometheus every 5 seconds and applies fixes automatically:

| Detected violation | Threshold | Repair action |
|---|---|---|
| High CPU | > 85% sustained 30s | Scale out — spin up replica container |
| High memory | > 80% of limit | Restart container |
| Container down | Missing 3 consecutive polls | Kill + redeploy from last good image |
| High error rate | > 5% of requests failing | Rollback to last healthy image tag |
| High latency | p95 > 1000ms | Enable rate limiting, shed excess load |

Every repair is logged to the `repair_logs` table and streamed live to the dashboard.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/targets` | List all registered targets |
| `POST` | `/api/targets` | Register a new target app |
| `GET` | `/api/experiments` | List experiment configs |
| `POST` | `/api/experiments` | Create experiment config |
| `POST` | `/api/runs/start` | Start a chaos run |
| `GET` | `/api/runs/:id` | Get run status and logs |
| `POST` | `/api/runs/:id/abort` | Abort a running experiment |
| `GET` | `/api/runs` | List last 50 runs |
| `GET` | `/api/repair-logs` | List all repair actions |
| `GET` | `/metrics` | Prometheus metrics endpoint |

---

## Monitoring & Observability

| Service | URL | Credentials |
|---|---|---|
| Dashboard | http://localhost:3000 | — |
| Chaos API | http://localhost:4000 | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / admin |
| cAdvisor | http://localhost:8080 | — |

In Grafana, add Prometheus as a data source (`http://prometheus:9090`) and import the cAdvisor dashboard (ID: `14282`) for instant container metrics.

---

## Load Testing

k6 load profiles are in `load-gen/scripts/`:

```bash
# Run ramp-up profile manually against payment-api
TARGET_URL=http://localhost:5001 k6 run load-gen/scripts/rampUp.js

# Run spike profile
TARGET_URL=http://localhost:5001 k6 run load-gen/scripts/spike.js
```

Load profile stages (rampUp):

```
0 VUs → 10 VUs  (30s ramp)
10 VUs hold     (60s)
10 → 50 VUs     (30s ramp)
50 VUs hold     (60s)
50 → 200 VUs    (30s ramp)
200 VUs hold    (60s)
200 → 0 VUs     (30s ramp down)
```

Pass thresholds: `http_req_failed < 5%` and `p(95) < 1000ms`

---

## Useful Commands

```bash
# Start everything
docker compose up -d

# Stop everything
docker compose down

# Wipe all data and start fresh
docker compose down -v

# Watch all logs
docker compose logs -f

# Watch just the API
docker compose logs -f chaos-api

# Shell into a target container
docker exec -it payment-api sh

# Check container resource usage
docker stats
```

---

## Contributing

1. Fork the repo
2. Create a feature branch — `git checkout -b feature/your-feature`
3. Commit your changes — `git commit -m "feat: add your feature"`
4. Push to the branch — `git push origin feature/your-feature`
5. Open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">Built as a DevOps / SRE engineering project — chaos by design.</p>
