// ---------- Constants ----------
const STORAGE_KEY = 'recipe-swipe-html-v1';

const CATEGORY_LABELS = { meat: '🥩 肉', fish: '🐟 魚', other: '🍳 その他' };
const TIME_OPTIONS = ['5分以内', '約10分', '約15分', '約30分', '約1時間', '1時間以上', '指定なし'];
const COST_OPTIONS = [
  { id: 'under100', label: '〜100円' },
  { id: 'under300', label: '〜300円' },
  { id: 'under500', label: '〜500円' },
  { id: 'under1000', label: '〜1000円' },
  { id: 'over1000', label: '1000円〜' },
  { id: 'unknown', label: '指定なし' }
];
const CATEGORY_OPTIONS = [
  { id: 'meat', label: '🥩 肉' },
  { id: 'fish', label: '🐟 魚' },
  { id: 'other', label: '🍳 その他' }
];
const DEFAULT_FILTERS = {
  categories: CATEGORY_OPTIONS.map(c => c.id),
  times: [...TIME_OPTIONS],
  costBuckets: COST_OPTIONS.map(c => c.id),
  excludeSpicy: false
};

// ---------- State ----------
const state = {
  tab: 'swipe',
  likedIds: [],
  rejectedIds: [],
  filters: cloneDefaults(),
  queue: [],
  cursor: 0,
  materialsChecked: new Set()
};
let draftFilters = null;

// ---------- Utility ----------
function cloneDefaults() {
  return {
    categories: [...DEFAULT_FILTERS.categories],
    times: [...DEFAULT_FILTERS.times],
    costBuckets: [...DEFAULT_FILTERS.costBuckets],
    excludeSpicy: false
  };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function costBucket(cost) {
  switch (cost) {
    case '100円以下': return 'under100';
    case '300円前後': return 'under300';
    case '500円前後': return 'under500';
    case '1,000円前後': return 'under1000';
    case '2,000円前後':
    case '3,000円前後':
    case '5,000円前後': return 'over1000';
    default: return 'unknown';
  }
}

function matchesFilter(recipe, filters) {
  if (!filters.categories.includes(recipe.category)) return false;
  if (!filters.times.includes(recipe.indication)) return false;
  if (!filters.costBuckets.includes(costBucket(recipe.cost))) return false;
  if (filters.excludeSpicy && recipe.spicy) return false;
  return true;
}

function isFilterActive(f) {
  return (
    f.categories.length < CATEGORY_OPTIONS.length ||
    f.times.length < TIME_OPTIONS.length ||
    f.costBuckets.length < COST_OPTIONS.length ||
    f.excludeSpicy
  );
}

function normalizeMaterial(m) {
  return m.replace(/^[\s☆★◎○●◯△▲■□◇◆※♪♥♡▽▼*\-・]+/g, '').trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function recipeById(id) {
  return window.RECIPES.find(r => r.id === id);
}

// ---------- Persistence ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.likedIds)) state.likedIds = saved.likedIds;
    if (Array.isArray(saved.rejectedIds)) state.rejectedIds = saved.rejectedIds;
    if (saved.filters) {
      state.filters = { ...cloneDefaults(), ...saved.filters };
    }
  } catch (e) {
    console.warn('failed to load state', e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    likedIds: state.likedIds,
    rejectedIds: state.rejectedIds,
    filters: state.filters
  }));
}

// ---------- Queue ----------
function rebuildQueue() {
  const seen = new Set([...state.likedIds, ...state.rejectedIds]);
  const candidates = window.RECIPES.filter(
    r => !seen.has(r.id) && matchesFilter(r, state.filters)
  );
  state.queue = shuffle(candidates);
  state.cursor = 0;
}

// ---------- Header / Nav updates ----------
function updateHeader() {
  document.getElementById('open-filter').classList.toggle('has-dot', isFilterActive(state.filters));
}

function updateNav() {
  document.querySelectorAll('.app-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === state.tab);
  });
  const liked = state.likedIds.length;
  document.getElementById('liked-label').textContent =
    liked > 0 ? `お気に入り (${liked})` : 'お気に入り';
}

// ---------- Render ----------
function render() {
  updateHeader();
  updateNav();
  const main = document.getElementById('main');
  main.innerHTML = '';
  if (state.tab === 'swipe') renderSwipe(main);
  else if (state.tab === 'liked') renderLiked(main);
  else renderMaterials(main);
}

