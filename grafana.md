# Grafana Guide — Logs, Metrics & Traces

Access Grafana at **http://localhost:5555** (anonymous admin, no login required).

---

## 1. Explore (Ad-hoc queries)

The **Explore** page (compass icon in the left sidebar) is where you test queries before building dashboards.

- Select the **datasource** in the top dropdown (Prometheus, Loki, or Tempo)
- Write your query and click **Run query**
- Switch between **Table**, **Graph**, and **Logs** views depending on the datasource

---

## 2. Logs (Loki)

Datasource: **Loki**
Query language: **LogQL**

### Basic queries

```logql
# All logs from the backend
{service_name="backend-nestjs"}

# Filter logs containing a keyword
{service_name="backend-nestjs"} |= "error"

# Exclude a keyword
{service_name="backend-nestjs"} != "health"

# Case-insensitive regex match
{service_name="backend-nestjs"} |~ "(?i)timeout|reset"
```

### Parsing and filtering fields

```logql
# Parse JSON logs and filter by a field
{service_name="backend-nestjs"} | json | level="error"

# Parse and keep only specific fields
{service_name="backend-nestjs"} | json | line_format "{{.message}}"

# Filter by HTTP status code (if present in log)
{service_name="backend-nestjs"} | json | status >= 400
```

### Aggregations (metric queries from logs)

```logql
# Log volume over time (useful for "Logs" panel in dashboards)
rate({service_name="backend-nestjs"}[5m])

# Count errors per minute
rate({service_name="backend-nestjs"} |= "error"[1m])

# Top log producers by level
sum by (level) (rate({service_name="backend-nestjs"} | json[5m]))
```

### Dashboard panel tips

| Panel type   | Use case                        | Query example                                                    |
|--------------|---------------------------------|------------------------------------------------------------------|
| Logs         | Raw log lines                   | `{service_name="backend-nestjs"}`                                |
| Time series  | Log volume / error rate         | `rate({service_name="backend-nestjs"} \|= "error"[5m])`         |
| Stat         | Total errors in last hour       | `count_over_time({service_name="backend-nestjs"} \|= "error"[1h])` |
| Bar gauge    | Errors by level                 | `sum by (level) (count_over_time({service_name="backend-nestjs"} \| json[1h]))` |

---

## 3. Metrics (Prometheus)

Datasource: **Prometheus**
Query language: **PromQL**

### HTTP metrics (from auto-instrumentation)

```promql
# Request rate (requests per second)
rate(http_server_request_duration_seconds_count[5m])

# Request rate by route and method
sum by (http_route, http_method) (rate(http_server_request_duration_seconds_count[5m]))

# Average latency by route
rate(http_server_request_duration_seconds_sum[5m])
  / rate(http_server_request_duration_seconds_count[5m])

# 95th percentile latency
histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))

# Error rate (5xx responses)
sum(rate(http_server_request_duration_seconds_count{http_status_code=~"5.."}[5m]))
```

### System / runtime metrics

```promql
# Active HTTP connections
http_server_active_requests

# Process CPU usage (if available)
process_cpu_seconds_total

# Node.js event loop lag (if available)
nodejs_eventloop_lag_seconds
```

### Dashboard panel tips

| Panel type   | Use case                    | Query example                                                              |
|--------------|-----------------------------|----------------------------------------------------------------------------|
| Time series  | Request rate over time      | `sum(rate(http_server_request_duration_seconds_count[5m]))`                |
| Time series  | Latency percentiles         | `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))` |
| Stat         | Current RPS                 | `sum(rate(http_server_request_duration_seconds_count[1m]))`                |
| Gauge        | Active requests             | `http_server_active_requests`                                              |
| Heatmap      | Latency distribution        | `sum by (le) (rate(http_server_request_duration_seconds_bucket[5m]))`      |
| Table        | Requests breakdown by route | `sum by (http_route, http_method) (increase(http_server_request_duration_seconds_count[1h]))` |

---

## 4. Traces (Tempo)

Datasource: **Tempo**

### Search tab (no query language needed)

