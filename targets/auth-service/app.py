import threading
import time

from flask import Flask, jsonify, request
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__)
metrics = PrometheusMetrics(app)

db_lock = threading.Lock()
request_leak = []


@app.before_request
def leak_memory():
    request_leak.append(
        {
            "path": request.path,
            "body": request.get_json(silent=True),
            "headers": dict(request.headers),
            "ts": time.time(),
        }
    )


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/login", methods=["POST"])
def login():
    with db_lock:
        time.sleep(0.2)

    username = (request.get_json(silent=True) or {}).get("username", "unknown")
    return jsonify({"authenticated": True, "user": username}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, threaded=True)