// ---------- Swipe view ----------
function cardHTML(recipe, stackPos, isTop) {
  const stackClass = stackPos === 0 ? 'is-top' : `stack-${stackPos}`;
  const cat = CATEGORY_LABELS[recipe.category] || recipe.category;
  const time = recipe.indication && recipe.indication !== '指定なし'
    ? `<span class="badge">⏱ ${escapeHtml(recipe.indication)}</span>` : '';
  const cost = recipe.cost && recipe.cost !== '指定なし'
    ? `<span class="badge">💰 ${escapeHtml(recipe.cost)}</span>` : '';
  const spicy = recipe.spicy ? '<span class="badge spicy">🌶 辛い</span>' : '';
  const desc = recipe.description
    ? `<p class="card-desc">${escapeHtml(recipe.description)}</p>` : '';
  const mats = recipe.materials && recipe.materials.length
    ? `<details class="card-materials">
        <summary>材料 (${recipe.materials.length}品)</summary>
        <ul>${recipe.materials.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
       </details>` : '';
  const overlays = isTop
    ? `<div class="overlay overlay-like">LIKE</div>
       <div class="overlay overlay-nope">NOPE</div>` : '';

  return `
    <div class="card ${stackClass}" data-id="${recipe.id}">
      <div class="card-image-wrap">
        <img src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}"
             draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-image-fallback',textContent:'画像なし'}))">
      </div>
      <div class="card-body">
        <h2 class="card-title">${escapeHtml(recipe.title)}</h2>
        <div class="badges">
          <span class="badge">${cat}</span>
          ${time}${cost}${spicy}
        </div>
        ${desc}
        ${mats}
      </div>
      ${overlays}
    </div>`;
}

function renderSwipe(main) {
  const visible = state.queue.slice(state.cursor, state.cursor + 3);

  if (visible.length === 0) {
    const filterActive = isFilterActive(state.filters);
    main.innerHTML = `
      <div class="swipe-empty">
        ${filterActive
          ? `<p>条件に合うレシピがもうありません。</p>
             <div class="empty-actions">
               <button class="primary" id="empty-open-filter">フィルタを変更</button>
               <button class="secondary" id="empty-reset">履歴をリセット</button>
             </div>`
          : `<p>すべてのレシピをチェックしました！</p>
             <button class="primary" id="empty-reset">履歴をリセットして最初から</button>`}
      </div>`;
    const ef = document.getElementById('empty-open-filter');
    if (ef) ef.onclick = openFilter;
    document.getElementById('empty-reset').onclick = resetHistory;
    return;
  }

  const remaining = state.queue.length - state.cursor;
  const filterActive = isFilterActive(state.filters);
  // Render bottom→top so the top card is the last in DOM (highest z-index by default).
  const cardsHTML = visible
    .slice().reverse()
    .map((r, idx) => {
      const stackPos = visible.length - 1 - idx;
      return cardHTML(r, stackPos, stackPos === 0);
    }).join('');

  main.innerHTML = `
    <div class="swipe-container">
      <div class="swipe-meta">
        残り <strong>${remaining}</strong> 件
        ${filterActive ? '<span class="filter-tag">フィルタ中</span>' : ''}
      </div>
      <div class="card-stack" id="card-stack">${cardsHTML}</div>
      <div class="actions">
        <button class="action-btn nope" id="btn-nope" aria-label="気に入らない">✕</button>
        <button class="action-btn like" id="btn-like" aria-label="気に入った">♥</button>
      </div>
    </div>`;

  document.getElementById('btn-nope').onclick = () => triggerSwipe('left');
  document.getElementById('btn-like').onclick = () => triggerSwipe('right');
}

// ---------- Drag / swipe gesture (interact.js) ----------
const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600; // px/s

function setupSwipeInteract() {
  interact('.card.is-top').draggable({
    inertia: false,
    ignoreFrom: 'details, summary',
    listeners: {
      start(event) {
        const card = event.target;
        card.dataset.dx = '0';
        card.classList.add('dragging');
        card.style.transition = 'none';
      },
      move(event) {
        const card = event.target;
        const dx = (parseFloat(card.dataset.dx) || 0) + event.dx;
        card.dataset.dx = String(dx);
        card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        const like = card.querySelector('.overlay-like');
        const nope = card.querySelector('.overlay-nope');
        if (!like || !nope) return;
        if (dx > 0) {
          like.style.opacity = Math.max(0, Math.min(1, (dx - 40) / 100));
          nope.style.opacity = 0;
        } else {
          nope.style.opacity = Math.max(0, Math.min(1, (-dx - 40) / 100));
          like.style.opacity = 0;
        }
      },
      end(event) {
        const card = event.target;
        card.classList.remove('dragging');
        const dx = parseFloat(card.dataset.dx) || 0;
        const vx = event.velocityX || 0;

        if (dx > SWIPE_DISTANCE || vx > SWIPE_VELOCITY) {
          flyOff(card, 'right');
        } else if (dx < -SWIPE_DISTANCE || vx < -SWIPE_VELOCITY) {
          flyOff(card, 'left');
        } else {
          card.style.transition = 'transform 0.2s ease';
          card.style.transform = '';
          card.dataset.dx = '0';
          const like = card.querySelector('.overlay-like');
          const nope = card.querySelector('.overlay-nope');
          if (like) like.style.opacity = 0;
          if (nope) nope.style.opacity = 0;
        }
      }
    }
  });
}

