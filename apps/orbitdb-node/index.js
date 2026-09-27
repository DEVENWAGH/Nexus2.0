import { createLibp2p } from 'libp2p';
import { createHelia } from 'helia';
import { createOrbitDB } from '@orbitdb/core';
import { FsBlockstore } from 'blockstore-fs';

import { tcp } from '@libp2p/tcp';
import { identify } from '@libp2p/identify';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';

const RELATIONS = {
  profile: {
    channels: { model: 'channel', field: 'profileId', type: 'many' },
    members: { model: 'member', field: 'profileId', type: 'many' },
    servers: { model: 'server', field: 'profileId', type: 'many' }
  },
  server: {
    profile: { model: 'profile', field: 'profileId', type: 'one', refField: 'id' },
    channels: { model: 'channel', field: 'serverId', type: 'many' },
    members: { model: 'member', field: 'serverId', type: 'many' }
  },
  member: {
    profile: { model: 'profile', field: 'profileId', type: 'one', refField: 'id' },
    server: { model: 'server', field: 'serverId', type: 'one', refField: 'id' },
    messages: { model: 'message', field: 'memberId', type: 'many' },
    directMessages: { model: 'directMessage', field: 'memberId', type: 'many' }
  },
  channel: {
    profile: { model: 'profile', field: 'profileId', type: 'one', refField: 'id' },
    server: { model: 'server', field: 'serverId', type: 'one', refField: 'id' },
    messages: { model: 'message', field: 'channelId', type: 'many' }
  },
  message: {
    channel: { model: 'channel', field: 'channelId', type: 'one', refField: 'id' },
    member: { model: 'member', field: 'memberId', type: 'one', refField: 'id' }
  },
  conversation: {
    memberOne: { model: 'member', field: 'memberOneId', type: 'one', refField: 'id' },
    memberTwo: { model: 'member', field: 'memberTwoId', type: 'one', refField: 'id' },
    directMessages: { model: 'directMessage', field: 'conversationId', type: 'many' }
  },
  directMessage: {
    conversation: { model: 'conversation', field: 'conversationId', type: 'one', refField: 'id' },
    member: { model: 'member', field: 'memberId', type: 'one', refField: 'id' }
  }
};

function isRelationFilter(val) {
  return (
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    ('some' in val || 'every' in val || 'none' in val || 'is' in val || 'isNot' in val)
  );
}

function matchesScalar(doc, where) {
  if (!where) return true;
  for (const key of Object.keys(where)) {
    if (key === 'AND') {
      if (!Array.isArray(where.AND)) continue;
      if (!where.AND.every(cond => matchesScalar(doc, cond))) return false;
    } else if (key === 'OR') {
      if (!Array.isArray(where.OR)) continue;
      if (!where.OR.some(cond => matchesScalar(doc, cond))) return false;
    } else if (key === 'NOT') {
      if (matchesScalar(doc, where.NOT)) return false;
    } else {
      const val = where[key];
      // Relation filters are handled asynchronously elsewhere
      if (isRelationFilter(val)) continue;

      const docVal = doc ? doc[key] : undefined;

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if ('equals' in val && docVal !== val.equals) return false;
        if ('in' in val && Array.isArray(val.in) && !val.in.includes(docVal)) return false;
        if ('not' in val && docVal === val.not) return false;

        if ('lte' in val) {
          const limit = val.lte instanceof Date ? val.lte.toISOString() : val.lte;
          if (!docVal || docVal > limit) return false;
        }
        if ('lt' in val) {
          const limit = val.lt instanceof Date ? val.lt.toISOString() : val.lt;
          if (!docVal || docVal >= limit) return false;
        }
        if ('gte' in val) {
          const limit = val.gte instanceof Date ? val.gte.toISOString() : val.gte;
          if (!docVal || docVal < limit) return false;
        }
        if ('gt' in val) {
          const limit = val.gt instanceof Date ? val.gt.toISOString() : val.gt;
          if (!docVal || docVal <= limit) return false;
        }
      } else {
        if (docVal !== val) return false;
      }
    }
  }
  return true;
}

async function getRelatedDocs(doc, rel, allDbs) {
  const relatedDb = allDbs[rel.model];
  if (!relatedDb) return [];
  const relatedDocs = (await relatedDb.all()).map(entryValue).filter(Boolean);
  if (rel.type === 'many') {
    return relatedDocs.filter(d => d[rel.field] === doc.id);
  }
  const refVal = doc[rel.field];
  const match = relatedDocs.find(d => d[rel.refField || 'id'] === refVal);
  return match ? [match] : [];
}

