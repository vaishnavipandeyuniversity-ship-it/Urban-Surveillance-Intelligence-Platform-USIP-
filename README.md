# Urban Surveillance Intelligence Platform (USIP)
Problem Statement: Transforming Urban Surveillance into Actionable Intelligence

## What is this?

This is a web-based dashboard that converts raw CCTV/drone/bodycam footage data into real-time actionable alerts for law enforcement. Instead of operators manually watching 50 screens, the system auto-detects threats and shows everything in one place.
Built using Python (backend), JavaScript (frontend), and C (threat scoring engine).


## Tech Stack
- **Python** — Flask REST API, event generation, AI video summarizer
- **JavaScript** — Live dashboard, charts, camera feed simulation
- **C** — Fast threat scoring using Haversine distance + time decay math


## Folder Structure
urban-surveillance/
├── backend/
│   ├── app.py            # main Flask server
│   ├── threat_scorer.c   # C scoring engine
│   └── requirements.txt
└── frontend/
    ├── index.html        # dashboard UI
    └── app.js            # frontend logic

## How to Run

**Step 1 — Compile the C module**
```bash
cd backend
gcc -o threat_scorer threat_scorer.c -lm
./threat_scorer

**Step 2 — Start the backend**
```bash
pip install flask
python app.py
# runs on http://localhost:5050

**Step 3 — Open the frontend**
```bash
cd frontend
python -m http.server 8080
# open http://localhost:8080 in browser

> Note: The frontend also works offline with demo data if the backend isn't running.

## Features

- Live camera feed grid (CCTV, Drone, BodyCam, Traffic)
- Real-time event stream with severity filters
- Auto popup alert for critical threats
- Analytics page with charts and threat scoring output
- Threat heatmap showing dangerous zones
- Privacy controls (face blur, plate masking, auto-purge)
- AI video summary for any selected camera

## Privacy features included
- Face anonymization on all feeds
- No personal data stored in events
- 72 hour auto data purge
- Access control logging
- All events flagged as anonymized: true

## Team-EliteSeven

Built for NSS'26 Changethon, IIT Roorkee (Feb 14-15)


