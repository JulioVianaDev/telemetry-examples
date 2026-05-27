#!/usr/bin/env node
/**
 * Socket.IO Test - Connects 10 clients to /telemetry namespace
 * Each client subscribes to a room (global or tenant-specific)
 * and logs all telemetry events received in real-time.
 *
 * Usage: node socket-test.js [NUM_CLIENTS] [DURATION_SECONDS]
 *   NUM_CLIENTS     - number of socket clients to connect (default: 10)
 *   DURATION_SECONDS - how long to keep connections alive (default: 60)
 *
 * Run this BEFORE load-test.sh so sockets are connected and receiving broadcasts.
 */

const { io } = require('./backend/node_modules/socket.io-client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3333';
const NUM_CLIENTS = parseInt(process.argv[2] || '10', 10);
const DURATION = parseInt(process.argv[3] || '60', 10);

const TENANTS = ['tenant-acme', 'tenant-globex', 'tenant-initech'];

const clients = [];
const stats = {
  connected: 0,
  disconnected: 0,
  events_received: 0,
  stats_received: 0,
  errors: 0,
};

console.log('=========================================');
console.log(`  Socket.IO Test - ${NUM_CLIENTS} clients`);
console.log(`  Server: ${BASE_URL}/telemetry`);
console.log(`  Duration: ${DURATION}s`);
console.log('=========================================');
console.log('');

for (let i = 0; i < NUM_CLIENTS; i++) {
  const clientId = `client-${i + 1}`;

  // Distribute clients: first one always on "global", rest cycle through tenants
  const room = i === 0 ? 'global' : TENANTS[(i - 1) % TENANTS.length];
  const subscribeTo = room === 'global' ? {} : { tenant_id: room };

  const socket = io(`${BASE_URL}/telemetry`, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    stats.connected++;
    console.log(`  [+] ${clientId} connected (id=${socket.id}) -> subscribing to "${room}"`);

    // Subscribe to telemetry room
    socket.emit('subscribe:telemetry', subscribeTo);
  });

  socket.on('subscribed', (data) => {
    console.log(`  [*] ${clientId} subscribed to room: ${data.room}`);
  });

  socket.on('telemetry:event', (event) => {
    stats.events_received++;
    const ts = new Date().toISOString().slice(11, 23);
    console.log(
      `  [E] ${ts} ${clientId} | type=${event.type} op=${event.operation} ` +
      `svc=${event.service} status=${event.status}` +
      (event.duration_ms ? ` ${event.duration_ms}ms` : '') +
      (event.tenant_id ? ` tenant=${event.tenant_id}` : ''),
    );
  });

  socket.on('telemetry:stats', (data) => {
    stats.stats_received++;
    const ts = new Date().toISOString().slice(11, 23);
    console.log(
      `  [S] ${ts} ${clientId} | stats update (source=${data.source}) ` +
      `total=${data.total_events} hit_rate=${(data.cache_hit_rate * 100).toFixed(1)}%`,
    );
  });

  socket.on('disconnect', (reason) => {
    stats.disconnected++;
    console.log(`  [-] ${clientId} disconnected: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    stats.errors++;
    console.log(`  [!] ${clientId} error: ${err.message}`);
  });

  clients.push({ id: clientId, socket, room });
}

// Print live stats every 10s
const statsInterval = setInterval(() => {
  console.log('');
  console.log(`  --- Live Stats ---`);
  console.log(`  Connected: ${stats.connected} | Disconnected: ${stats.disconnected} | Errors: ${stats.errors}`);
  console.log(`  Events received: ${stats.events_received} | Stats updates: ${stats.stats_received}`);
  console.log('');
}, 10000);

// Graceful shutdown
function shutdown() {
  clearInterval(statsInterval);
  console.log('');
  console.log('=========================================');
  console.log('  Disconnecting all clients...');
  console.log('=========================================');

  for (const { id, socket } of clients) {
    socket.emit('unsubscribe:telemetry', {});
    socket.disconnect();
  }

  console.log('');
  console.log('  Final Stats:');
  console.log(`    Total connected:      ${stats.connected}`);
  console.log(`    Total disconnected:   ${stats.disconnected}`);
  console.log(`    Telemetry events:     ${stats.events_received}`);
  console.log(`    Stats updates:        ${stats.stats_received}`);
  console.log(`    Connection errors:    ${stats.errors}`);
  console.log('');

  process.exit(0);
}

// Auto-shutdown after DURATION seconds
setTimeout(() => {
  console.log(`\n  [timeout] ${DURATION}s elapsed, shutting down...`);
  shutdown();
}, DURATION * 1000);

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('');
console.log(`  Waiting for connections... (Ctrl+C or wait ${DURATION}s to stop)`);
console.log('');
