-- Enable pg_stat_statements extension for query performance tracking
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Configure slow query logging and statement statistics
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET pg_stat_statements.max = 10000;

-- Log queries that take longer than 200ms
ALTER SYSTEM SET log_min_duration_statement = 200;
ALTER SYSTEM SET log_statement = 'none';
ALTER SYSTEM SET log_duration = 'off';

-- Log connection activity
ALTER SYSTEM SET log_connections = 'on';
ALTER SYSTEM SET log_disconnections = 'on';

-- Log lock waits
ALTER SYSTEM SET log_lock_waits = 'on';
ALTER SYSTEM SET deadlock_timeout = '1s';
