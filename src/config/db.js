const dns = require('dns');
const mongoose = require('mongoose');

function ensureDnsCanResolveSrv() {
  const servers = dns.getServers();
  const onlyLoopback = servers.length > 0 && servers.every((server) => {
    return server === '127.0.0.1' || server === '::1';
  });
  // This machine's Node process is pointed at a loopback resolver that
  // refuses SRV queries, so mongodb+srv cannot be looked up. Public resolvers
  // can. Leave a working system resolver alone.
  if (onlyLoopback) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  ensureDnsCanResolveSrv();

  // One client for the life of this process. Pool size stays at the driver
  // default: a single local interview server does not need a custom pool.
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = connectDB;
