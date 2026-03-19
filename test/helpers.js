const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../server');
const db = require('../lib/database');

const DEFAULT_ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@utrgv.edu';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

async function getAdminAgent() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });
  return agent;
}

async function createUser(agent, data) {
  const res = await agent.post('/api/admin/users').send(data);
  return res.body;
}

async function createTV(agent, data) {
  const res = await agent.post('/api/tvs').send(data);
  return res.body;
}

async function createMediaAsset(agent) {
  const res = await agent.post('/api/media/youtube').send({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Test Video',
  });
  return res.body;
}

function cleanDB() {
  db.prepare('DELETE FROM audit_logs').run();
  db.prepare('DELETE FROM tv_playlist_items').run();
  db.prepare('DELETE FROM tv_user_access').run();
  db.prepare('DELETE FROM media_assets').run();
  db.prepare('DELETE FROM tvs').run();
  db.prepare('DELETE FROM users').run();
  // Re-seed admin
  const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
  db.prepare('INSERT INTO users (username, email, passwordHash, role) VALUES (?, ?, ?, ?)')
    .run(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL, hash, 'admin');
}

module.exports = { getAdminAgent, createUser, createTV, createMediaAsset, cleanDB };
