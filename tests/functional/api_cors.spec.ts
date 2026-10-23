import { test } from '@japa/runner'

test.group('API CORS', () => {
  test('allows the frontend origin on API responses and preflight requests', async ({
    client,
    assert,
  }) => {
    const origin = 'https://thekuwaitiexperience.com'
    const response = await client.get('/api/v1/health').header('Origin', origin)
    response.assertStatus(200)
    assert.equal(response.headers()['access-control-allow-origin'], origin)
    assert.include(response.headers().vary, 'Accept-Language')

    const preflight = await client
      .options('/api/v1/transport/locations')
      .header('Origin', origin)
      .header('Access-Control-Request-Method', 'GET')
    preflight.assertStatus(204)
    assert.equal(preflight.headers()['access-control-allow-origin'], origin)
    assert.include(preflight.headers()['access-control-allow-methods'], 'GET')
    assert.include(preflight.headers()['access-control-allow-headers'], 'Accept-Language')
  })

  test('does not allow other origins', async ({ client, assert }) => {
    const response = await client.get('/api/v1/health').header('Origin', 'https://example.com')
    response.assertStatus(200)
    assert.notProperty(response.headers(), 'access-control-allow-origin')
  })
})