function triggerSwipe(direction) {
  const top = document.querySelector('.card.is-top');
  if (!top) return;
  flyOff(top, direction);
}

function flyOff(card, direction) {
  const overlay = card.querySelector(direction === 'right' ? '.overlay-like' : '.overlay-nope');
  if (overlay) overlay.style.opacity = 1;
  const tx = direction === 'right' ? 600 : -600;
  const rot = direction === 'right' ? 18 : -18;
  card.style.transition = 'transform 0.28s ease-out, opacity 0.28s ease-out';
  card.style.transform = `translateX(${tx}px) rotate(${rot}deg)`;
  card.style.opacity = '0';

  // Lock the top card so a fast follow-up tap doesn't double-fire on it.
  card.classList.remove('is-top');

  const id = parseInt(card.dataset.id, 10);
  setTimeout(() => {
    if (direction === 'right') {
      if (!state.likedIds.includes(id)) state.likedIds.push(id);
    } else {
      if (!state.rejectedIds.includes(id)) state.rejectedIds.push(id);
    }
    state.cursor++;
    saveState();
    render();
  }, 280);
}

// ---------- Liked view ----------
function renderLiked(main) {
  const liked = state.likedIds.map(recipeById).filter(Boolean);
  if (liked.length === 0) {
    main.innerHTML = `<div class="empty-state">
      まだお気に入りがありません。<br>
      スワイプ画面で気に入ったレシピを右にスワイプしましょう。
    </div>`;
    return;
  }
  const items = liked.map(r => {
    const cat = CATEGORY_LABELS[r.category] || r.category;
    const time = r.indication && r.indication !== '指定なし'
      ? `<span>⏱ ${escapeHtml(r.indication)}</span>` : '';
    return `
      <div class="liked-item" data-id="${r.id}">
        <a class="liked-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title)}" loading="lazy">
          <div class="liked-info">
            <h3>${escapeHtml(r.title)}</h3>
            <div class="badges-sm"><span>${cat}</span>${time}</div>
          </div>
        </a>
        <button class="remove-btn" data-id="${r.id}" aria-label="お気に入りから外す" title="お気に入りから外す">×</button>
      </div>`;
  }).join('');
  main.innerHTML = `<div class="liked-list">${items}</div>`;
  main.querySelectorAll('.remove-btn').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.id, 10);
      state.likedIds = state.likedIds.filter(x => x !== id);
      saveState();
      render();
    };
  });
}

// ---------- Materials view ----------
function renderMaterials(main) {
  const liked = state.likedIds.map(recipeById).filter(Boolean);
  if (liked.length === 0) {
    main.innerHTML = `<div class="empty-state">
      お気に入りに追加すると、必要な材料がここに集計されます。
    </div>`;
    return;
  }
  const map = new Map();
  for (const r of liked) {
    for (const raw of r.materials || []) {
      const name = normalizeMaterial(raw);
      if (!name) continue;
      const ex = map.get(name) || { count: 0 };
      ex.count++;
      map.set(name, ex);
    }
  }
  const sorted = [...map.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ja')
  );

  const items = sorted.map(([name, info]) => {
    const checked = state.materialsChecked.has(name);
    return `<li class="${checked ? 'checked' : ''}" data-name="${escapeHtml(name)}">
      <label>
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span class="m-name">${escapeHtml(name)}</span>
        ${info.count > 1 ? `<span class="m-count">×${info.count}</span>` : ''}
      </label>
    </li>`;
  }).join('');

  main.innerHTML = `
    <div class="materials-view">
      <div class="materials-summary">
        <div><strong>${liked.length}</strong> レシピ ／ <strong>${sorted.length}</strong> 種類の材料</div>
        <button class="copy-btn" id="copy-btn">📋 コピー</button>
      </div>
      <ul class="materials-list">${items}</ul>
    </div>`;

  document.getElementById('copy-btn').onclick = async () => {
    const text = sorted.map(([name, info]) =>
      info.count > 1 ? `${name} ×${info.count}` : name
    ).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('材料リストをコピーしました');
    } catch {
      alert('コピーに失敗しました');
    }
  };

  main.querySelectorAll('.materials-list input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      const li = cb.closest('li');
      const name = li.dataset.name;
      if (cb.checked) state.materialsChecked.add(name);
      else state.materialsChecked.delete(name);
      li.classList.toggle('checked', cb.checked);
    };
  });
}

