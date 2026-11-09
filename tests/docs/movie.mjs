#!/usr/bin/env node
/**
 * Records the README's demo movie (docs/images/demo.gif, plus an MP4 that isn't committed) with the
 * shared Supertext movie kit (movie/movie-kit.mjs): as the demo's editor, the sample page in English,
 * Apostrophe's own *Localize…* wizard with German and French and *Translate text content* (Supertext),
 * the waiting state and the German draft. Run it against a fresh demo (the page not localized yet)
 * whose module talks to the stand-in API with a delay (STAND_IN_DELAY=10 stand-in.mjs). See docs/DEVELOPER.md.
 *
 *   BASE_URL=http://127.0.0.1:3000 DEMO_EDITOR_EMAIL=… DEMO_EDITOR_PASSWORD=… npm run docs:movie
 *
 * MOVIE_OUT: where the MP4 goes (default tests/docs/movie/out/Apostrophe-Supertext-Translation.mp4, git-ignored).
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MovieKit } from './movie/movie-kit.mjs'

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const need = (name) => process.env[name] ?? (() => { throw new Error(`Set ${name}`) })()
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const mp4 = process.env.MOVIE_OUT ?? here('movie/out/Apostrophe-Supertext-Translation.mp4')
const gif = here('../../docs/images/demo.gif')
const workDir = mkdtempSync(join(tmpdir(), 'apostrophe-movie-'))

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' })
page.setDefaultTimeout(90_000)

// Sign in as the editor and open the sample page (not recorded).
await page.goto(base + '/login')
await page.waitForSelector('input[type=password]', { timeout: 120_000 })
await page.locator('input:not([type=password])').first().fill(need('DEMO_EDITOR_EMAIL'))
await page.locator('input[type=password]').fill(need('DEMO_EDITOR_PASSWORD'))
await page.keyboard.press('Enter')
await page.waitForSelector('[data-apos-test=adminBar]', { timeout: 60_000 })
await page.goto(base + '/swiss-chocolate')
await page.locator('#apos-busy .apos-is-busy').waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {})
await page.getByText('From Bern to the world').first().waitFor()
await page.waitForTimeout(1500)

const modal = page.locator('.apos-modal__inner').last()
const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets'), voiceCache: here('movie/voice') })

// 1. The page in English.
await kit.say("Here's a page in Apostrophe, written in English.", {
  caption: 'A page in English',
  during: () => kit.moveTo(page.getByText('From Bern to the world').first())
})

// 2. Apostrophe's own Localize… wizard (loading times are cut).
const cut = async (ready) => {
  kit.pause()
  await ready()
  await page.waitForTimeout(500)
  kit.resume()
}
const edit = page.getByRole('button', { name: 'Edit', exact: true })
if (await edit.isVisible()) {
  await kit.say('To translate it, click Edit.', { caption: 'Click <b>Edit</b>', during: () => kit.click(edit) })
  await cut(() => page.getByRole('button', { name: 'More Options' }).first().waitFor())
}
await kit.say('Open the More Options menu and choose Localize.', {
  caption: '<b>More Options</b> → <b>Localize…</b>',
  during: async () => {
    await kit.click(page.getByRole('button', { name: 'More Options' }).first())
    await page.waitForTimeout(400)
    await kit.click(page.getByText(/^Localize/).first())
  }
})
await cut(() => modal.getByText('Deutsch (DE)').waitFor())
await kit.say('Pick German and French as the target locales, then click Next.', {
  caption: 'Pick <b>Deutsch</b> and <b>Français</b>, then <b>Next</b>',
  during: async () => {
    await kit.click(modal.getByText('Deutsch (DE)'))
    await kit.click(modal.getByText('Français (FR)'))
    await page.waitForTimeout(300)
    await kit.click(modal.getByRole('button', { name: /Next/ }))
  }
})
await cut(() => modal.getByText('Translate text content').waitFor())
await kit.say('Tick Translate text content, and click Localize Content.', {
  caption: 'Tick <b>Translate text content</b>, click <b>Localize Content</b>',
  during: async () => {
    await kit.click(modal.getByText('Translate text content'))
    await page.waitForTimeout(400)
    await kit.click(modal.getByRole('button', { name: 'Localize Content' }))
  }
})

// 3. Waiting: a moment of the busy state, then cut until the translations are back.
await kit.say('Supertext translates the content.', { caption: 'Supertext translates the content…' })
kit.pause()
await page.getByText('successfully localized').waitFor({ timeout: 180_000 })
await page.waitForTimeout(600)
// The success notice would sit behind the caption bar: close it before recording again.
await page.locator('.apos-notification__button').first().click().catch(() => {})
await page.waitForTimeout(600)
kit.resume()

// 4. The German version, opened with the locale switcher.
await kit.say('A few seconds later, German and French are ready. Switch to German to check.', {
  caption: 'Switch to <b>Deutsch</b> to check',
  during: async () => {
    await kit.click(page.locator('[data-apos-test=localePickerTrigger]').first())
    await page.waitForTimeout(600)
    await kit.moveTo(page.getByText('Deutsch (de)', { exact: true }).first())
  }
})
// Click and cut the page load at once (Apostrophe shows the page before its styles).
const deutsch = page.getByText('Deutsch (de)', { exact: true }).first()
await page.evaluate(([x, y]) => window.__stk?.ripple(x, y), [kit.cursor.x, kit.cursor.y])
await page.waitForTimeout(250)
await cut(async () => {
  await deutsch.click()
  await page.waitForLoadState('load')
  await page.getByText('Von Bern in die Welt').first().waitFor()
  await page.waitForSelector('[data-apos-test=adminBar]')
  await page.waitForTimeout(1000)
})
await kit.say('The German version is saved as a draft. Review it, then publish it as usual.', {
  caption: 'The German draft is ready – review it and publish',
  during: () => kit.moveTo(page.getByText('Von Bern in die Welt').first())
})
await kit.caption('')

await kit.finish(mp4, { system: 'ApostropheCMS', repo: 'Apostrophe-Supertext-Translation', gif })
await browser.close()
rmSync(workDir, { recursive: true, force: true })
console.log(`Saved ${mp4} and ${gif} (${(statSync(gif).size / 1e6).toFixed(2)} MB)`)