async function matchesAsync(doc, where, modelName, allDbs) {
  if (!where) return true;
  if (!matchesScalar(doc, where)) return false;

  const relMap = RELATIONS[modelName] || {};

  for (const key of Object.keys(where)) {
    if (key === 'AND') {
      if (!Array.isArray(where.AND)) continue;
      for (const cond of where.AND) {
        if (!(await matchesAsync(doc, cond, modelName, allDbs))) return false;
      }
      continue;
    }
    if (key === 'OR') {
      if (!Array.isArray(where.OR)) continue;
      let any = false;
      for (const cond of where.OR) {
        if (await matchesAsync(doc, cond, modelName, allDbs)) {
          any = true;
          break;
        }
      }
      if (!any) return false;
      continue;
    }
    if (key === 'NOT') {
      if (await matchesAsync(doc, where.NOT, modelName, allDbs)) return false;
      continue;
    }

    const val = where[key];
    const rel = relMap[key];
    if (!rel || !isRelationFilter(val)) continue;

    const related = await getRelatedDocs(doc, rel, allDbs);

    if ('some' in val) {
      let ok = false;
      for (const d of related) {
        if (await matchesAsync(d, val.some, rel.model, allDbs)) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    if ('every' in val) {
      if (related.length === 0) return false;
      for (const d of related) {
        if (!(await matchesAsync(d, val.every, rel.model, allDbs))) return false;
      }
    }
    if ('none' in val) {
      for (const d of related) {
        if (await matchesAsync(d, val.none, rel.model, allDbs)) return false;
      }
    }
    if ('is' in val) {
      if (val.is === null) {
        if (related.length > 0) return false;
      } else if (!(await matchesAsync(related[0], val.is, rel.model, allDbs))) {
        return false;
      }
    }
    if ('isNot' in val) {
      if (val.isNot === null) {
        if (related.length === 0) return false;
      } else if (related[0] && (await matchesAsync(related[0], val.isNot, rel.model, allDbs))) {
        return false;
      }
    }
  }

  return true;
}

// Back-compat alias used by nested scalar checks
function matches(doc, where) {
  return matchesScalar(doc, where);
}

async function resolveIncludes(modelName, doc, include, allDbs) {
  if (!doc || !include) return doc;
  
  const relMap = RELATIONS[modelName];
  if (!relMap) return doc;

  const result = { ...doc };

  for (const key of Object.keys(include)) {
    if (!include[key]) continue;
    const rel = relMap[key];
    if (!rel) continue;

    const db = allDbs[rel.model];
    if (!db) continue;

    const allEntries = await db.all();
    const relatedDocs = allEntries.map(entryValue).filter(Boolean);

    if (rel.type === 'one') {
      const refVal = doc[rel.field];
      const match = relatedDocs.find(d => d[rel.refField || 'id'] === refVal);
      result[key] = match ? await resolveIncludes(rel.model, match, include[key].include || include[key], allDbs) : null;
    } else if (rel.type === 'many') {
      const matches = relatedDocs.filter(d => d[rel.field] === doc.id);
      result[key] = await Promise.all(matches.map(d => resolveIncludes(rel.model, d, include[key].include || include[key], allDbs)));
    }
  }

  return result;
}

/** OrbitDB documents `all()` returns `{ hash, key, value }` objects (not tuples). */
function entryValue(entry) {
  if (!entry) return null;
  if (typeof entry === 'object' && 'value' in entry) return entry.value;
  // Legacy tuple shape [hash, key, value]
  if (Array.isArray(entry)) return entry[2] ?? null;
  return entry;
}

async function findDoc(db, where, modelName, allDbs) {
  const all = await db.all();
  const docs = all.map(entryValue).filter(Boolean);
  for (const doc of docs) {
    if (await matchesAsync(doc, where, modelName, allDbs)) return doc;
  }
  return null;
}

async function findDocs(db, where, modelName, allDbs) {
  const all = await db.all();
  const docs = all.map(entryValue).filter(Boolean);
  const results = [];
  for (const doc of docs) {
    if (await matchesAsync(doc, where, modelName, allDbs)) results.push(doc);
  }
  return results;
}

async function createNestedRelations(model, parentId, data, allDbs) {
  const relMap = RELATIONS[model] || {};
  for (const key of Object.keys(data || {})) {
    const val = data[key];
    const rel = relMap[key];
    if (!rel || !val || typeof val !== 'object') continue;

    if (val.create) {
      const creates = Array.isArray(val.create) ? val.create : [val.create];
      const relatedDb = allDbs[rel.model];
      if (!relatedDb) continue;
      for (const item of creates) {
        const nestedData = { ...item };
        if (rel.type === 'many') {
          nestedData[rel.field] = parentId;
        }
        await executeQuery(rel.model, relatedDb, 'create', { data: nestedData }, allDbs);
      }
    }
  }
}

function sortDocs(docs, orderBy) {
  if (!orderBy) return docs;
  const sorted = [...docs];
  const orderArray = Array.isArray(orderBy) ? orderBy : [orderBy];

  sorted.sort((a, b) => {
    for (const order of orderArray) {
      for (const field of Object.keys(order)) {
        const dir = order[field] === 'desc' ? -1 : 1;
        const valA = a[field];
        const valB = b[field];
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
      }
    }
    return 0;
  });
  return sorted;
}

function paginateDocs(docs, skip, take) {
  let result = docs;
  if (typeof skip === 'number') {
    result = result.slice(skip);
  }
  if (typeof take === 'number') {
    result = result.slice(0, take);
  }
  return result;
}

async function executeQuery(model, db, action, args = {}, allDbs) {
  console.log(`[QUERY] ${model}.${action}`, JSON.stringify(args));
  const { where, data, include, orderBy, take, skip, create, update } = args;

  switch (action) {
    case 'findUnique':
    case 'findFirst': {
      const doc = await findDoc(db, where, model, allDbs);
      if (!doc) return null;
      return await resolveIncludes(model, doc, include, allDbs);
    }

    case 'findMany': {
      let docs = await findDocs(db, where, model, allDbs);
      docs = sortDocs(docs, orderBy);
      docs = paginateDocs(docs, skip, take);
      return await Promise.all(docs.map(doc => resolveIncludes(model, doc, include, allDbs)));
    }

    case 'create': {
      const createData = data || {};
      const id = createData.id || crypto.randomUUID();
      const parsedData = {};
      const nestedCreates = {};
      for (const key of Object.keys(createData)) {
        const val = createData[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          if (val.connect) {
            const foreignKeyField = `${key}Id`;
            parsedData[foreignKeyField] = val.connect.id || val.connect.userId || val.connect.inviteCode || val.connect.email;
          } else if (val.create) {
            nestedCreates[key] = val;
          } else {
            parsedData[key] = val;
          }
        } else {
          parsedData[key] = val;
        }
      }

      const doc = { 
        ...parsedData, 
        id, 
        _id: id,
        createdAt: parsedData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await db.put(doc);
      await createNestedRelations(model, id, nestedCreates, allDbs);
      return await resolveIncludes(model, doc, include, allDbs);
    }

    case 'update': {
      const doc = await findDoc(db, where, model, allDbs);
      if (!doc) {
        throw new Error(`Record to update not found: ${JSON.stringify(where)}`);
      }

      const updateData = data || {};
      const updatedData = { ...doc };
      const nestedCreates = {};
      for (const key of Object.keys(updateData)) {
        const val = updateData[key];
        if (val === undefined) continue;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          if (val.connect) {
            const foreignKeyField = `${key}Id`;
            updatedData[foreignKeyField] = val.connect.id || val.connect.userId;
          } else if (val.create) {
            nestedCreates[key] = val;
          } else if (val.set) {
            updatedData[key] = val.set;
          } else if (val.increment) {
            updatedData[key] = (updatedData[key] || 0) + val.increment;
          } else if (val.decrement) {
            updatedData[key] = (updatedData[key] || 0) - val.decrement;
          } else if (!isRelationFilter(val) && !RELATIONS[model]?.[key]) {
            updatedData[key] = val;
          }
        } else {
          updatedData[key] = val;
        }
      }
      updatedData.updatedAt = new Date().toISOString();

      await db.put(updatedData);
      await createNestedRelations(model, updatedData.id, nestedCreates, allDbs);
      return await resolveIncludes(model, updatedData, include, allDbs);
    }

    case 'delete': {
      const doc = await findDoc(db, where, model, allDbs);
      if (!doc) {
        throw new Error(`Record to delete not found: ${JSON.stringify(where)}`);
      }
      await db.del(doc.id);
      return doc;
    }

    case 'deleteMany': {
      const docs = await findDocs(db, where, model, allDbs);
      for (const doc of docs) {
        await db.del(doc.id);
      }
      return { count: docs.length };
    }

    case 'updateMany': {
      const docs = await findDocs(db, where, model, allDbs);
      let count = 0;
      for (const doc of docs) {
        const updatedData = { ...doc, ...data, updatedAt: new Date().toISOString() };
        await db.put(updatedData);
        count++;
      }
      return { count };
    }

    case 'count': {
      const docs = await findDocs(db, where, model, allDbs);
      return docs.length;
    }

    case 'upsert': {
      // Prisma shape: { where, create, update } (create/update are top-level, not under data)
      const existing = await findDoc(db, where, model, allDbs);
      if (existing) {
        return await executeQuery(model, db, 'update', {
          where,
          data: update ?? data?.update ?? data ?? {},
          include,
        }, allDbs);
      }
      return await executeQuery(model, db, 'create', {
        data: { ...(create ?? data?.create ?? data ?? {}), ...(where || {}) },
        include,
      }, allDbs);
    }

    default:
      throw new Error(`Unsupported query action: ${action}`);
  }
}

async function start() {
  const port = process.env.PORT || 3005;

  // Check if an existing OrbitDB instance is already running (e.g. via Docker)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      console.log(`[OrbitDB] Existing OrbitDB service detected on http://127.0.0.1:${port} (e.g. Docker container).`);
      console.log('[OrbitDB] Reusing running instance. Dev worker ready.');
      setInterval(() => {}, 60000);
      return;
    }
  } catch {
    // Port not in use, proceed with starting native instance
  }

  console.log('Initializing libp2p...');
  const libp2p = await createLibp2p({
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/4001',
      ]
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true })
    }
  });

  console.log('Initializing Helia (IPFS) with filesystem persistence...');
  fs.mkdirSync('./data/blocks', { recursive: true });
  fs.mkdirSync('./data/orbitdb', { recursive: true });

  const blockstore = new FsBlockstore('./data/blocks');

  const helia = await createHelia({
    libp2p,
    blockstore,
  });

  console.log('Initializing OrbitDB...');
  const orbitdb = await createOrbitDB({
    ipfs: helia,
    id: 'nexus-orbitdb-node',
    directory: './data/orbitdb',
  });

  console.log('Opening OrbitDB databases...');
  const allDbs = {};
  const models = ['profile', 'server', 'member', 'channel', 'message', 'conversation', 'directMessage', 'blockchainBlock', 'blockchainTransaction'];

  for (const model of models) {
    allDbs[model] = await orbitdb.open(model, { type: 'documents' });
    console.log(`Database for model "${model}" opened at:`, allDbs[model].address);
  }

  console.log('OrbitDB Node initialized successfully!');
  console.log('Peer ID:', libp2p.peerId.toString());

  // Listen on port 3005 for health checks / status and query requests
  const port = process.env.PORT || 3005;
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        peerId: libp2p.peerId.toString(),
        peersCount: libp2p.getPeers().length,
        addresses: libp2p.getMultiaddrs().map(ma => ma.toString())
      }));
      return;
    }

    if (req.url === '/query' && req.method === 'POST') {
      try {
        let bodyStr = '';
        for await (const chunk of req) {
          bodyStr += chunk;
        }
        const { model, action, args = {} } = JSON.parse(bodyStr);

        const db = allDbs[model];
        if (!db) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown model: ${model}. Available models: ${Object.keys(allDbs).join(', ')}` }));
          return;
        }

        const result = await executeQuery(model, db, action, args, allDbs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: result }));
      } catch (err) {
        console.error('[query_error]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`HTTP Status & Query server running on http://0.0.0.0:${port}`);
  });

  const stop = async () => {
    console.log('Shutting down OrbitDB Node...');
    server.close();
    for (const model of models) {
      if (allDbs[model]) {
        await allDbs[model].close();
      }
    }
    await orbitdb.stop();
    await helia.stop();
    await libp2p.stop();
    console.log('Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

start().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
