const request = require('supertest');
const app = require('../server');
const { cleanDB } = require('./helpers');

beforeEach(() => cleanDB());

describe('POST /api/auth/login', () => {
  test('valid credentials returns 200 with user object', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@utrgv.edu', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      username: expect.any(String),
      email: 'admin@utrgv.edu',
      role: 'admin',
    });
  });

  test('wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@utrgv.edu', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('unknown email returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'admin123' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('unauthenticated returns 200 with null', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('authenticated returns user', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@utrgv.edu', password: 'admin123' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'admin@utrgv.edu' });
  });
});

describe('POST /api/auth/logout', () => {
  test('returns 204; subsequent /me returns null', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@utrgv.edu', password: 'admin123' });
    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(204);
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.body).toBeNull();
  });
});
