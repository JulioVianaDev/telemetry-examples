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

---

## 8. RED Dashboard — Rate, Errors, Duration with Trace Drill-Down

This section walks you through building a complete **RED metrics dashboard** that lets you see all endpoints, find the slowest ones, and drill down into their Tempo traces.

### 8.1 Dashboard Variables

Go to **Dashboard Settings (gear icon) > Variables > New variable** and create these variables. They power the dropdown filters at the top of the dashboard.

#### Variable: `route`

| Setting            | Value                                                                  |
|--------------------|------------------------------------------------------------------------|
| **Name**           | `route`                                                                |
| **Type**           | Query                                                                  |
| **Datasource**     | Prometheus                                                             |
| **Query**          | `label_values(http_server_request_duration_seconds_count, http_route)` |
| **Multi-value**    | Enabled                                                                |
| **Include All**    | Enabled                                                                |

#### Variable: `method`

| Setting            | Value                                                                   |
|--------------------|-------------------------------------------------------------------------|
| **Name**           | `method`                                                                |
| **Type**           | Query                                                                   |
| **Datasource**     | Prometheus                                                              |
| **Query**          | `label_values(http_server_request_duration_seconds_count, http_method)` |
| **Include All**    | Enabled                                                                 |

#### Variable: `job` (for Loki)

| Setting            | Value              |
|--------------------|--------------------|
| **Name**           | `job`              |
| **Type**           | Query              |
| **Datasource**     | Loki               |
| **Query**          | `label_values(job)`|
| **Include All**    | Enabled            |

---

### 8.2 Row 1 — Overview: Request Rate + Current RPS

#### Panel A: Request Rate by Endpoint (Time Series)

Shows requests per second for every endpoint, broken down by status code.

- **Datasource:** Prometheus
- **Panel type:** Time Series
- **Legend:** `{{http_method}} {{http_route}} [{{http_status_code}}]`
- **Unit:** `requests/sec (reqps)`

```promql
sum by (http_route, http_method, http_status_code) (
  rate(http_server_request_duration_seconds_count[5m])
)
```

#### Panel B: Current RPS (Stat)

Single number showing total requests per second right now.

- **Datasource:** Prometheus
- **Panel type:** Stat
- **Unit:** `requests/sec (reqps)`

```promql
sum(rate(http_server_request_duration_seconds_count[1m]))
```

---

### 8.3 Row 2 — Latency Table: P50 / P95 / P99 Sorted by Slowest

This is the most important panel. It shows a **table of all endpoints ranked by P99 latency** (slowest first). When you spot a slow endpoint here, select it in the `$route` dropdown to drill down.

- **Datasource:** Prometheus
- **Panel type:** Table
- **Unit:** `seconds (s)`

Add **three queries** (A, B, C) in the same panel:

**Query A — P99 latency:**

```promql
histogram_quantile(0.99,
  sum by (http_route, http_method, le) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)
```

**Query B — P95 latency:**

```promql
histogram_quantile(0.95,
  sum by (http_route, http_method, le) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)
```

**Query C — P50 latency (median):**

```promql
histogram_quantile(0.50,
  sum by (http_route, http_method, le) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)
```

**Transformations** (apply in this order):

1. **Reduce** — Calculations: Last — Mode: Series to rows
2. **Merge** — Combines the three queries into one table
3. **Organize fields** — Rename columns to `Route`, `Method`, `P50`, `P95`, `P99`
4. **Sort by** — Field: `P99`, order: **Descending**

> **Tip:** Set **Query A Legend** to `P99`, **Query B Legend** to `P95`, **Query C Legend** to `P50` so the column names are clear after merge.

---

### 8.4 Row 3 — Selected Endpoint Detail: Latency Over Time + Error Rate

These panels filter by the `$route` and `$method` variables. Select an endpoint from the dropdown (or click a row in the table above) to see its detail.

#### Panel D: P99 Latency for Selected Endpoint (Time Series + Exemplars)

- **Datasource:** Prometheus
- **Panel type:** Time Series
- **Unit:** `seconds (s)`
- **Exemplars:** **Enabled** (in query options, toggle "Exemplars" ON)

```promql
histogram_quantile(0.99,
  sum by (le) (
    rate(http_server_request_duration_seconds_bucket{http_route="$route", http_method="$method"}[5m])
  )
)
```

> **Exemplars are the bridge to Tempo.** Each dot on the graph represents a real request. Click any exemplar dot to jump directly to its full trace in Tempo.

#### Panel E: Error Rate for Selected Endpoint (Stat)

Shows the percentage of 5xx responses for the selected endpoint.

- **Datasource:** Prometheus
- **Panel type:** Stat
- **Unit:** `Percent (0.0-1.0)`
- **Thresholds:** green < 0.01, yellow < 0.05, red >= 0.05

