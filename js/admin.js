import { getUser, logout } from './vendor/identity.js';

const status = document.getElementById('admin-status');

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function date(value) {
  return new Date(value).toLocaleString();
}

try {
  await getUser();
  const response = await fetch('/api/admin-data', { cache: 'no-store' });
  if (response.status === 401) { await logout(); location.replace('/admin/login'); }
  else if (response.status === 403) status.textContent = 'This account does not have administrator access.';
  else {
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    document.getElementById('inquiry-count').textContent = String(data.counts.inquiries);
    document.getElementById('click-count').textContent = String(data.counts.referral_clicks);
    const inquiries = document.getElementById('inquiry-list');
    const clicks = document.getElementById('click-list');
    if (!data.inquiries.length) inquiries.append(textElement('li', 'No inquiries yet. The next conversation starts at Tell Christine.'));
    for (const inquiry of data.inquiries) {
      const item = document.createElement('li');
      item.append(textElement('h3', inquiry.name), textElement('p', date(inquiry.created_at), 'connector-admin-meta'), textElement('p', inquiry.problem));
      const label = textElement('label', 'Status ');
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Status for ${inquiry.name}`);
      for (const [value, title] of [['new', 'New'], ['in_progress', 'In progress'], ['closed', 'Closed']]) {
        const option = textElement('option', title);
        option.value = value;
        select.append(option);
      }
      select.value = inquiry.status;
      let savedStatus = inquiry.status;
      const feedback = textElement('p', '', 'connector-admin-meta');
      feedback.setAttribute('role', 'status');
      select.addEventListener('change', async () => {
        select.disabled = true;
        feedback.textContent = 'Saving…';
        try {
          const update = await fetch('/api/admin-status', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: inquiry.id, status: select.value }),
          });
          if (!update.ok) throw new Error('Status unavailable');
          savedStatus = select.value;
          feedback.textContent = 'Status saved.';
        } catch {
          select.value = savedStatus;
          feedback.textContent = 'Couldn’t save status. Please try again.';
        } finally {
          select.disabled = false;
        }
      });
      label.append(select);
      item.append(label, feedback);
      inquiries.append(item);
    }
    if (!data.referral_clicks.length) clicks.append(textElement('li', 'No referral clicks yet.'));
    for (const click of data.referral_clicks) {
      const item = document.createElement('li');
      item.append(textElement('h3', date(click.created_at)), textElement('p', `Click: ${click.click_id}`, 'connector-admin-meta'),
        textElement('p', `Source: ${click.source || 'direct'} · Problem: ${click.problem_slug}`),
        textElement('p', `Destination: ${click.destination || 'Not recorded'}`, 'connector-admin-meta'));
      clicks.append(item);
    }
    status.hidden = true;
    document.getElementById('admin-content').hidden = false;
  }
} catch {
  status.textContent = 'Your data is temporarily unavailable. Refresh to try again.';
}

document.getElementById('admin-logout').addEventListener('click', async () => {
  try { await logout(); location.replace('/admin/login'); }
  catch { status.hidden = false; status.textContent = 'Couldn’t sign out. Please try again.'; }
});