1. Select **Tempo** in Explore
2. Go to the **Search** tab
3. Set filters:
   - **Service Name** = `backend-nestjs` or `pg-query`
   - **Span Name** = name of the operation (e.g. `GET /messages`)
   - **Duration** = `> 500ms` (find slow requests)
   - **Status** = `error` (find failed requests)
4. Click **Run query** to see matching traces
5. Click a **Trace ID** to open the waterfall view

### TraceQL tab (advanced queries)

```traceql
# All traces from the backend
{resource.service.name = "backend-nestjs"}

# Traces with errors
{resource.service.name = "backend-nestjs" && status = error}

# Slow spans (> 500ms)
{resource.service.name = "backend-nestjs" && duration > 500ms}

# Find a specific HTTP route
{resource.service.name = "backend-nestjs" && span.http.route = "/messages"}

# Find database queries
{resource.service.name = "pg-query"}

# Slow database queries
{resource.service.name = "pg-query" && duration > 100ms}
```

### Dashboard panel tips

| Panel type     | Use case                  | How to configure                                                  |
|----------------|---------------------------|-------------------------------------------------------------------|
| Traces (table) | Recent traces list        | Tempo datasource, Search or TraceQL query                         |
| Node graph     | Service dependency map    | Tempo datasource, enable "Service graph" in panel options         |

---

## 5. Correlating signals (jumping between logs, traces, metrics)

The datasources are already linked via provisioning. These correlations work automatically:

### Trace -> Logs
- Open a trace in Tempo
- Click the **Logs for this span** button to jump to Loki with the trace ID pre-filtered

### Logs -> Trace
- In Loki, if a log line contains a `traceId` field, a **Tempo** link appears next to the log line
- Click it to open the full trace waterfall

### Metrics -> Trace (exemplars)
- In a Prometheus time series panel, enable **Exemplars** in the panel options
- Exemplar dots appear on the graph — click one to jump to the associated trace in Tempo

---

## 6. Building a dashboard (step by step)

1. Click **+** (top-right) -> **New dashboard**
2. Click **Add visualization**
3. Select the datasource (Prometheus, Loki, or Tempo)
4. Write your query in the query editor
5. Choose the panel type (top-right dropdown: Time series, Stat, Gauge, Logs, etc.)
6. Configure panel options in the right sidebar:
   - **Title**: name the panel
   - **Legend**: choose label format
   - **Thresholds**: add color-coded thresholds (e.g. red above 500ms)
   - **Unit**: set the unit (requests/sec, seconds, bytes, etc.)
7. Click **Apply** to save the panel
8. Drag and resize panels on the dashboard
9. Click the **Save** icon (top-right) to save the dashboard

### Suggested starter dashboard layout

```
+-------------------------------+----------------+
| Request Rate (time series)    | Current RPS    |
| Prometheus                    | (stat panel)   |
+-------------------------------+----------------+
| Latency P95 (time series)     | Error Rate     |
| Prometheus                    | (stat panel)   |
+-------------------------------+----------------+
| Log Volume (time series)      | Errors Count   |
| Loki rate query               | (stat panel)   |
+-------------------------------+----------------+
| Recent Logs (logs panel)                       |
| Loki raw query                                 |
+------------------------------------------------+
| Recent Traces (table)                          |
| Tempo search query                             |
+------------------------------------------------+
```

---

## 7. Variables (dynamic dropdowns)

Add variables to make dashboards interactive:

1. Dashboard settings (gear icon) -> **Variables** -> **New variable**
2. Example: create a `service` variable
   - **Type**: Query
   - **Datasource**: Prometheus
   - **Query**: `label_values(http_server_request_duration_seconds_count, service_name)`
3. Use `$service` in your queries:
   ```promql
   rate(http_server_request_duration_seconds_count{service_name="$service"}[5m])
   ```

---

## 8. Useful keyboard shortcuts in Grafana

| Shortcut    | Action                |
|-------------|-----------------------|
| `d`         | Open dashboard search |
| `e`         | Toggle edit mode      |
| `t`         | Change time range     |
| `r`         | Refresh dashboard     |
| `Ctrl+S`    | Save dashboard        |
| `Escape`    | Exit panel edit       |
