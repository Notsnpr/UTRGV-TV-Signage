const request = require('supertest');
const app = require('../server');
const { cleanDB, getAdminAgent, createUser } = require('./helpers');

let adminAgent;

beforeEach(async () => {
  cleanDB();
  adminAgent = await getAdminAgent();
});

test('Non-admin GET /api/admin/users returns 403', async () => {
  await createUser(adminAgent, {
    username: 'testuser', email: 'test@example.com', password: 'password123', role: 'user',
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });
  const res = await agent.get('/api/admin/users');
  expect(res.status).toBe(403);
});

test('Admin GET /api/admin/users returns 200 array', async () => {
  const res = await adminAgent.get('/api/admin/users');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('Admin POST creates user with 201', async () => {
  const res = await adminAgent.post('/api/admin/users').send({
    username: 'newuser', email: 'newuser@example.com', password: 'password123', role: 'user',
  });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ username: 'newuser', email: 'newuser@example.com', role: 'user' });
});

test('Admin PATCH updates user', async () => {
  const user = await createUser(adminAgent, {
    username: 'patchuser', email: 'patch@example.com', password: 'password123',
  });
  const res = await adminAgent.patch(`/api/admin/users/${user.id}`).send({ username: 'patcheduser' });
  expect(res.status).toBe(200);
  expect(res.body.username).toBe('patcheduser');
});

test('Admin DELETE own account returns 400', async () => {
  const me = await adminAgent.get('/api/auth/me');
  const res = await adminAgent.delete(`/api/admin/users/${me.body.id}`);
  expect(res.status).toBe(400);
});

test('Admin DELETE another user returns 204', async () => {
  const user = await createUser(adminAgent, {
    username: 'deleteuser', email: 'delete@example.com', password: 'password123',
  });
  const res = await adminAgent.delete(`/api/admin/users/${user.id}`);
  expect(res.status).toBe(204);
});
