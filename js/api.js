
const WP_API = 'https://public-api.wordpress.com/wp/v2/sites/christinefwalker.com';

function cleanText(str) {
  if (!str) return '';
  return str.replace(/&#8217;/g,"'").replace(/&#8220;/g,'\u201C').replace(/&#8221;/g,'\u201D')
    .replace(/&#8211;/g,'\u2013').replace(/&#8212;/g,'\u2014').replace(/&amp;/g,'&')
    .replace(/&hellip;/g,'…').replace(/<[^>]+>/g,'').trim();
}

async function fetchPosts(count = 10) {
  try {
    const res = await fetch(`${WP_API}/posts?per_page=${count}&_embed`);
    if (!res.ok) throw new Error('API unreachable');
    const data = await res.json();
    return data.map(p => ({
      id: p.id, slug: p.slug,
      title: cleanText(p.title.rendered),
      excerpt: cleanText(p.excerpt.rendered),
      content: p.content.rendered,
      date: new Date(p.date).toLocaleDateString('en-US',{month:'long',year:'numeric'}),
      tag: p._embedded?.['wp:term']?.[0]?.[0]?.name || 'Essay',
      link: p.link
    }));
  } catch(e) { return { error: e.message }; }
}

async function fetchPostBySlug(slug) {
  try {
    const res = await fetch(`${WP_API}/posts?slug=${encodeURIComponent(slug)}&_embed`);
    if (!res.ok) throw new Error('API unreachable');
    const data = await res.json();
    if (!data.length) return { error: 'Post not found' };
    const p = data[0];
    return {
      id: p.id, slug: p.slug,
      title: cleanText(p.title.rendered),
      excerpt: cleanText(p.excerpt.rendered),
      content: p.content.rendered,
      date: new Date(p.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}),
      tag: p._embedded?.['wp:term']?.[0]?.[0]?.name || 'Essay',
      link: p.link
    };
  } catch(e) { return { error: e.message }; }
}

function renderPostList(containerId, posts) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (posts.error) {
    el.innerHTML = `<div class="error-note"><strong>Couldn't load posts:</strong> ${posts.error}</div>`;
    return;
  }
  if (!posts.length) { el.innerHTML = '<p style="color:var(--muted)">No posts yet.</p>'; return; }
  el.innerHTML = posts.map(p => `
    <a href="/blog/post/?slug=${encodeURIComponent(p.slug)}" class="post-item">
      <div class="post-body">
        <div class="post-tag"><span class="tag">${p.tag}</span></div>
        <h3 class="post-title">${p.title}</h3>
        <p class="post-excerpt">${p.excerpt.slice(0,160)}${p.excerpt.length>160?'…':''}</p>
      </div>
      <span class="post-date">${p.date}</span>
    </a>
  `).join('');
}

function renderWorksGrid(containerId, limit) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const items = limit ? WORKS.slice(0, limit) : WORKS;
  el.innerHTML = items.map(w => `
    <a href="/works/${w.slug}" class="work-card">
      <div class="work-card-hero" style="background:${w.heroColor}">
        <div class="grain"></div>
        ${w.badge ? `<div class="work-card-badge">${w.badge}</div>` : ''}
        <div class="work-card-tag"><span class="tag">${w.tag}</span></div>
      </div>
      <div class="work-card-body">
        <div class="work-card-row">
          <h3 class="work-card-title">${w.title}</h3>
          <span class="work-card-year">${w.year}</span>
        </div>
        <p class="work-card-desc">${w.desc.slice(0,80)}…</p>
      </div>
    </a>
  `).join('');
}

function renderFooter() {
  const el = document.getElementById('footer-placeholder');
  if (!el) return;
  const links = [['About','/about'],['Blog','/blog'],['Works','/works'],['Start Here','/start'],['Contact','/contact'],['Privacy','/privacy'],['Disclosures','/disclosures']];
  el.innerHTML = `
    <footer role="contentinfo">
      <div class="footer-inner">
        <span class="footer-logo">Christine F. Walker</span>
        <nav aria-label="Footer navigation" class="footer-links">
          ${links.map(([l,p])=>`<a href="${p}" class="footer-link">${l}</a>`).join('')}
        </nav>
        <span class="footer-copy">&copy; ${new Date().getFullYear()}</span>
      </div>
    </footer>`;
}

function generatePDF(name) {
  const w = window.open('','_blank');
  const qHTML = part => QUESTIONS.filter(q=>q.part===part).map(q=>`
    <div class="q"><div class="q-n">Q${q.n}</div>
    <div class="q-text">"${q.q}"</div>
    <div class="q-why">↳ ${q.why}</div></div>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Creator Clarity Blueprint</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1C1C1A;padding:56px 64px}
  .eyebrow{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#6B6860;margin-bottom:28px}
  h1{font-family:Georgia,serif;font-size:48px;font-weight:400;letter-spacing:-0.03em;line-height:1.05;margin-bottom:16px}
  .sub{font-size:16px;color:#6B6860;line-height:1.6;margin-bottom:8px}
  .credit{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C4A882;margin-bottom:48px;padding-bottom:40px;border-bottom:1px solid rgba(28,28,26,0.1)}
  .arc{display:flex;align-items:center;background:#F5F2ED;padding:20px 24px;margin-bottom:48px}
  .arc-item{font-size:13px;letter-spacing:0.08em;text-transform:uppercase}
  .arc-sep{color:#C4A882;margin:0 12px}
  .part{background:#1C1C1A;color:#FDFCFB;padding:14px 20px;margin:40px 0 0}
  .part-label{font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#C4A882;margin-bottom:4px}
  .part-title{font-family:Georgia,serif;font-size:18px;font-weight:400}
  .q{padding:20px 0;border-bottom:1px solid rgba(28,28,26,0.08)}
  .q-n{font-size:10px;letter-spacing:0.12em;color:#C4A882;font-weight:700;margin-bottom:6px}
  .q-text{font-family:Georgia,serif;font-size:17px;margin-bottom:6px;line-height:1.3}
  .q-why{font-size:12px;color:#6B6860;line-height:1.5}
  .footer{display:flex;justify-content:space-between;margin-top:48px;padding-top:20px;border-top:1px solid rgba(28,28,26,0.1);font-size:11px;color:#6B6860}
  @media print{body{padding:40px 48px}}</style></head><body>
  <div class="eyebrow">A Squirrel Media Framework · Published by Christine F. Walker</div>
  <h1>Creator Clarity<br/>Interview Blueprint</h1>
  <div class="sub">A 15-Question Framework for Extracting Story, Strategy & Positioning</div>
  <div class="credit">Based on the Marketing User Story Doctrine by Nic Sementa${name?` · Prepared for ${name}`:''}</div>
  <div class="arc"><span class="arc-item">Problem</span><span class="arc-sep">→</span><span class="arc-item">Story</span><span class="arc-sep">→</span><span class="arc-item">Solution</span><span class="arc-sep">→</span><span class="arc-item">Outcome</span></div>
  <div class="part"><div class="part-label">Part One · Questions 01–08</div><div class="part-title">Problem Discovery</div></div>
  ${qHTML(1)}
  <div class="part"><div class="part-label">Part Two · Questions 09–15</div><div class="part-title">Solution Discovery</div></div>
  ${qHTML(2)}
  <div class="footer"><span>Creator Clarity Interview Blueprint</span><span>© ${new Date().getFullYear()} Squirrel Media LLC · christinefwalker.com</span></div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
