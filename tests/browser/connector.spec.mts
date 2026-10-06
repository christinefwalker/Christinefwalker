import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.route('https://link.msgsndr.com/**', route => route.abort());
  await page.route('https://public-api.wordpress.com/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/events', route => route.fulfill({ json: { ok: true } }));
});

test('homepage leads with Christine and a problem, not funding', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('WHAT HURTS?');
  await expect(page.getByText('Hi, I’m Christine.')).toBeVisible();
  await expect(page.locator('.connector-hero').getByRole('link', { name: 'Tell me where it hurts' })).toHaveAttribute('href', '/contact');
  await expect(page.locator('#hero-pains > summary')).toHaveClass('connector-button');
  await expect(page.locator('.nav-logo')).toHaveText('Christine.');
  await expect(page.locator('.problem-nav summary')).toContainText('Problems');
  await expect(page.locator('.connector-hero')).toContainText('solutions I’ve vetted');
  await expect(page.locator('main')).not.toContainText('Business cash flow');
  await expect(page.locator('main')).not.toContainText('First problem');
  await expect(page.locator('#hero-pain-options a[href="/cash-flow"]')).toHaveCount(1);
  await expect(page.locator('#hero-pain-options')).toBeHidden();
  await expect(page.locator('.connector-thread, .connector-process')).toHaveCount(0);
  await expect(page.locator('#about')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('href', '/contact#about');
  await expect(page.locator('body')).not.toContainText('Fugio');
  await expect(page.locator('nav#nav')).not.toContainText('About');
  await expect(page.locator('nav#nav')).not.toContainText('Privacy');
  await expect(page.locator('nav#nav')).not.toContainText('Disclosures');
  await expect(page.locator('.footer-links').getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/privacy');
  await expect(page.locator('.footer-links').getByRole('link', { name: 'Disclosures', exact: true })).toHaveAttribute('href', '/privacy/disclosures');
  await expect(page.locator('main')).not.toContainText('—');
  await expect(page.locator('body')).not.toContainText('Writing');
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: true, animations: 'disabled' });
  await page.locator('.connector-hero').getByRole('link', { name: 'Tell me where it hurts' }).click();
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(page.locator('#tell-christine-form')).toBeVisible();
});

test('concise editorial hook and slim sequence explain the connector model without offers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#connection-title')).toHaveText('Oh. You have THAT problem?');
  await expect(page.locator('#connection-title strong')).toHaveText('THAT');
  await expect(page.locator('.connector-principle')).toHaveText('The problem comes before the product.');
  await expect(page.locator('main')).not.toContainText('I connect people, ideas, and resources');
  await expect(page.getByText(/Look for your problem in the menu above/)).toHaveCount(1);
  const sequence = page.locator('.connector-sequence > li');
  await expect(sequence).toHaveCount(4);
  await expect(page.locator('.connector-sequence li > span:first-child')).toHaveText(['Your problem', 'Christine', 'A connection', 'A way forward']);
  const positions = await sequence.evaluateAll(items => items.map(item => ({ top: item.getBoundingClientRect().top, left: item.getBoundingClientRect().left })));
  for (const [index, position] of positions.entries()) {
    expect(position.top).toBe(positions[0].top);
    if (index > 0) expect(position.left).toBeGreaterThan(positions[index - 1].left);
  }
  expect(await page.locator('.connector-sequence').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(85);
  await expect(page.locator('.connector-personal')).toContainText('Met me in person?');
  await expect(page.locator('.connector-personal')).toContainText('Found me online?');
  const precedesPersonal = await page.locator('.connector-hook').evaluate(section => {
    const personal = document.querySelector('.connector-personal');
    return Boolean(personal && section.compareDocumentPosition(personal) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(precedesPersonal).toBe(true);
  await expect(page.locator('.site-signoff-link')).toHaveAttribute('href', '/contact');
});

test('hero CTA opens its own pain dropdown without opening navigation', async ({ page }, testInfo) => {
  await page.goto('/');
  const trigger = page.locator('#hero-pains > summary');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#hero-pains')).toHaveAttribute('open', '');
  await expect(page.locator('#problem-menu')).not.toHaveAttribute('open', '');
  await expect(trigger).toBeFocused();
  await expect(page.locator('#hero-pain-options a')).toHaveCount(1);
  await expect(page.locator('#hero-pain-options a')).toBeVisible();
  await expect(page.locator('#hero-pain-options a')).toHaveAttribute('href', '/cash-flow');
  await expect(page.locator('#hero-pain-options')).toContainText('Making money.');
  await expect(page.locator('#hero-pain-options')).toContainText('Still cash-strapped?');
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByRole('button', { name: 'Toggle navigation menu' })).toHaveAttribute('aria-expanded', 'false');
  }
  await page.screenshot({ path: testInfo.outputPath('homepage-pain-menu.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('#hero-pains')).not.toHaveAttribute('open', '');
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByRole('button', { name: 'Toggle navigation menu' })).toHaveAttribute('aria-expanded', 'false');
  }
  await trigger.click();
  await page.locator('.connector-intro').click();
  await expect(page.locator('#hero-pains')).not.toHaveAttribute('open', '');
  await expect(page.locator('#problem-menu')).not.toHaveAttribute('open', '');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, reducedMotion: 'reduce' });
  test('hero pain dropdown still reaches the cash-flow page', async ({ page }) => {
    await page.goto('/');
    await page.locator('#hero-pains > summary').click();
    await expect(page.locator('#hero-pain-options')).toBeVisible();
    await page.locator('#hero-pain-options a').click();
    await expect(page).toHaveURL(/\/cash-flow\/?$/);
  });
});

