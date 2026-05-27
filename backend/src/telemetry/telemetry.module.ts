import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryGateway } from './telemetry.gateway';
import { TelemetryElasticSearchRepository } from './telemetry.elasticsearch.repository';
import { ELASTICSEARCH_REPOSITORY_TOKENS } from '../elasticsearch/tokens/repository-tokens';

@Module({
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    TelemetryGateway,
    // Register ES repository following the provider pattern from elasticsearch/README.md
    TelemetryElasticSearchRepository,
    {
      provide: ELASTICSEARCH_REPOSITORY_TOKENS.LOG_REPOSITORY,
      useExisting: TelemetryElasticSearchRepository,
    },
  ],
  exports: [TelemetryService, TelemetryGateway],
})
export class TelemetryModule {}
