#!/usr/bin/env node
/**
 * Records the install and configuration movie (an MP4 that isn't committed) with the shared Supertext
 * movie kit (movie/movie-kit.mjs): the install steps from docs/INSTALLATION.md in a terminal (npm install,
 * the module in app.js, the locales, SUPERTEXT_API_KEY, the asset build, the check task), then, as the
 * demo's administrator, the Supertext screen in the admin bar (key status, Test connection, the language
 * mapping) and where editors find Supertext: Localize… in the page menu. Run it against a demo whose
 * module talks to the stand-in API (stand-in.mjs). See docs/DEVELOPER.md.
 *
 *   BASE_URL=http://127.0.0.1:3000 DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… npm run docs:movie:install
 *
 * MOVIE_OUT: where the MP4 goes (default tests/docs/movie/out/Apostrophe-Supertext-Translation-install.mp4, git-ignored).
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MovieKit } from './movie/movie-kit.mjs'

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const need = (name) => process.env[name] ?? (() => { throw new Error(`Set ${name}`) })()
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const mp4 = process.env.MOVIE_OUT ?? here('movie/out/Apostrophe-Supertext-Translation-install.mp4')
const workDir = mkdtempSync(join(tmpdir(), 'apostrophe-install-movie-'))

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' })
page.setDefaultTimeout(90_000)
// The movie runs against the stand-in: show the live API address and a public site instead of local ones.
await page.addInitScript(() => {
  const fix = () => {
    for (const el of document.querySelectorAll('.supertext-api-url')) {
      if (el.textContent !== 'https://api.supertext.com/v1/') el.textContent = 'https://api.supertext.com/v1/'
    }
    for (const el of document.querySelectorAll('.supertext-ping-url')) {
      const url = 'https://www.example.ch/api/v1/supertext-apostrophe-translation/ping'
      if (el.textContent !== url) el.textContent = url
    }
  }
  new MutationObserver(fix).observe(document, { subtree: true, childList: true, characterData: true })
})

// Sign in as the administrator (not recorded).
await page.goto(base + '/login')
await page.waitForSelector('input[type=password]', { timeout: 120_000 })
await page.locator('input:not([type=password])').first().fill(need('DEMO_ADMIN_EMAIL'))
await page.locator('input[type=password]').fill(need('DEMO_ADMIN_PASSWORD'))
await page.keyboard.press('Enter')
await page.waitForSelector('[data-apos-test=adminBar]', { timeout: 60_000 })

const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets'), voiceCache: here('movie/voice') })

// 1. Install (docs/INSTALLATION.md → Install).
await kit.say('In your Apostrophe project, add the module with npm.', {
  caption: 'Add the module: <b>npm install supertext-apostrophe-translation</b>',
  during: () => kit.terminal({
    title: 'my-site',
    lines: [
      { cmd: 'npm install supertext-apostrophe-translation' },
      { out: 'added 10 packages, and audited 804 packages in 4s' },
      { out: 'found 0 vulnerabilities' }
    ]
  })
})
await kit.say('Turn it on in app dot j s, in the list of modules.', {
  caption: 'Enable it in <b>app.js</b>',
  during: () => kit.terminal({
    title: 'my-site',
    lines: [
      { cmd: 'cat app.js' },
      { out: 'apostrophe({' },
      { out: "  shortName: 'my-site'," },
      { out: '  modules: {' },
      { out: '    // …' },
      { out: "    'supertext-apostrophe-translation': {}" },
      { out: '  }' },
      { out: '});' }
    ]
  })
})
await kit.say("Supertext translates between the locales of Apostrophe's i18n module. Set them up first.", {
  caption: 'Locales: Apostrophe’s <b>@apostrophecms/i18n</b> module',
  during: () => kit.terminal({
    title: 'my-site',
    lines: [
      { cmd: 'cat modules/@apostrophecms/i18n/index.js' },
      { out: '  locales: {' },
      { out: "    en: { label: 'English' }," },
      { out: "    de: { label: 'Deutsch', prefix: '/de' }," },
      { out: "    fr: { label: 'Français', prefix: '/fr' }," },
      { out: "    it: { label: 'Italiano', prefix: '/it' }" },
      { out: '  }' }
    ]
  })
})
await kit.say('Generate your API key at supertext.com, Integrations, API. No account yet? Create one at supertext.com.', {
  caption: 'Generate your API key at <b>supertext.com → Integrations → API</b>. No account yet? Create one at supertext.com.'
})
await kit.say('Set the key as the environment variable SUPERTEXT_API_KEY, and build the assets.', {
  caption: 'Set <b>SUPERTEXT_API_KEY</b> and build',
  during: () => kit.terminal({
    title: 'my-site',
    lines: [
      { cmd: 'export SUPERTEXT_API_KEY=st-demo-0000-0000-0000' },
      { cmd: 'npm run build' },
      { out: 'Apostrophe admin UI is complete!' }
    ]
  })
})
await kit.say('Then run the check task: the API key works.', {
  caption: 'Run the <b>check</b> task',
  during: () => kit.terminal({
    title: 'my-site',
    lines: [
      { cmd: 'node app supertext-apostrophe-translation:check' },
      { out: 'Supertext Translation for Apostrophe 0.1.0' },
      { out: 'API address: https://api.supertext.com/v1/' },
      { out: 'Locale de: de-DE (default)' },
      { out: 'Connected. The API key works.' }
    ]
  })
})

// 2. The Supertext screen (admin bar → Supertext).
/** Opens a page without recording the loading. */
const open = async (path, ready) => {
  kit.pause()
  await page.goto(base + path)
  await page.locator('#apos-busy .apos-is-busy').waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {})
  if (ready) await ready()
  await page.waitForTimeout(1200)
  kit.resume()
}
await open('/', () => page.getByRole('button', { name: 'Supertext', exact: true }).first().waitFor())
const modal = page.locator('.supertext-status')
await kit.say('Restart Apostrophe, and open Supertext in the admin bar.', {
  caption: 'Open <b>Supertext</b> in the admin bar',
  during: async () => {
    await kit.click(page.getByRole('button', { name: 'Supertext', exact: true }).first())
    await page.locator('.supertext-status__body').waitFor()
    await page.waitForTimeout(800)
  }
})
await kit.say('The API key is set. Click Test connection: the connection to Supertext works.', {
  caption: 'Key set. <b>Test connection</b>: the API key works',
  during: async () => {
    await kit.moveTo(modal.getByText('Set (environment variable SUPERTEXT_API_KEY)').first())
    await kit.hold(600)
    await kit.click(page.locator('.supertext-test'))
    await page.locator('.supertext-test-result').waitFor()
    await kit.moveTo(page.locator('.supertext-test-result'))
  }
})