test('every public page ends with one contact sign-off before the shared footer', async ({ page }) => {
  for (const path of ['/', '/cash-flow', '/contact', '/privacy', '/privacy/disclosures', '/about', '/blog', '/blog/post/?slug=example', '/works', '/start', '/thank-you', '/lifestyle', '/ecosystem', '/works/creator-clarity', '/admin/login', '/not-a-real-page']) {
    await page.goto(path);
    const signoff = page.locator('.site-signoff');
    await expect(signoff).toHaveCount(1);
    await expect(signoff.getByRole('link', { name: 'Tell Christine where it hurts' })).toHaveAttribute('href', '/contact');
    await expect(page.locator('.site-signoff + footer')).toHaveCount(1);
    if (path === '/cash-flow') await expect(signoff).toContainText('Not a cash-flow problem?');
    else await expect(signoff).not.toContainText('cash-flow');
  }
});

test('navigation works with keyboard and Escape', async ({ page }, testInfo) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Toggle navigation menu' });
  if (testInfo.project.name === 'mobile') {
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  const summary = page.locator('.problem-nav summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.problem-nav-menu').getByRole('link', { name: /Business cash flow/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(summary).toBeFocused();
  await expect(page.locator('.problem-nav')).not.toHaveAttribute('open', '');
  if (testInfo.project.name === 'mobile') {
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  }
});

test('cash flow has four situations and exactly one disclosed affiliate CTA', async ({ page }, testInfo) => {
  await page.goto('/cash-flow');
  await expect(page.getByRole('radio')).toHaveCount(4);
  await page.getByRole('radio').first().check();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.locator('#situation-status')).toContainText('not applying');
  await expect(page.locator('a[data-referral]')).toHaveCount(1);
  await expect(page.locator('.connector-disclosure')).toBeVisible();
  const disclosureSize = await page.locator('.connector-disclosure').evaluate(element => getComputedStyle(element).fontSize);
  const bodySize = await page.locator('.connector-body-copy').first().evaluate(element => getComputedStyle(element).fontSize);
  expect(disclosureSize).toBe(bodySize);
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Fugio');
  await page.screenshot({ path: testInfo.outputPath('cash-flow.png'), fullPage: true, animations: 'disabled' });
});

test('referral link preserves first landing page and campaign attribution', async ({ page }) => {
  await page.goto('/?utm_source=meetup&utm_campaign=conversation');
  await page.locator('#hero-pains > summary').click();
  await page.locator('#hero-pain-options').getByRole('link', { name: /Making money/ }).click();
  await expect(page.locator('a[data-referral]')).toHaveAttribute('href', /landing_page=/);
  const href = await page.locator('a[data-referral]').getAttribute('href');
  const target = new URL(href || '', 'http://localhost:8889');
  expect(target.pathname).toBe('/go/fugio');
  expect(target.searchParams.get('landing_page')).toBe('/');
  expect(target.searchParams.get('utm_source')).toBe('meetup');
  expect(target.searchParams.get('utm_campaign')).toBe('conversation');
  expect(target.searchParams.get('session_id')).toMatch(/^[0-9a-f-]{36}$/);
});

test('contact validates, preserves an error, retries with the same ID, and confirms', async ({ page }, testInfo) => {
  let attempts = 0;
  const identifiers: string[] = [];
  await page.route('**/contact', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts++;
    const data = new URLSearchParams(route.request().postData() || '');
    identifiers.push(data.get('submission_id') || '');
    expect(data.get('form-name')).toBe('contact');
    expect(data.get('message')).toBe(data.get('problem'));
    expect(data.get('follow_up_consent')).toBe('yes');
    return route.fulfill({ status: attempts === 1 ? 503 : 200, body: 'Recorded' });
  });
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Tell Christine' }).click();
  expect(attempts).toBe(0);
  await page.getByLabel('Your name').fill('Example Visitor');
  await page.getByLabel('Email', { exact: false }).fill('visitor@example.test');
  await page.getByLabel('What’s the problem?').fill('Our follow-up workflow keeps breaking.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Tell Christine' }).click();
  expect(attempts).toBe(0);
  await page.getByLabel('Phone').fill('+15551234567');
  await page.getByRole('button', { name: 'Tell Christine' }).click();
  await expect(page.locator('#form-status')).toContainText('didn’t send');
  await expect(page.getByLabel('What’s the problem?')).toHaveValue('Our follow-up workflow keeps breaking.');
  await page.getByRole('button', { name: 'Tell Christine' }).click();
  await expect(page.locator('#contact-success')).toBeVisible();
  expect(identifiers[0]).toBe(identifiers[1]);
  expect(identifiers[0]).toMatch(/^[0-9a-f-]{36}$/);
  await page.screenshot({ path: testInfo.outputPath('contact-success.png'), fullPage: true, animations: 'disabled' });
});

