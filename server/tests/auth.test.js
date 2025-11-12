import http from 'http';
import mongoose from 'mongoose';
import crypto from 'crypto';

import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

// Helper to spin up the Express application on an ephemeral port
async function startHttpServer() {
  return new Promise((resolve) => {
    const instance = http.createServer(app);
    instance.listen(0, () => resolve(instance));
  });
}

describe('Authentication controller integration', () => {
  const uniqueSuffix = crypto.randomUUID();
  const credentials = {
    name: `Test Runner ${uniqueSuffix}`,
    email: `test.runner.${uniqueSuffix}@example.com`,
    password: `P@ssw0rd-${uniqueSuffix.slice(0, 8)}`
  };

  let serverInstance;
  let baseUrl;
  let issuedToken; // token shared between tests

  beforeAll(async () => {
    await connectDB();
    // Clean up any previous test user
    await User.deleteOne({ email: credentials.email.toLowerCase() });

    serverInstance = await startHttpServer();
    const { port } = serverInstance.address();
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  afterAll(async () => {
    // Remove test user
    await User.deleteOne({ email: credentials.email.toLowerCase() });

    // Close server and DB connection
    await new Promise((resolve) => serverInstance.close(resolve));
    await mongoose.connection.close();
  });

  test('registers a brand-new user and returns a JWT for immediate use', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const payload = await response.json();

    
    expect(response.status).toBe(201);
    expect(payload.token).toBeTruthy();
    expect(payload.user.email).toBe(credentials.email.toLowerCase());
    expect(payload.user).not.toHaveProperty('passwordHash');

    // Save token for subsequent tests
    issuedToken = payload.token;
  });


  test('authenticates the same user and issues a fresh JWT', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password
      })
    });

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.token).toBeTruthy();
    expect(payload.user.email).toBe(credentials.email.toLowerCase());
    expect(payload.user).not.toHaveProperty('passwordHash');

    // Update issuedToken for /auth/me test
    issuedToken = payload.token;
  });

  test('returns the public profile for the currently authenticated user', async () => {
    if (!issuedToken) throw new Error('No valid token available for /auth/me test');

    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${issuedToken}` }
    });

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.user.email).toBe(credentials.email.toLowerCase());
    expect(payload.user).not.toHaveProperty('passwordHash');
  });
});
