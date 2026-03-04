const request = require('supertest');
const app = require('../server');

describe('Auth', () => {
  it('debe registrar un usuario', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: 'Test User',
        email: 'test@test.com',
        password: 'securepass123'
      });s
    
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Registro exitoso');
  });
});