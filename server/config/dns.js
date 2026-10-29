// Digi Nepal — DNS bootstrap for MongoDB Atlas SRV lookups.
//
// Rule: keep dns.setServers(['8.8.8.8','1.1.1.1']) at the top of
// server/server.js and server/config/db.js so Atlas SRV resolution works
// across all ISPs. Some ISPs block UDP port 53, so Node's default system
// resolver refuses the SRV query for the Atlas cluster and connections fail
// with "querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net".
//
// This module must be the FIRST thing a process requires so the resolver
// switch happens before any DNS query is queued. On Vercel and in the test
// sandbox the default resolver already works, so the switch is skipped there.
module.exports = function dnsBootstrap() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'test') return;
  try {
    const dns = require('node:dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {
    void e;
  }
};
