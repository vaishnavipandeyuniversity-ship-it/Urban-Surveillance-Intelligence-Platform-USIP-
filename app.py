"""
Urban Surveillance Intelligence Platform - Backend Server
National Social Summit'26 | IIT Roorkee Changethon
"""

import os
import json
import time
import random
import threading
import math
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, Response, make_response

app = Flask(__name__)

@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        r = make_response()
        r.headers['Access-Control-Allow-Origin'] = '*'
        r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        r.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
        return r

# ─────────────────────────────────────────────
# Simulated Camera Feed Registry
# ─────────────────────────────────────────────
CAMERAS = {
    "CAM-001": {"name": "Main Gate - North", "zone": "Entry", "lat": 29.8656, "lng": 77.8958, "type": "CCTV", "status": "online"},
    "CAM-002": {"name": "Market Square", "zone": "Commercial", "lat": 29.8643, "lng": 77.8972, "type": "CCTV", "status": "online"},
    "CAM-003": {"name": "Drone Alpha-1", "zone": "Aerial", "lat": 29.8660, "lng": 77.8940, "type": "Drone", "status": "online"},
    "CAM-004": {"name": "Traffic Junction A", "zone": "Traffic", "lat": 29.8630, "lng": 77.8965, "type": "Traffic", "status": "online"},
    "CAM-005": {"name": "Park Entrance", "zone": "Recreational", "lat": 29.8670, "lng": 77.8980, "type": "CCTV", "status": "online"},
    "CAM-006": {"name": "Officer Bodycam-1", "zone": "Mobile", "lat": 29.8648, "lng": 77.8955, "type": "BodyCam", "status": "online"},
    "CAM-007": {"name": "Bus Terminal", "zone": "Transport", "lat": 29.8635, "lng": 77.8942, "type": "CCTV", "status": "degraded"},
    "CAM-008": {"name": "South Corridor", "zone": "Perimeter", "lat": 29.8620, "lng": 77.8968, "type": "CCTV", "status": "online"},
}

# ─────────────────────────────────────────────
# Threat Classifier (Rule-Based AI Simulation)
# ─────────────────────────────────────────────
THREAT_TYPES = [
    {"id": "T01", "label": "Suspicious Loitering", "severity": "medium", "icon": "⚠️"},
    {"id": "T02", "label": "Unattended Object", "severity": "high", "icon": "🚨"},
    {"id": "T03", "label": "Crowd Surge Detected", "severity": "high", "icon": "🚨"},
    {"id": "T04", "label": "Perimeter Breach", "severity": "critical", "icon": "🔴"},
    {"id": "T05", "label": "Vehicle Violation", "severity": "low", "icon": "ℹ️"},
    {"id": "T06", "label": "Altercation Detected", "severity": "critical", "icon": "🔴"},
    {"id": "T07", "label": "Unauthorized Access", "severity": "high", "icon": "🚨"},
    {"id": "T08", "label": "Normal Activity", "severity": "none", "icon": "✅"},
]

SEVERITY_WEIGHTS = {
    "none": 60,
    "low": 20,
    "medium": 10,
    "high": 7,
    "critical": 3
}

def weighted_threat_pick():
    pool = []
    for t in THREAT_TYPES:
        pool.extend([t] * SEVERITY_WEIGHTS[t["severity"]])
    return random.choice(pool)

# ─────────────────────────────────────────────
# In-Memory Event Store
# ─────────────────────────────────────────────
events_store = []
alerts_store = []
stats_store = {
    "total_events": 0,
    "critical_alerts": 0,
    "cameras_online": 7,
    "threats_resolved": 0,
    "avg_response_time": 4.2,
}

def generate_event():
    cam_id = random.choice(list(CAMERAS.keys()))
    cam = CAMERAS[cam_id]
    threat = weighted_threat_pick()
    ts = datetime.now()
    
    event = {
        "id": f"EVT-{int(time.time()*1000) % 999999:06d}",
        "camera_id": cam_id,
        "camera_name": cam["name"],
        "zone": cam["zone"],
        "type": cam["type"],
        "threat_id": threat["id"],
        "threat_label": threat["label"],
        "severity": threat["severity"],
        "confidence": round(random.uniform(0.72, 0.99), 2),
        "timestamp": ts.isoformat(),
        "time_display": ts.strftime("%H:%M:%S"),
        "lat": cam["lat"] + random.uniform(-0.001, 0.001),
        "lng": cam["lng"] + random.uniform(-0.001, 0.001),
        "anonymized": True,
        "resolved": False,
        "thumbnail_color": {
            "none": "#1a2e1a",
            "low": "#1a2510",
            "medium": "#2e2510",
            "high": "#2e1a10",
            "critical": "#2e1010"
        }[threat["severity"]]
    }
    
    events_store.insert(0, event)
    if len(events_store) > 200:
        events_store.pop()
    
    stats_store["total_events"] += 1
    
    if threat["severity"] in ("high", "critical"):
        alert = {
            "id": f"ALT-{int(time.time()*1000) % 999999:06d}",
            "event_id": event["id"],
            "camera_name": cam["name"],
            "zone": cam["zone"],
            "threat_label": threat["label"],
            "severity": threat["severity"],
            "timestamp": ts.isoformat(),
            "time_display": ts.strftime("%H:%M:%S"),
            "acknowledged": False,
        }
        alerts_store.insert(0, alert)
        if len(alerts_store) > 50:
            alerts_store.pop()
        if threat["severity"] == "critical":
            stats_store["critical_alerts"] += 1
    
    return event

