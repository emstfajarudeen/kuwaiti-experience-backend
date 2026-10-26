import { assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { browserClient } from '@japa/browser-client'
import { chromium } from 'playwright'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { sessionBrowserClient } from '@adonisjs/session/plugins/browser_client'
import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
import { apiClient } from '@japa/api-client'
import { shieldApiClient } from '@adonisjs/shield/plugins/api_client'

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */

/**
 * Configure Japa plugins in the plugins array.
 * Learn more - https://japa.dev/docs/runner-config#plugins-optional
 */
const browserExecutable = process.env.CMS_BROWSER_EXECUTABLE

export const plugins: Config['plugins'] = [
  assert(),
  pluginAdonisJS(app),
  dbAssertions(app),
  browserClient({
    runInSuites: ['browser'],
    ...(browserExecutable
      ? {
          launcher: (options) => chromium.launch({ ...options, executablePath: browserExecutable }),
        }
      : {}),
  }),
  sessionBrowserClient(app),
  apiClient(),
  sessionApiClient(app),
  shieldApiClient(),
]

/**
 * Configure lifecycle function to run before and after all the
 * tests.
 *
 * The setup functions are executed before all the tests
 * The teardown functions are executed after all the tests
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [
    () => {
      if (process.env.DB_DATABASE !== 'kuwaitiexperience_test') {
        throw new Error('Tests require the isolated kuwaitiexperience_test database')
      }
      return testUtils.db('test_migrations').migrate()
    },
  ],
  teardown: [],
}

/**
 * Configure suites by tapping into the test suite instance.
 * Learn more - https://japa.dev/docs/test-suites#lifecycle-hooks
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (['browser', 'functional', 'e2e'].includes(suite.name)) {
    return suite.setup(() => testUtils.httpServer().start())
  }
}
