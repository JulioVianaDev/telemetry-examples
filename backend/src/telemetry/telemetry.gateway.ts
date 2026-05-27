import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { trace, SpanKind } from '@opentelemetry/api';
import { TelemetryEvent } from './telemetry-event.interface';

const TRACER_NAME = 'telemetry-gateway';

@WebSocketGateway({
  namespace: '/telemetry',
  cors: { origin: '*' },
})
export class TelemetryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TelemetryGateway.name);

  handleConnection(client: Socket) {
    const tracer = trace.getTracer(TRACER_NAME);
    tracer.startActiveSpan(
      'websocket.client_connected',
      { kind: SpanKind.SERVER },
      (span) => {
        span.setAttribute('websocket.client_id', client.id);
        span.setAttribute('websocket.namespace', '/telemetry');
        span.setAttribute('websocket.transport', client.conn.transport.name);
        this.logger.log(`Client connected: ${client.id}`);
        span.end();
      },
    );
  }

  handleDisconnect(client: Socket) {
    const tracer = trace.getTracer(TRACER_NAME);
    tracer.startActiveSpan(
      'websocket.client_disconnected',
      { kind: SpanKind.SERVER },
      (span) => {
        span.setAttribute('websocket.client_id', client.id);
        span.setAttribute('websocket.namespace', '/telemetry');
        this.logger.log(`Client disconnected: ${client.id}`);
        span.end();
      },
    );
  }

  @SubscribeMessage('subscribe:telemetry')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenant_id?: string },
  ) {
    const tracer = trace.getTracer(TRACER_NAME);
    tracer.startActiveSpan(
      'websocket.subscribe_telemetry',
      { kind: SpanKind.SERVER },
      (span) => {
        const room = data?.tenant_id ? `tenant:${data.tenant_id}` : 'global';
        client.join(room);
        span.setAttribute('websocket.client_id', client.id);
        span.setAttribute('websocket.room', room);
        this.logger.log(`Client ${client.id} joined room: ${room}`);
        client.emit('subscribed', { room });
        span.end();
      },
    );
  }

  @SubscribeMessage('unsubscribe:telemetry')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenant_id?: string },
  ) {
    const room = data?.tenant_id ? `tenant:${data.tenant_id}` : 'global';
    client.leave(room);
    this.logger.log(`Client ${client.id} left room: ${room}`);
    client.emit('unsubscribed', { room });
  }

  broadcastEvent(event: TelemetryEvent) {
    const tracer = trace.getTracer(TRACER_NAME);
    tracer.startActiveSpan(
      'websocket.broadcast_event',
      { kind: SpanKind.PRODUCER },
      (span) => {
        span.setAttribute('websocket.event_type', event.type);
        span.setAttribute('websocket.operation', event.operation);
        span.setAttribute('websocket.namespace', '/telemetry');

        // Broadcast to global room
        this.server.to('global').emit('telemetry:event', event);

        // Also broadcast to tenant-specific room if applicable
        if (event.tenant_id) {
          const tenantRoom = `tenant:${event.tenant_id}`;
          this.server.to(tenantRoom).emit('telemetry:event', event);
          span.setAttribute('websocket.tenant_room', tenantRoom);
        }

        span.setAttribute('websocket.broadcast', true);
        span.end();
      },
    );
  }

  broadcastStats(stats: Record<string, unknown>) {
    const tracer = trace.getTracer(TRACER_NAME);
    tracer.startActiveSpan(
      'websocket.broadcast_stats',
      { kind: SpanKind.PRODUCER },
      (span) => {
        span.setAttribute('websocket.namespace', '/telemetry');
        this.server.to('global').emit('telemetry:stats', stats);
        span.end();
      },
    );
  }
}
