import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryEvent } from './telemetry-event.interface';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  /**
   * POST /telemetry/events
   * Ingest a telemetry event -> stores in ES, invalidates cache, broadcasts via WebSocket
   */
  @Post('events')
  ingest(@Body() body: Omit<TelemetryEvent, 'timestamp'>) {
    return this.telemetryService.ingest(body);
  }

  /**
   * GET /telemetry/events
   * Search telemetry events (cached in Redis, sourced from ES)
   */
  @Get('events')
  search(
    @Query('type') type?: string,
    @Query('service') service?: string,
    @Query('status') status?: string,
    @Query('tenant_id') tenant_id?: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ) {
    return this.telemetryService.search({
      type,
      service,
      status,
      tenant_id,
      from: from ? parseInt(from, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  /**
   * GET /telemetry/stats
   * Aggregated stats (cached in Redis, computed from ES aggregations)
   * Broadcasts to WebSocket subscribers
   */
  @Get('stats')
  getStats(@Query('tenant_id') tenant_id?: string) {
    return this.telemetryService.getStats(tenant_id);
  }

  /**
   * GET /telemetry/redis/info
   * Redis server info with traced span
   */
  @Get('redis/info')
  getRedisInfo() {
    return this.telemetryService.getRedisInfo();
  }

  /**
   * GET /telemetry/elasticsearch/health
   * Elasticsearch index health with traced span
   */
  @Get('elasticsearch/health')
  getElasticsearchHealth() {
    return this.telemetryService.getElasticsearchHealth();
  }
}
