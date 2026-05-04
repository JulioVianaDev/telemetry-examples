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

> **Available labels:** In this setup, Loki receives `job` and `level` as indexed labels (configured in the OTEL Collector's Loki exporter). Use `job` to select logs, not `service_name`.

### Basic queries

```logql
# All logs (show everything)
{job=~".+"}

# All logs from the backend
{job="backend-nestjs"}

# Filter logs containing a keyword
{job="backend-nestjs"} |= "error"

# Exclude a keyword
{job="backend-nestjs"} != "health"

# Case-insensitive regex match
{job="backend-nestjs"} |~ "(?i)timeout|reset"

# Filter by level label
{job="backend-nestjs", level="error"}
```

### Parsing and filtering fields

```logql
# Parse JSON logs and filter by a field
{job="backend-nestjs"} | json | level="error"

# Parse and keep only specific fields
{job="backend-nestjs"} | json | line_format "{{.message}}"

# Filter by HTTP status code (if present in log)
{job="backend-nestjs"} | json | status >= 400
```

### Aggregations (metric queries from logs)

```logql
# Log volume over time (useful for "Logs" panel in dashboards)
rate({job="backend-nestjs"}[5m])

# Count errors per minute
rate({job="backend-nestjs"} |= "error"[1m])

# Top log producers by level
sum by (level) (rate({job="backend-nestjs"}[5m]))
```

### Dashboard panel tips

| Panel type   | Use case                        | Query example                                                    |
|--------------|---------------------------------|------------------------------------------------------------------|
| Logs         | Raw log lines                   | `{job="backend-nestjs"}`                                         |
| Time series  | Log volume / error rate         | `rate({job="backend-nestjs"} \|= "error"[5m])`                  |
| Stat         | Total errors in last hour       | `count_over_time({job="backend-nestjs"} \|= "error"[1h])`       |
| Bar gauge    | Errors by level                 | `sum by (level) (count_over_time({job="backend-nestjs", level="error"}[1h]))` |

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

## 5. Where to find all data at a glance

Grafana **Explore** does not show data automatically — you must run a query. Here are the quickest queries to see everything:

| Datasource   | Quick query to see all data                     |
|--------------|-------------------------------------------------|
| **Loki**     | `{job=~".+"}` (all logs)                        |
| **Prometheus** | Click **Metrics browser** or run `{__name__=~".+"}` |
| **Tempo**    | Go to **Search** tab, leave filters empty, click **Run query** |

> **Tip:** To browse available labels in Loki, click the **Label browser** button in Explore. You'll see `job` and `level` as available labels.

---

## 6. Correlating signals (jumping between logs, traces, metrics)

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

## 7. Building a dashboard (step by step)

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

## 8. Variables (dynamic dropdowns)

Add variables to make dashboards interactive:

1. Dashboard settings (gear icon) -> **Variables** -> **New variable**
2. Example: create a `job` variable for Loki
   - **Type**: Query
   - **Datasource**: Loki
   - **Query**: `label_values(job)`
3. Use `$job` in your Loki queries:
   ```logql
   {job="$job"}
   ```
4. Example: create a `service` variable for Prometheus
   - **Type**: Query
   - **Datasource**: Prometheus
   - **Query**: `label_values(http_server_request_duration_seconds_count, service_name)`
5. Use `$service` in your Prometheus queries:
   ```promql
   rate(http_server_request_duration_seconds_count{service_name="$service"}[5m])
   ```

---

## 9. Useful keyboard shortcuts in Grafana

| Shortcut    | Action                |
|-------------|-----------------------|
| `d`         | Open dashboard search |
| `e`         | Toggle edit mode      |
| `t`         | Change time range     |
| `r`         | Refresh dashboard     |
| `Ctrl+S`    | Save dashboard        |
| `Escape`    | Exit panel edit       |
