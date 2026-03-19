const request = require('supertest');
const app = require('../server');
const { cleanDB, getAdminAgent, createUser, createTV, createMediaAsset } = require('./helpers');

let adminAgent;

beforeEach(async () => {
  cleanDB();
  adminAgent = await getAdminAgent();
});

// ─── TV Listing ───────────────────────────────────────────────────────────────

describe('GET /api/tvs (listing)', () => {
  test('Admin sees all TVs', async () => {
    await createTV(adminAgent, { name: 'TV A' });
    await createTV(adminAgent, { name: 'TV B' });
    const res = await adminAgent.get('/api/tvs');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test('Non-admin only sees TVs granted via tv_user_access', async () => {
    const tv1 = await createTV(adminAgent, { name: 'Accessible TV' });
    await createTV(adminAgent, { name: 'Inaccessible TV' });

    const user = await createUser(adminAgent, {
      username: 'listuser', email: 'list@example.com', password: 'password123', role: 'user',
    });
    await adminAgent.post(`/api/tvs/${tv1.id}/access`).send({ userId: user.id });

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'list@example.com', password: 'password123' });

    const res = await agent.get('/api/tvs');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(tv1.id);
  });

  test('Non-admin TV card itemCount = active + non-expired only', async () => {
    const tv = await createTV(adminAgent, { name: 'Count TV' });
    const asset = await createMediaAsset(adminAgent);

    const user = await createUser(adminAgent, {
      username: 'countuser', email: 'count@example.com', password: 'password123', role: 'user',
    });
    await adminAgent.post(`/api/tvs/${tv.id}/access`).send({ userId: user.id });

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'count@example.com', password: 'password123' });

    // 1 active item
    await agent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: true });
    // 3 inactive items
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: false });
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: false });
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: false });
    // 1 expired item (active=1 but endAt in the past)
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({
      mediaAssetId: asset.id, isActive: true, endAt: '2020-01-01 00:00:00',
    });

    const res = await agent.get('/api/tvs');
    expect(res.status).toBe(200);
    const tvData = res.body.find(t => t.id === tv.id);
    expect(tvData.itemCount).toBe(1);
  });
});

// ─── TV Detail ────────────────────────────────────────────────────────────────

describe('GET /api/tvs/:id (detail)', () => {
  test('Non-admin only gets active + non-expired items', async () => {
    const tv = await createTV(adminAgent, { name: 'Filter TV' });
    const asset = await createMediaAsset(adminAgent);

    const user = await createUser(adminAgent, {
      username: 'detailuser', email: 'detail@example.com', password: 'password123', role: 'user',
    });
    await adminAgent.post(`/api/tvs/${tv.id}/access`).send({ userId: user.id });

    // active item
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: true });
    // inactive item
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: false });
    // expired item
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({
      mediaAssetId: asset.id, isActive: true, endAt: '2020-01-01 00:00:00',
    });

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'detail@example.com', password: 'password123' });

    const res = await agent.get(`/api/tvs/${tv.id}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].isActive).toBe(true);
  });

  test('Admin gets all items including inactive/expired', async () => {
    const tv = await createTV(adminAgent, { name: 'Admin Detail TV' });
    const asset = await createMediaAsset(adminAgent);

    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: true });
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: false });
    await adminAgent.post(`/api/tvs/${tv.id}/items`).send({
      mediaAssetId: asset.id, isActive: true, endAt: '2020-01-01 00:00:00',
    });

    const res = await adminAgent.get(`/api/tvs/${tv.id}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
  });
});

// ─── Item Ownership ───────────────────────────────────────────────────────────

describe('TV item ownership enforcement', () => {
  let tv, asset, userAgent, itemByUser, itemByAdmin;

  beforeEach(async () => {
    tv = await createTV(adminAgent, { name: 'Ownership TV' });
    asset = await createMediaAsset(adminAgent);

    const user = await createUser(adminAgent, {
      username: 'ownuser', email: 'own@example.com', password: 'password123', role: 'user',
    });
    await adminAgent.post(`/api/tvs/${tv.id}/access`).send({ userId: user.id });

    userAgent = request.agent(app);
    await userAgent.post('/api/auth/login').send({ email: 'own@example.com', password: 'password123' });

    const r1 = await userAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: true });
    itemByUser = r1.body;

    const r2 = await adminAgent.post(`/api/tvs/${tv.id}/items`).send({ mediaAssetId: asset.id, isActive: true });
    itemByAdmin = r2.body;
  });

  test('Non-owner PATCH item returns 403', async () => {
    const res = await userAgent
      .patch(`/api/tvs/${tv.id}/items/${itemByAdmin.id}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  test('Non-owner DELETE item returns 403', async () => {
    const res = await userAgent.delete(`/api/tvs/${tv.id}/items/${itemByAdmin.id}`);
    expect(res.status).toBe(403);
  });

  test('Owner can PATCH their own item', async () => {
    const res = await userAgent
      .patch(`/api/tvs/${tv.id}/items/${itemByUser.id}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
  });

  test('Owner can DELETE their own item', async () => {
    const res = await userAgent.delete(`/api/tvs/${tv.id}/items/${itemByUser.id}`);
    expect(res.status).toBe(204);
  });

  test('Admin can PATCH any item', async () => {
    const res = await adminAgent
      .patch(`/api/tvs/${tv.id}/items/${itemByUser.id}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
  });

  test('Admin can DELETE any item', async () => {
    const res = await adminAgent.delete(`/api/tvs/${tv.id}/items/${itemByUser.id}`);
    expect(res.status).toBe(204);
  });
});

// ─── TV Access Control ────────────────────────────────────────────────────────

describe('TV create/delete access control', () => {
  let nonAdminAgent;

  beforeEach(async () => {
    const user = await createUser(adminAgent, {
      username: 'notvuser', email: 'notv@example.com', password: 'password123', role: 'user',
    });
    nonAdminAgent = request.agent(app);
    await nonAdminAgent.post('/api/auth/login').send({ email: 'notv@example.com', password: 'password123' });
  });

  test('Non-admin cannot create TV', async () => {
    const res = await nonAdminAgent.post('/api/tvs').send({ name: 'Unauthorized TV' });
    expect(res.status).toBe(403);
  });

  test('Non-admin cannot delete TV', async () => {
    const tv = await createTV(adminAgent, { name: 'Protected TV' });
    const res = await nonAdminAgent.delete(`/api/tvs/${tv.id}`);
    expect(res.status).toBe(403);
  });
});
