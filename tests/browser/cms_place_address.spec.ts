import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { prepareAdminAuthorization } from '../helpers/admin_auth.js'

test.group('CMS place address', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('saves an address without a summary field', async ({ visit, assert }) => {
    await db.table('users').insert({
      full_name: 'Place Editor',
      email: 'place-editor@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    await prepareAdminAuthorization('place-editor@example.com')
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions', sort_order: 0 })
      .onConflict('code')
      .ignore()

    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('place-editor@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/places/new', page.url()).toString())

    assert.equal(await page.getByLabel('Short summary').count(), 0)
    await page.getByLabel('Place type').click()
    await page.getByText('Attractions', { exact: true }).last().click()
    await page.getByLabel('English title').fill('Kuwait Towers')
    await page.getByLabel('URL slug').fill('kuwait-towers')
    await page.getByLabel('Address', { exact: true }).fill('Arabian Gulf Street, Kuwait City')
    await page.getByLabel('About this place').fill('A landmark on the Gulf coast.')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL('**/admin/places')

    const place = await db.from('places').where('slug', 'kuwait-towers').first()
    assert.isTrue(Boolean(place))
    const translation = await db
      .from('place_translations')
      .where('place_id', place.id)
      .where('locale', 'en')
      .first()
    assert.equal(translation.address, 'Arabian Gulf Street, Kuwait City')
    assert.equal(translation.summary, 'A landmark on the Gulf coast.')

    await db.from('places').where('id', place.id).update({ latitude: 29.3897, longitude: 47.9984 })
    await page.goto(new URL(`/admin/places/${place.id}/edit`, page.url()).toString())
    await page.getByLabel('Address', { exact: true }).fill('New address, Kuwait City')
    assert.equal(await page.getByLabel('Latitude').inputValue(), '')
    assert.equal(await page.getByLabel('Longitude').inputValue(), '')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForURL('**/admin/places')
    const updatedPlace = await db.from('places').where('id', place.id).first()
    const updatedTranslation = await db
      .from('place_translations')
      .where('place_id', place.id)
      .where('locale', 'en')
      .first()
    assert.isNull(updatedPlace.latitude)
    assert.isNull(updatedPlace.longitude)
    assert.equal(updatedTranslation.summary, 'A landmark on the Gulf coast.')

    await page.goto(new URL(`/admin/places/${place.id}/edit`, page.url()).toString())
    const invalidSearchStatus = await page.evaluate(async () => {
      const response = await fetch('/admin/places/address-search?q=ab', {
        headers: { Accept: 'application/json' },
      })
      return response.status
    })
    assert.equal(invalidSearchStatus, 422)

    await page.route('**/admin/places/address-search?q=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 123,
              label: 'Kuwait Towers, Arabian Gulf Street, Kuwait City',
              latitude: 29.3897,
              longitude: 47.9984,
            },
          ],
        }),
      })
    })
    await page.getByLabel('Address', { exact: true }).fill('Kuwait Towers')
    await page
      .getByRole('option', { name: 'Kuwait Towers, Arabian Gulf Street, Kuwait City' })
      .click()
    assert.equal(await page.getByLabel('Latitude').inputValue(), '29.3897')
    assert.equal(await page.getByLabel('Longitude').inputValue(), '47.9984')

    await page.route('**/admin/places/address-reverse?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: { id: 'map:1', label: 'Selected map location, Kuwait City' },
        }),
      })
    })
    await page.getByLabel('Place location on OpenStreetMap').click({ position: { x: 100, y: 100 } })
    await page.getByLabel('Address', { exact: true }).fill('Selected map location, Kuwait City')
    const clickedLatitude = await page.getByLabel('Latitude').inputValue()
    const clickedLongitude = await page.getByLabel('Longitude').inputValue()
    assert.isNotEmpty(clickedLatitude)
    assert.isNotEmpty(clickedLongitude)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForURL('**/admin/places')
    const mappedPlace = await db.from('places').where('id', place.id).first()
    assert.equal(Number(mappedPlace.latitude), Number(clickedLatitude))
    assert.equal(Number(mappedPlace.longitude), Number(clickedLongitude))
  })
})