```promql
sum(rate(http_server_request_duration_seconds_count{http_route="$route", http_status_code=~"5.."}[5m]))
/
sum(rate(http_server_request_duration_seconds_count{http_route="$route"}[5m]))
```

---

### 8.5 Row 4 — Status Code Breakdown + Request Count

#### Panel F: Status Code Distribution (Bar Chart)

Shows how many requests returned each status code for the selected endpoint.

- **Datasource:** Prometheus
- **Panel type:** Bar Chart or Pie Chart
- **Legend:** `{{http_status_code}}`

```promql
sum by (http_status_code) (
  increase(http_server_request_duration_seconds_count{http_route=~"$route"}[1h])
)
```

#### Panel G: Total Requests in Time Range (Stat)

- **Datasource:** Prometheus
- **Panel type:** Stat

```promql
sum(increase(http_server_request_duration_seconds_count{http_route=~"$route"}[$__range]))
```

---

### 8.6 Row 5 — Traces for Selected Endpoint (Tempo)

This panel shows the actual traces for the endpoint you selected. Find the slow requests, click a trace ID to open the waterfall.

- **Datasource:** Tempo
- **Panel type:** Table
- **Query type:** TraceQL

```traceql
{resource.service.name = "backend-nestjs" && span.http.route = "$route"}
```

To filter only slow traces:

```traceql
{resource.service.name = "backend-nestjs" && span.http.route = "$route" && duration > 100ms}
```

To filter traces with errors:

```traceql
{resource.service.name = "backend-nestjs" && span.http.route = "$route" && status = error}
```

> **Tip:** Click any **Trace ID** in the table to open the full waterfall view, where you can see every span (HTTP handler, database queries, RabbitMQ publish, etc.).

---

### 8.7 Row 6 — Logs for Selected Endpoint (Loki)

Shows logs correlated with the selected endpoint. If a log contains a `traceId`, click the Tempo link to jump to the trace.

- **Datasource:** Loki
- **Panel type:** Logs

```logql
{job="$job"} | json | http_route="$route"
```

Or show all logs and rely on the trace ID link:

```logql
{job="backend-nestjs"}
```

---

### 8.8 Final Dashboard Layout

```
+---------------------------------------------------+--------------+
| Panel A: Request Rate by Endpoint (time series)   | Panel B:     |
| All routes, grouped by method + status code       | Current RPS  |
| Datasource: Prometheus                            | (stat)       |
+---------------------------------------------------+--------------+
| Panel C: Latency Table — P50 / P95 / P99                        |
| All endpoints sorted by P99 descending (slowest first)          |
| Datasource: Prometheus                                           |
+--------------------------------------------------+--------------+
| Panel D: P99 Latency for $route (time series)    | Panel E:     |
| With exemplar dots linking to Tempo traces       | Error Rate   |
| Datasource: Prometheus                           | (stat)       |
+--------------------------------------------------+--------------+
| Panel F: Status Code Breakdown    | Panel G: Total Requests     |
| for $route (bar chart)            | for $route (stat)           |
| Datasource: Prometheus            | Datasource: Prometheus      |
+-----------------------------------+-----------------------------+
| Panel H: Traces for $route (table with trace IDs)              |
| Click a Trace ID to open the waterfall view                     |
| Datasource: Tempo (TraceQL)                                     |
+-----------------------------------------------------------------+
| Panel I: Logs (logs panel)                                      |
| Click Tempo link on any log with traceId to jump to trace       |
| Datasource: Loki                                                |
+-----------------------------------------------------------------+
```

---

### 8.9 Navigation Flow — How Everything Connects

The dashboard enables a full observability drill-down loop:

```
1. SPOT the problem
   Latency Table (Panel C) -> see which endpoint has the highest P99

2. SELECT the endpoint
   Set $route dropdown -> all panels below filter to that endpoint

3. SEE the trend
   P99 Time Series (Panel D) -> see if latency is spiking or steady

4. JUMP to the trace
   Click an exemplar dot on Panel D -> opens the trace in Tempo
   OR click a Trace ID in Panel H -> opens the trace waterfall

5. INSPECT the trace
   Trace waterfall -> see every span: HTTP handler, DB queries,
   RabbitMQ publish, consumer processing

6. CHECK the logs
   In the trace view, click "Logs for this span" -> jumps to Loki
   OR in Panel I, click the Tempo link on a log -> jumps to trace
```

| From                  | To              | How                                          |
|-----------------------|-----------------|----------------------------------------------|
| Latency graph         | Trace           | Click an **exemplar dot** on the P99 graph   |
| Trace waterfall       | Logs            | Click **"Logs for this span"** button        |
| Log line              | Trace           | Click the **Tempo link** next to `traceId`   |
| Latency table         | Filtered panels | Select endpoint in **$route** dropdown       |

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