// ---------- Filter sheet ----------
function openFilter() {
  draftFilters = JSON.parse(JSON.stringify(state.filters));
  renderFilterBody();
  document.getElementById('sheet-overlay').classList.remove('hidden');
}

function closeFilter() {
  document.getElementById('sheet-overlay').classList.add('hidden');
}

function renderFilterBody() {
  const body = document.getElementById('sheet-body');

  const sectionHTML = (title, content) => `
    <section class="filter-section">
      ${title ? `<h3>${title}</h3>` : ''}
      <div class="chips">${content}</div>
    </section>`;

  const chip = (active, dataKey, dataValue, label) => `
    <button type="button" class="chip ${active ? 'active' : ''}"
            data-key="${dataKey}" data-value="${escapeHtml(String(dataValue))}">
      ${escapeHtml(label)}
    </button>`;

  const catChips = CATEGORY_OPTIONS.map(o =>
    chip(draftFilters.categories.includes(o.id), 'categories', o.id, o.label)
  ).join('');
  const timeChips = TIME_OPTIONS.map(t =>
    chip(draftFilters.times.includes(t), 'times', t, t)
  ).join('');
  const costChips = COST_OPTIONS.map(o =>
    chip(draftFilters.costBuckets.includes(o.id), 'costBuckets', o.id, o.label)
  ).join('');

  body.innerHTML = `
    ${sectionHTML('カテゴリ', catChips)}
    ${sectionHTML('調理時間', timeChips)}
    ${sectionHTML('コスト', costChips)}
    <section class="filter-section">
      <label class="switch-row">
        <input type="checkbox" id="exclude-spicy" ${draftFilters.excludeSpicy ? 'checked' : ''}>
        <span>辛いレシピを除外する</span>
      </label>
    </section>`;

  body.querySelectorAll('.chip').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const value = btn.dataset.value;
      const arr = draftFilters[key];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(value);
      btn.classList.toggle('active');
      updateApplyButton();
    };
  });
  body.querySelector('#exclude-spicy').onchange = (e) => {
    draftFilters.excludeSpicy = e.target.checked;
    updateApplyButton();
  };

  updateApplyButton();
}

function updateApplyButton() {
  const seen = new Set([...state.likedIds, ...state.rejectedIds]);
  const count = window.RECIPES.filter(
    r => !seen.has(r.id) && matchesFilter(r, draftFilters)
  ).length;
  const apply = document.getElementById('filter-apply');
  apply.textContent = `${count}件を見る`;
  apply.disabled = count === 0;
}

function applyFilter() {
  state.filters = draftFilters;
  rebuildQueue();
  saveState();
  closeFilter();
  render();
}

function resetDraftFilters() {
  draftFilters = cloneDefaults();
  renderFilterBody();
}

// ---------- Reset history ----------
function resetHistory() {
  if (!confirm('スワイプ履歴とお気に入りを全部消して最初からやり直しますか？')) return;
  state.likedIds = [];
  state.rejectedIds = [];
  state.materialsChecked = new Set();
  rebuildQueue();
  saveState();
  render();
}

// ---------- Init ----------
function init() {
  loadState();
  rebuildQueue();
  setupSwipeInteract();
  render();

  document.querySelectorAll('.app-nav button').forEach(btn => {
    btn.onclick = () => { state.tab = btn.dataset.tab; render(); };
  });

  document.getElementById('open-filter').onclick = openFilter;
  document.getElementById('sheet-close').onclick = closeFilter;
  document.getElementById('sheet-overlay').onclick = e => {
    if (e.target.id === 'sheet-overlay') closeFilter();
  };
  document.getElementById('filter-apply').onclick = applyFilter;
  document.getElementById('filter-reset').onclick = resetDraftFilters;
  document.getElementById('reset-history').onclick = resetHistory;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