test('optional analytics stays off until allowed and can be declined', async ({ page }) => {
  const events: unknown[] = [];
  await page.route('**/api/events', route => { events.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); });
  await page.goto('/');
  expect(events).toHaveLength(0);
  await page.getByRole('button', { name: 'No thanks' }).click();
  await page.goto('/privacy');
  expect(events).toHaveLength(0);
  await page.getByRole('button', { name: 'Change optional analytics preference' }).click();
  await page.getByRole('button', { name: 'Allow analytics' }).click();
  await expect.poll(() => events.length).toBe(1);
});

test('legacy URLs exist and unknown paths return actual 404s', async ({ request }) => {
  for (const path of ['/about', '/blog', '/blog/post/?slug=example', '/ecosystem', '/lifestyle', '/start', '/thank-you', '/works', '/works/creator-clarity']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  for (const path of ['/not-a-real-page', '/problems/does-not-exist', '/netlify/lib/config.mts', '/node_modules/@netlify/identity/package.json']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test('admin routes and data reject anonymous visitors', async ({ request }) => {
  for (const path of ['/admin', '/admin/', '/admin/index', '/admin/index.html']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(302);
    expect(response.headers().location).toContain('/admin/login');
  }
  const response = await request.get('/api/admin-data');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
  const update = await request.patch('/api/admin-status', { data: { id: 'example', status: 'closed' } });
  expect(update.status()).toBe(401);
});

test('admin UI only shows two counts and renders inquiry text safely', async ({ page }) => {
  await page.route('**/admin', async route => route.fulfill({ contentType: 'text/html', body: await readFile('admin/index.html', 'utf8') }));
  await page.route('**/api/admin-data', route => route.fulfill({ json: {
    counts: { inquiries: 1, referral_clicks: 2 },
    inquiries: [{ id: 'example', created_at: '2026-10-06T00:00:00Z', name: '<img src=x onerror=alert(1)>', problem: 'A workflow problem.', status: 'new' }],
    referral_clicks: [{ click_id: 'click_example', created_at: '2026-10-06T00:00:00Z', source: 'community', problem_slug: 'cash-flow', destination: 'https://www.fugiofundingnetwork.com/?ref=st-pete-christine' }], conversion_data: 'Not connected',
  } }));
  let statusAttempts = 0;
  await page.route('**/api/admin-status', route => {
    statusAttempts++;
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({ id: 'example', status: statusAttempts === 1 ? 'in_progress' : 'closed' });
    return route.fulfill({ status: statusAttempts === 1 ? 200 : 503, json: { ok: statusAttempts === 1 } });
  });
  await page.goto('/admin');
  await expect(page.locator('.connector-admin-count')).toHaveCount(2);
  await expect(page.locator('#inquiry-count')).toHaveText('1');
  await expect(page.locator('#click-count')).toHaveText('2');
  await expect(page.locator('#inquiry-list')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#inquiry-list img')).toHaveCount(0);
  await expect(page.locator('#admin-content')).toContainText('Not connected');
  await expect(page.locator('.site-signoff')).toHaveCount(1);
  await expect(page.locator('#click-list')).toContainText('Source: community');
  await expect(page.locator('#click-list')).toContainText('Destination: https://www.fugiofundingnetwork.com/');
  await expect(page.locator('#click-list')).not.toContainText('Session:');
  const inquiryStatus = page.locator('#inquiry-list select');
  await inquiryStatus.selectOption('in_progress');
  await expect(page.locator('#inquiry-list')).toContainText('Status saved.');
  await inquiryStatus.selectOption('closed');
  await expect(page.locator('#inquiry-list')).toContainText('Couldn’t save status.');
  await expect(inquiryStatus).toHaveValue('in_progress');
});

test('intake is generic and About lives beneath it, reached from the footer', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('WHERE DOES IT HURT?');
  await expect(page.locator('body')).not.toContainText('Fugio');
  await expect(page.locator('body')).not.toContainText('funding application');
  await expect(page.getByLabel('Phone')).toHaveAttribute('required', '');
  await expect(page.getByLabel('Business name')).not.toHaveAttribute('required', '');
  await expect(page.locator('#about')).toContainText('Based in St. Petersburg. Built on conversation.');
  const follows = await page.locator('#about').evaluate(section => {
    const form = document.getElementById('tell-christine-form');
    return Boolean(form && form.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(follows).toBe(true);
  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/contact#about$/);
});

test('new pages do not overflow at the viewport width', async ({ page }) => {
  for (const path of ['/', '/cash-flow', '/contact', '/privacy', '/admin/login']) {
    await page.goto(path);
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(width.scroll, path).toBeLessThanOrEqual(width.viewport);
  }
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/');
  const right = await page.locator('#home-title em').evaluate(element => element.getBoundingClientRect().right);
  expect(right).toBeLessThanOrEqual(320);
  const sequenceFits = await page.locator('.connector-sequence').evaluate(element => {
    const labels = [...element.querySelectorAll('li > span:first-child')].map(label => label.getBoundingClientRect());
    return element.scrollWidth <= element.clientWidth && labels.every((label, index) => label.right <= (labels[index + 1]?.left ?? 320));
  });
  expect(sequenceFits).toBe(true);
  await page.locator('#hero-pains > summary').click();
  await expect(page.locator('#hero-pain-options')).toBeVisible();
  const menuRight = await page.locator('#hero-pain-options').evaluate(element => element.getBoundingClientRect().right);
  expect(menuRight).toBeLessThanOrEqual(320);
});

test('deployed-style endpoints use an uncached redirect and reject unsigned webhooks', async ({ request }) => {
  const referral = await request.head('/go/fugio', { maxRedirects: 0 });
  expect(referral.status()).toBe(302);
  expect(referral.headers().location).toBe('https://www.fugiofundingnetwork.com/?ref=st-pete-christine');
  expect(referral.headers()['cache-control']).toContain('no-store');
  expect((await request.post('/go/fugio')).status()).toBe(405);
  const methodCheck = await request.get('/.netlify/functions/fugio-webhook');
  expect(methodCheck.status()).toBe(405);
  expect(methodCheck.headers()['content-type']).toContain('application/json');
  const webhook = await request.post('/.netlify/functions/fugio-webhook', { data: {} });
  expect([401, 503]).toContain(webhook.status());
});

test('legacy PDF submission keeps its fields and includes a stable identifier', async ({ page }) => {
  const submissions: URLSearchParams[] = [];
  await page.route(url => url.origin === 'http://localhost:8889' && url.pathname === '/', route => {
    if (route.request().method() !== 'POST') return route.continue();
    submissions.push(new URLSearchParams(route.request().postData() || ''));
    return route.fulfill({ status: 200, body: 'Recorded' });
  });
  await page.goto('/works/creator-clarity');
  await page.evaluate('window.generatePDF = () => {}');
  await page.getByLabel('Name *', { exact: true }).fill('Example Visitor');
  await page.getByLabel('Email *', { exact: true }).fill('visitor@example.test');
  await page.getByRole('button', { name: 'Download PDF →' }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0].get('form-name')).toBe('pdf-download');
  expect(submissions[0].get('source_form')).toBe('pdf-download');
  expect(submissions[0].get('submission_id')).toMatch(/^[0-9a-f-]{36}$/);
  expect(submissions[0].get('name')).toBe('Example Visitor');
});
