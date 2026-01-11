from prometheus_client import Counter, Histogram, Gauge

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "path"],
)
IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "HTTP requests in progress",
)


def get_route_name(scope: dict) -> str:
    route = scope.get("route")
    if route and hasattr(route, "path"):
        return route.path
    return scope.get("path", "unknown")
