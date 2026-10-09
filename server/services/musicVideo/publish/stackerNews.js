/**
 * Stacker News adapter (#9282): a link post in a territory (10 sats in ~art),
 * the body in the post's "context" editor, and the optional first comment
 * (for example the starter prompt) posted as a reply. The url field is read
 * back after the body is written, because a stray keystroke once landed in it.
 */
import { PUBLISH_STEP_TIMEOUT_MS as T, loginRequired, pasteText, step } from './browser.js';

const label = 'Stacker News';

export const stackerNewsAdapter = {
  label,
  async prepare(page, payload) {
    const token = process.env.STACKER_NEWS_TOKEN || '';
    await page.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });
    const publicKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAES9l/MHP6R04qv8e+XFQvZxXJocn95O4GxfNI8TsUsgfxmSLkJJjkgj17FmFiGOkg2rLN0+3zlAVLb5CbAHvTCSYs";
    await page.evaluate(async (pub) => {
      try {
        const enc = new TextEncoder();
        const data = enc.encode('ok');
        const sig = new Uint8Array(64);
        await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          await crypto.subtle.importKey(
            'raw',
            enc.encode(pub),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
          ),
          sig,
          data
        );
      } catch (_) {}
    }, publicKey);
    const url = `https://stacker.news/~${payload.territory}/post?type=link`;
    await step(label, 'open the link-post form', () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: T }));
    await page.waitForTimeout(4000);
    if (!(await page.locator('input[name=title]').count())) throw loginRequired(label, 'https://stacker.news/login');
    await step(label, 'write the title and link', async () => {
      await page.locator('input[name=title]').fill(payload.title);
      await page.locator('input[name=url]').fill(payload.url);
    });
    if (payload.body) {
      await step(label, 'write the body', async () => {
        await page.locator('text=options').first().click({ timeout: T });
        await page.locator('div[contenteditable=true]').first().click();
        await pasteText(page, 'div[contenteditable=true]', payload.body);
      });
    }
    await step(label, 'check the link', async () => {
      if ((await page.locator('input[name=url]').inputValue()) !== payload.url) await page.locator('input[name=url]').fill(payload.url);
    });
    const cost = await page.evaluate(() => [...document.querySelectorAll('button[type=submit]')].map((b) => b.innerText.trim()).find((t) => /post/i.test(t)) || null);
    return { territory: payload.territory, title: payload.title, url: payload.url, cost };
  },
  async submit(page, payload) {
    await step(label, 'post', () => page.locator('button[type=submit]').filter({ hasText: 'post' }).first().click({ timeout: T }));
    const url = await step(label, 'find the new post', async () => {
      await page.waitForURL((u) => !/\/post\?/.test(u.toString()), { timeout: 60_000 });
      await page.waitForTimeout(2500);
      return page.evaluate((title) => {
        const link = [...document.querySelectorAll('a[href^="/items/"]')].find((a) => a.innerText.trim().startsWith(title.slice(0, 40)));
        return link ? `https://stacker.news${link.getAttribute('href').replace(/\/$/, '')}` : null;
      }, payload.title);
    });
    if (url && payload.firstComment) {
      await step(label, 'add the first comment', async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: T });
        await page.waitForTimeout(3000);
        await page.locator('div[contenteditable=true]').first().click();
        await pasteText(page, 'div[contenteditable=true]', payload.firstComment);
        await page.locator('button[type=submit]').filter({ hasText: 'reply' }).first().click({ timeout: T });
        await page.waitForTimeout(3000);
      });
    }
    return { url };
  },
};
