import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
});
export class RedisIoAdapter extends IoAdapter {
    public adapterConstructor: ReturnType<typeof createAdapter>;

    async connectToRedis(): Promise<void> {
        const pubClient = redis;

        const subClient = pubClient.duplicate();

        this.adapterConstructor = createAdapter(pubClient, subClient);
    }

    createIOServer(port: number, options?: ServerOptions): any {
        const server = super.createIOServer(port, options);
        server.setMaxListeners(Infinity);
        server.adapter(this.adapterConstructor);
        return server;
    }
}
