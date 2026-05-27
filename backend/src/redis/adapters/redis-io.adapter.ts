import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions, Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("redis-io-adapter");

const wsConnectionsGauge = meter.createUpDownCounter(
  "websocket.connections",
  {
    description: "Current number of WebSocket connections via Redis IO adapter",
    unit: "{connections}",
  },
);

const wsConnectionsTotal = meter.createCounter(
  "websocket.connections.total",
  {
    description: "Total WebSocket connections since startup",
    unit: "{connections}",
  },
);

const wsDisconnectsTotal = meter.createCounter(
  "websocket.disconnects.total",
  {
    description: "Total WebSocket disconnections since startup",
    unit: "{disconnections}",
  },
);

const wsRoomsGauge = meter.createObservableGauge(
  "websocket.rooms",
  {
    description: "Current number of Socket.IO rooms",
    unit: "{rooms}",
  },
);

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
});

export class RedisIoAdapter extends IoAdapter {
  public adapterConstructor: ReturnType<typeof createAdapter>;
  private servers: Server[] = [];

  async connectToRedis(): Promise<void> {
    const pubClient = redis;
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server: Server = super.createIOServer(port, options);
    server.setMaxListeners(Infinity);
    server.adapter(this.adapterConstructor);

    this.servers.push(server);

    // Track WebSocket connections
    server.on("connection", (socket) => {
      const namespace = socket.nsp.name;
      wsConnectionsGauge.add(1, { namespace });
      wsConnectionsTotal.add(1, { namespace });

      socket.on("disconnect", (reason) => {
        wsConnectionsGauge.add(-1, { namespace });
        wsDisconnectsTotal.add(1, { namespace, reason });
      });
    });

    // Observable gauge for rooms count
    wsRoomsGauge.addCallback((result) => {
      for (const srv of this.servers) {
        const adapter = srv.of("/").adapter as any;
        if (adapter && adapter.rooms) {
          result.observe(adapter.rooms.size, { namespace: "/" });
        }
      }
    });

    return server;
  }
}