// 3. The language mapping. A fresh install preselects the default (de → de-DE): show that first.
const languages = page.locator('.supertext-languages')
const deRow = languages.locator('tr').filter({ hasText: 'Deutsch' })
const deSelect = deRow.locator('.supertext-language-code select')
kit.pause()
await deSelect.selectOption(JSON.stringify('de-DE')) // AposSelect stores JSON values
await page.waitForTimeout(300)
kit.resume()
await kit.say('Under Languages, each locale gets a Supertext language. For German, choose Swiss High German.', {
  caption: '<b>Languages</b>: Deutsch → <b>Swiss High German (de-CH)</b>',
  during: async () => {
    await page.locator('.supertext-status__heading', { hasText: 'Languages' }).first()
      .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {})
    await languages.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    await page.waitForTimeout(900)
    await kit.click(deSelect)
    await deSelect.selectOption(JSON.stringify('de-CH'))
    await page.waitForTimeout(500)
  }
})
await kit.say('Translation review can be ticked for each locale. Leave it off for now.', {
  caption: '<b>Translation review</b>: optional, per locale',
  during: () => kit.moveTo(deRow.locator('.supertext-language-review').first())
})
await kit.say('Click Save languages.', {
  caption: 'Click <b>Save languages</b>',
  during: async () => {
    const save = page.locator('.supertext-save-languages')
    await save.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    await page.waitForTimeout(800)
    await kit.click(save)
    await page.locator('.supertext-save-result').waitFor()
    await page.waitForTimeout(400)
  }
})

// 4. Where editors find it: Localize… in a page's menu, with "Translate text content".
await open('/swiss-chocolate', async () => {
  await page.getByText('From Bern to the world').first().waitFor()
  const edit = page.getByRole('button', { name: 'Edit', exact: true })
  if (await edit.isVisible()) await edit.click()
  await page.getByRole('button', { name: 'More Options' }).first().waitFor()
})
await kit.say('Done. Editors now translate with Localize, in the menu of every page and piece.', {
  caption: 'Editors: <b>Localize…</b> → <b>Translate text content</b>',
  during: async () => {
    await kit.click(page.getByRole('button', { name: 'More Options' }).first())
    await page.waitForTimeout(900)
    await kit.moveTo(page.getByText(/^Localize/).first())
  }
})
await kit.caption('')

await kit.finish(mp4, { system: 'ApostropheCMS', repo: 'Apostrophe-Supertext-Translation', kind: 'install' })
await browser.close()
rmSync(workDir, { recursive: true, force: true })
console.log(`Saved ${mp4}`)