def background_event_generator():
    """Continuously generate simulated events"""
    while True:
        generate_event()
        time.sleep(random.uniform(1.5, 4.0))

# Start background generator
gen_thread = threading.Thread(target=background_event_generator, daemon=True)
gen_thread.start()

# ─────────────────────────────────────────────
# Pre-populate some events
# ─────────────────────────────────────────────
for _ in range(30):
    generate_event()
    time.sleep(0.01)

# ─────────────────────────────────────────────
# API Routes
# ─────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})

@app.route("/api/cameras", methods=["GET"])
def get_cameras():
    return jsonify({"cameras": CAMERAS, "count": len(CAMERAS)})

@app.route("/api/events", methods=["GET"])
def get_events():
    limit = int(request.args.get("limit", 50))
    severity = request.args.get("severity", None)
    zone = request.args.get("zone", None)
    
    filtered = events_store.copy()
    if severity and severity != "all":
        filtered = [e for e in filtered if e["severity"] == severity]
    if zone and zone != "all":
        filtered = [e for e in filtered if e["zone"] == zone]
    
    return jsonify({"events": filtered[:limit], "total": len(filtered)})

@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    unread = [a for a in alerts_store if not a["acknowledged"]]
    return jsonify({"alerts": alerts_store[:20], "unread_count": len(unread)})

@app.route("/api/alerts/<alert_id>/acknowledge", methods=["POST"])
def acknowledge_alert(alert_id):
    for a in alerts_store:
        if a["id"] == alert_id:
            a["acknowledged"] = True
            stats_store["threats_resolved"] += 1
            return jsonify({"success": True, "alert": a})
    return jsonify({"success": False, "error": "Alert not found"}), 404

@app.route("/api/events/<event_id>/resolve", methods=["POST"])
def resolve_event(event_id):
    for e in events_store:
        if e["id"] == event_id:
            e["resolved"] = True
            stats_store["threats_resolved"] += 1
            return jsonify({"success": True})
    return jsonify({"success": False}), 404

@app.route("/api/stats", methods=["GET"])
def get_stats():
    severity_counts = {"none": 0, "low": 0, "medium": 0, "high": 0, "critical": 0}
    zone_counts = {}
    hourly = {}
    
    for e in events_store:
        severity_counts[e["severity"]] = severity_counts.get(e["severity"], 0) + 1
        zone_counts[e["zone"]] = zone_counts.get(e["zone"], 0) + 1
        hour = e["timestamp"][:13]
        hourly[hour] = hourly.get(hour, 0) + 1
    
    return jsonify({
        **stats_store,
        "severity_distribution": severity_counts,
        "zone_distribution": zone_counts,
        "cameras_online": sum(1 for c in CAMERAS.values() if c["status"] == "online"),
        "cameras_total": len(CAMERAS),
    })

@app.route("/api/heatmap", methods=["GET"])
def get_heatmap():
    """Return aggregated event locations for heatmap"""
    points = []
    for e in events_store[:100]:
        if e["severity"] in ("high", "critical", "medium"):
            weight = {"medium": 1, "high": 2, "critical": 3}[e["severity"]]
            points.append({"lat": e["lat"], "lng": e["lng"], "weight": weight, "severity": e["severity"]})
    return jsonify({"points": points})

@app.route("/api/video-summary", methods=["POST"])
def video_summary():
    """Simulate AI video summarization"""
    data = request.json or {}
    camera_id = data.get("camera_id", "CAM-001")
    cam = CAMERAS.get(camera_id, {})
    
    # Simulate processing delay
    recent_events = [e for e in events_store if e["camera_id"] == camera_id][:5]
    
    summaries = [
        f"Routine pedestrian movement observed. No anomalies detected in first 10 minutes.",
        f"Crowd density increased at {cam.get('name', 'location')}. Monitoring initiated.",
        f"Vehicle movement patterns normal. Traffic flow nominal.",
        f"Suspicious stationary individual flagged at timestamp 00:14:32. Officers notified.",
        f"Area clear. Perimeter integrity maintained throughout observation window.",
    ]
    
    return jsonify({
        "camera_id": camera_id,
        "camera_name": cam.get("name", "Unknown"),
        "summary": random.choice(summaries),
        "key_events": len(recent_events),
        "risk_score": round(random.uniform(0.1, 0.9), 2),
        "processed_at": datetime.now().isoformat(),
        "anonymization_applied": True,
    })

@app.route("/api/stream/events", methods=["GET"])
def stream_events():
    """Server-Sent Events stream for real-time updates"""
    def event_stream():
        last_count = len(events_store)
        while True:
            current_count = len(events_store)
            if current_count != last_count:
                new_events = events_store[:current_count - last_count]
                for ev in new_events:
                    yield f"data: {json.dumps(ev)}\n\n"
                last_count = current_count
            time.sleep(0.5)
    
    return Response(event_stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

if __name__ == "__main__":
    print("🚀 Urban Surveillance Intelligence Platform")
    print("📡 Backend running on http://localhost:5050")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
