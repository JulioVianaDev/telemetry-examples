export interface TelemetryEvent {
  id?: string;
  type: 'redis_operation' | 'elasticsearch_operation' | 'websocket_event' | 'cache_hit' | 'cache_miss';
  operation: string;
  service: string;
  duration_ms?: number;
  status: 'success' | 'error';
  metadata?: Record<string, unknown>;
  tenant_id?: string;
  user_id?: string;
  timestamp: string;
}

export interface TelemetryStats {
  total_events: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  avg_duration_ms: number;
  cache_hit_rate: number;
}
