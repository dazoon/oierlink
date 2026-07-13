/* ============================================
   信奥导航站 - 主应用逻辑
   数据驱动渲染 + 搜索 + 提交
   ============================================ */

(function(){
  'use strict';

  // ====== 配置 ======
  const CONFIG = {
    // Cloudflare Worker API 地址（部署后填入）
    workerApi: '',
    dataBase: './data/'
  };

  // ====== 导航栏目配置 ======
  const NAV_ITEMS = [
    { id: 'home', name: '首页', icon: '🏠', href: 'index.html' },
    { id: 'news', name: '信奥新闻', icon: '📰', href: 'news.html' },
    { id: 'share', name: '参赛分享', icon: '✍️', href: 'share.html' },
    { id: 'gzh', name: '公众号文章', icon: '📱', href: 'gzh.html' },
    { id: 'players', name: '信奥选手', icon: '🏅', href: 'https://oier.baoshuo.dev/oiers', external: true }
  ];

  // ====== 全局数据 ======
  let allLinks = { categories: [] };
  let allNews = [];
  let allPlayers = [];
  let allGzh = [];
  let allShare = [];
  let featuredGzh = [];
  let pendingSubmissions = [];

  // ====== 本地自定义链接（localStorage，仅自己可见） ======
  const LOCAL_KEY = 'oierlink_my_links';
  let myLinks = [];
  function loadMyLinks() {
    try { myLinks = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch(e) { myLinks = []; }
  }
  function saveMyLinks() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(myLinks)); } catch(e) {}
  }
  function addMyLink(name, url, cat) {
    myLinks.unshift({ id: Date.now(), name: name, url: url, cat: cat || 'other', added: new Date().toISOString().slice(0,10) });
    saveMyLinks();
  }
  function removeMyLink(id) {
    myLinks = myLinks.filter(function(l){ return l.id !== id; });
    saveMyLinks();
  }

  // ====== 数据加载 ======
  async function loadJSON(path) {
    try {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch(e) {
      console.warn('Failed to load ' + path + ': ' + e.message);
      return null;
    }
  }

  async function loadAllData() {
    const [links, news, players, gzh, share, featured] = await Promise.all([
      loadJSON(CONFIG.dataBase + 'links.json'),
      loadJSON(CONFIG.dataBase + 'news.json'),
      loadJSON(CONFIG.dataBase + 'players.json'),
      loadJSON(CONFIG.dataBase + 'gzh.json'),
      loadJSON(CONFIG.dataBase + 'share.json'),
      loadJSON(CONFIG.dataBase + 'gzh_featured.json')
    ]);
    if (links) allLinks = links;
    if (news) allNews = news;
    if (players) allPlayers = players;
    if (gzh) allGzh = gzh;
    if (share) allShare = share;
    if (featured) featuredGzh = featured;
  }

  // ====== 导航栏渲染 ======
  function renderNavBar() {
    const navEl = document.getElementById('nav-bar');
    if (!navEl) return;

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const onHome = currentPage === 'index.html' || currentPage === '';
    let html = '<div class="site-nav-inner">';

    NAV_ITEMS.forEach(function(item){
      const isExternal = item.external;
      const isActive = !isExternal && currentPage === item.href;
      html += '<a href="' + item.href + '" class="nav-link' +
              (isActive ? ' active' : '') +
              (isExternal ? ' external' : '') + '"' +
              (isExternal ? ' target="_blank" rel="noopener"' : '') + '>' +
              item.icon + ' ' + item.name;
      if (isExternal) html += ' <span class="external-icon">↗</span>';
      html += '</a>';
    });

    if (onHome) {
      html += '<button id="nav-add-link" class="btn btn-primary btn-sm" style="margin-left:auto;">+ 添加链接</button>';
    }

    html += '</div>';
    navEl.innerHTML = html;
  }

  // ====== Worker API 加载（如有配置） ======
  async function loadWorkerData() {
    if (!CONFIG.workerApi) return;
    try {
      const resp = await fetch(CONFIG.workerApi + '/api/links?status=approved');
      if (!resp.ok) return;
      const workerLinks = await resp.json();
      // 合并 Worker 数据到 allLinks（追加到"网友推荐"分类）
      if (workerLinks && workerLinks.length > 0) {
        mergeWorkerLinks(workerLinks);
      }
    } catch(e) {
      console.warn('Worker API unavailable: ' + e.message);
    }
  }

  function mergeWorkerLinks(workerLinks) {
    let userCat = allLinks.categories.find(function(c){ return c.id === 'user-submitted'; });
    if (!userCat) {
      userCat = { id: 'user-submitted', name: '网友推荐', icon: '🌟', links: [] };
      allLinks.categories.push(userCat);
    }
    workerLinks.forEach(function(link){
      // 去重
      const exists = allLinks.categories.some(function(cat){
        return cat.links.some(function(l){ return l.url === link.url; });
      });
      if (!exists) {
        userCat.links.push({ name: link.name, url: link.url, desc: link.desc || '网友推荐' });
      }
    });
  }

  // ====== 统计 ======
  function updateStats() {
    let totalLinks = 0;
    allLinks.categories.forEach(function(cat){ totalLinks += cat.links.length; });
    totalLinks += myLinks.length;

    const el = document.getElementById('stats-container');
    if (!el) return;
    var catCount = allLinks.categories.length + (myLinks.length > 0 ? 1 : 0);
    el.innerHTML =
      '<div class="stat-item">' +
        '<span class="stat-icon">🔗</span>' +
        '<div><div class="stat-num">' + totalLinks + '</div><div class="stat-label">网址链接</div></div>' +
      '</div>' +
      '<div class="stat-item">' +
        '<span class="stat-icon">📂</span>' +
        '<div><div class="stat-num">' + catCount + '</div><div class="stat-label">分类</div></div>' +
      '</div>' +
      '<div class="stat-item">' +
        '<span class="stat-icon">📌</span>' +
        '<div><div class="stat-num">' + myLinks.length + '</div><div class="stat-label">我的链接</div></div>' +
      '</div>' +
      '<div class="stat-item">' +
        '<span class="stat-icon">⏳</span>' +
        '<div><div class="stat-num">' + allNews.length + '</div><div class="stat-label">信奥新闻</div></div>' +
      '</div>';
  }

  // ====== 导航渲染 ======
  function renderNavLinks(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    var catNames = {oj:'刷题 OJ',learn:'学习资源',tools:'在线工具 & 题解',other:'其他'};
    let html = '';

    allLinks.categories.forEach(function(cat){
      var myCatLinks = myLinks.filter(function(l){ return l.cat === cat.id; });
      if (cat.links.length === 0 && myCatLinks.length === 0) return;
      html += '<div class="card" data-category="' + cat.id + '">';
      html += '<div class="card-header"><h3>' + cat.icon + ' ' + cat.name + '</h3></div>';
      html += '<div class="nav-grid">';
      html += '<div class="nav-row">';
      html += '<span class="row-label">' + cat.name + '</span>';

      // 内置链接
      cat.links.forEach(function(link){
        html += '<a href="' + link.url + '" class="nav-tag" target="_blank" rel="noopener" data-searchable="' +
                link.name + ' ' + (link.desc||'') + '">' +
                link.name + '</a>';
      });

      // 自定义链接（混排在内置链接后面，悬停显示删除）
      myCatLinks.forEach(function(link){
        html += '<span class="nav-tag my-link-tag">';
        html += '<a href="' + link.url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">' + link.name + '</a>';
        html += '<button class="btn-del-link" data-id="' + link.id + '" title="删除">×</button>';
        html += '</span>';
      });

      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    // 处理"其他"分类的自定义链接（不在已有分类中的）
    var otherLinks = myLinks.filter(function(l){
      return !allLinks.categories.some(function(c){ return c.id === l.cat; });
    });
    if (otherLinks.length > 0) {
      html += '<div class="card" data-category="other">';
      html += '<div class="card-header"><h3>📌 其他</h3></div>';
      html += '<div class="nav-grid"><div class="nav-row">';
      html += '<span class="row-label">其他</span>';
      otherLinks.forEach(function(link){
        html += '<span class="nav-tag my-link-tag">';
        html += '<a href="' + link.url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">' + link.name + '</a>';
        html += '<button class="btn-del-link" data-id="' + link.id + '" title="删除">×</button>';
        html += '</span>';
      });
      html += '</div></div></div>';
    }

    // 纯自定义链接的分类
    var knownIds = allLinks.categories.map(function(c){return c.id;}).concat(['other']);
    var orphanCats = [];
    var seen = {};
    myLinks.forEach(function(l){
      if (!knownIds.includes(l.cat) && !seen[l.cat]) {
        seen[l.cat] = true;
        orphanCats.push(l.cat);
      }
    });
    orphanCats.forEach(function(catId){
      var links = myLinks.filter(function(l){ return l.cat === catId; });
      if (links.length === 0) return;
      html += '<div class="card"><div class="card-header"><h3>📌 ' + catId + '</h3></div>';
      html += '<div class="nav-grid"><div class="nav-row">';
      html += '<span class="row-label">' + catId + '</span>';
      links.forEach(function(link){
        html += '<span class="nav-tag my-link-tag">';
        html += '<a href="' + link.url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">' + link.name + '</a>';
        html += '<button class="btn-del-link" data-id="' + link.id + '" title="删除">×</button>';
        html += '</span>';
      });
      html += '</div></div></div>';
    });

    el.innerHTML = html;

    // 绑定删除按钮事件
    el.querySelectorAll('.btn-del-link').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = parseInt(btn.getAttribute('data-id'));
        removeMyLink(id);
        renderNavLinks(containerId);
      });
    });
  }

  // ====== 新闻渲染 ======
  function renderNews(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (allNews.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:#86909c;">暂无新闻</div>';
      return;
    }
    let html = '<ul class="news-list">';
    allNews.forEach(function(item){
      html += '<li class="news-item">';
      html += '<span class="news-source">' + (item.source || '资讯') + '</span>';
      html += '<a href="' + item.url + '" target="_blank" rel="noopener">' + item.title + '</a>';
      html += '<span class="news-date">' + (item.date || '') + '</span>';
      html += '</li>';
    });
    html += '</ul>';
    el.innerHTML = html;
  }

  // ====== 选手渲染 ======
  function renderPlayers(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (allPlayers.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:#86909c;">暂无选手数据，<a href="submit.html?type=player">推荐选手</a></div>';
      return;
    }
    let html = '<div class="players-grid">';
    allPlayers.forEach(function(p){
      const initial = p.name.charAt(0);
      let badgeClass = '';
      if (p.badge && (p.badge.includes('IOI') || p.badge.includes('NOI') || p.badge.includes('国家队'))) badgeClass = ' gold';
      else if (p.badge && p.badge.includes('NOIP')) badgeClass = ' silver';

      html += '<a href="' + (p.url || '#') + '" class="player-card" target="_blank" rel="noopener">';
      html += '<div class="player-avatar">' + initial + '</div>';
      html += '<div class="player-info">';
      html += '<div class="player-name">' + p.name + '</div>';
      html += '<div class="player-desc">' + (p.title || '') + '</div>';
      html += '</div>';
      if (p.badge) html += '<span class="player-badge' + badgeClass + '">' + p.badge + '</span>';
      html += '</a>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  // ====== 公众号文章渲染（gzh.html 独立页） ======
  function renderGzhArticles() {
    const containerId = 'page-content';
    const existing = document.getElementById(containerId);
    if (!existing) return;

    var articles = featuredGzh.length > 0 ? featuredGzh : allGzh.slice(0, 20);
    if (allGzh.length === 0) {
      existing.innerHTML = '<div style="text-align:center;padding:40px;color:#86909c;">暂无公众号文章</div>';
      return;
    }

    let html = '<div class="card">';
    html += '<div class="card-header" style="gap:10px;">';
    html += '<h3>📱 信奥公众号文章</h3>';
    html += '<input type="search" id="gzh-search-input" placeholder="搜索公众号文章..." style="margin-left:auto;padding:6px 10px;border:1px solid #e5e6eb;border-radius:6px;font-size:13px;min-width:180px;max-width:260px;">';
    html += '</div>';
    html += '<div id="gzh-article-list"></div>';
    html += '<div style="text-align:center;padding:20px 0 12px;color:#86909c;font-size:13px;border-top:1px dashed #e5e6eb;margin-top:12px;">更多内容请通过搜索查询</div>';
    html += '<div style="text-align:center;padding:0 0 16px;color:#86909c;font-size:13px;">欢迎链接投稿，投稿请公众号联系</div>';
    html += '</div>';
    existing.innerHTML = html;

    renderGzhList(articles, '');

    var input = document.getElementById('gzh-search-input');
    if (input) {
      input.addEventListener('input', function(){
        var q = input.value.trim().toLowerCase();
        if (q.length === 0) {
          renderGzhList(featuredGzh.length > 0 ? featuredGzh : allGzh.slice(0, 20), '');
          return;
        }
        var filtered = allGzh.filter(function(item){
          return (item.title && item.title.toLowerCase().includes(q)) ||
                 (item.source && item.source.toLowerCase().includes(q));
        });
        renderGzhList(filtered, q);
      });
    }
  }

  function renderGzhList(articles, query) {
    var listEl = document.getElementById('gzh-article-list');
    if (!listEl) return;

    if (articles.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:30px;color:#86909c;">未找到“' + query + '”相关文章</div>';
      return;
    }

    let html = '<ul class="news-list">';
    articles.forEach(function(item){
      html += '<li class="news-item">';
      html += '<span class="news-source">' + (item.source || '公众号') + '</span>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<a href="' + item.url + '" target="_blank" rel="noopener" style="font-weight:600;">' + item.title + '</a>';
      html += '</div>';
      html += '<span class="news-date">' + (item.date || '') + '</span>';
      html += '</li>';
    });
    html += '</ul>';
    listEl.innerHTML = html;
  }

  // ====== 参赛分享独立页渲染 ======
  function renderSharePage() {
    const containerId = 'page-content';
    const existing = document.getElementById(containerId);
    if (!existing) return;
    if (!allShare || allShare.length === 0) {
      existing.innerHTML = '<div style="text-align:center;padding:40px;color:#86909c;">暂无参赛分享</div>';
      return;
    }

    let total = 0;
    allShare.forEach(function(g){ total += g.articles.length; });

    let html = '<div class="card"><div class="card-header"><h3>✍️ 参赛分享</h3><span style="font-size:13px;color:var(--text-secondary);">共 ' + total + ' 篇</span></div>';
    html += '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.8;">数据来源：<a href="https://www.noi.cn/jlfx/" target="_blank" rel="noopener">NOI官网 · 交流分享栏目</a>，含 IOI（国际信息学奥林匹克）与 ISIJ（国际初中生信息学竞赛）中国队选手参赛总结。</p>';

    allShare.forEach(function(group){
      html += '<div style="margin-bottom:20px;">';
      html += '<h4 style="font-size:15px;font-weight:700;color:var(--primary);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border);">📅 ' + group.label + ' <span style="font-weight:400;font-size:12px;color:var(--text-secondary);">（' + group.articles.length + '篇）</span></h4>';
      html += '<ul class="news-list">';
      group.articles.forEach(function(item){
        html += '<li class="news-item">';
        html += '<span class="news-source">IOI/ISIJ</span>';
        html += '<a href="' + item.url + '" target="_blank" rel="noopener">' + item.title + '</a>';
        html += '<span class="news-date">' + item.date + '</span>';
        html += '</li>';
      });
      html += '</ul>';
      html += '</div>';
    });

    html += '</div>';
    existing.innerHTML = html;
  }

  // ====== 信奥新闻独立页渲染 ======
  function renderNewsPage() {
    const containerId = 'page-content';
    const existing = document.getElementById(containerId);
    if (!existing) return;
    if (allNews.length === 0) {
      existing.innerHTML = '<div style="text-align:center;padding:40px;color:#86909c;">暂无新闻</div>';
      return;
    }
    let html = '<div class="card"><div class="card-header"><h3>📰 信奥新闻</h3></div><ul class="news-list">';
    allNews.forEach(function(item){
      html += '<li class="news-item">';
      html += '<span class="news-source">' + (item.source || '资讯') + '</span>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<a href="' + item.url + '" target="_blank" rel="noopener" style="font-weight:600;">' + item.title + '</a>';
      if (item.desc) html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + item.desc + '</div>';
      html += '</div>';
      html += '<span class="news-date">' + (item.date || '') + '</span>';
      html += '</li>';
    });
    html += '</ul></div>';
    existing.innerHTML = html;
  }

  // ====== 搜索功能 ======
  function initSearch() {
    const input = document.getElementById('search-input');
    const form = document.getElementById('search-form');
    if (!input || !form) return;

    form.addEventListener('submit', function(e){
      e.preventDefault();
      const query = input.value.trim().toLowerCase();
      if (!query) return;
      searchAcrossSite(query);
    });

    // 实时搜索
    input.addEventListener('input', function(){
      const query = input.value.trim().toLowerCase();
      if (query.length >= 2) {
        highlightSearch(query);
      } else {
        clearHighlight();
      }
    });
  }

  function searchAcrossSite(query) {
    // 搜索链接
    let results = [];
    allLinks.categories.forEach(function(cat){
      cat.links.forEach(function(link){
        if (link.name.toLowerCase().includes(query) || (link.desc && link.desc.toLowerCase().includes(query))) {
          results.push({ type: 'link', name: link.name, url: link.url, desc: link.desc, category: cat.name });
        }
      });
    });

    // 搜索本地自定义链接
    myLinks.forEach(function(link){
      if (link.name.toLowerCase().includes(query) || link.url.toLowerCase().includes(query)) {
        results.push({ type: 'my-link', name: link.name, url: link.url, desc: '我的链接', category: '我的链接' });
      }
    });

    // 搜索新闻
    allNews.forEach(function(item){
      if (item.title.toLowerCase().includes(query) || (item.source && item.source.toLowerCase().includes(query))) {
        results.push({ type: 'news', name: item.title, url: item.url, desc: item.source, category: '信奥新闻' });
      }
    });

    // 搜索公众号文章
    allGzh.forEach(function(item){
      if (item.title.toLowerCase().includes(query) || (item.source && item.source.toLowerCase().includes(query))) {
        results.push({ type: 'gzh', name: item.title, url: item.url, desc: item.source, category: '公众号文章' });
      }
    });

    showSearchResults(results, query);
  }

  function showSearchResults(results, query) {
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 用简单弹窗展示结果
    let html = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;">';
    html += '<div style="background:#fff;border-radius:12px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.2);">';
    html += '<div style="padding:20px 24px;border-bottom:1px solid #e5e6eb;display:flex;justify-content:space-between;align-items:center;">';
    html += '<h3 style="margin:0;">🔍 搜索「' + query + '」结果 (' + results.length + '条)</h3>';
    html += '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#86909c;">✕</button>';
    html += '</div>';
    html += '<div style="padding:16px 24px;">';

    if (results.length === 0) {
      html += '<p style="text-align:center;color:#86909c;padding:20px;">未找到匹配结果，试试其他关键词</p>';
    } else {
      html += '<ul class="news-list">';
      results.forEach(function(r){
        html += '<li class="news-item">';
        html += '<span class="news-source">' + r.category + '</span>';
        html += '<a href="' + r.url + '" target="_blank">' + r.name + '</a>';
        html += '<span class="news-date" style="font-size:11px;">' + (r.desc || '') + '</span>';
        html += '</li>';
      });
      html += '</ul>';
    }

    html += '</div></div></div>';

    const overlay = document.createElement('div');
    overlay.innerHTML = html;
    document.body.appendChild(overlay.firstElementChild);

    // 点击背景关闭
    const bg = document.querySelector('div[style*="fixed"]');
    if (bg) {
      bg.addEventListener('click', function(e){
        if (e.target === bg) bg.remove();
      });
    }
  }

  function highlightSearch(query) {
    document.querySelectorAll('[data-searchable], .nav-tag, .news-item a, .player-card').forEach(function(el){
      const text = (el.textContent || '').toLowerCase();
      if (text.includes(query)) {
        el.style.outline = '2px solid #165DFF';
        el.style.outlineOffset = '2px';
        el.setAttribute('data-highlighted', 'true');
      } else {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.removeAttribute('data-highlighted');
      }
    });
  }

  function clearHighlight() {
    document.querySelectorAll('[data-highlighted]').forEach(function(el){
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.removeAttribute('data-highlighted');
    });
  }

  // ====== 提交表单处理 ======
  function initSubmitForm() {
    const form = document.getElementById('submit-form');
    if (!form) return;

    const msgEl = document.getElementById('submit-msg');

    // URL参数预填分类
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('type');
    if (typeParam) {
      const typeSelect = document.getElementById('submit-type');
      if (typeSelect) typeSelect.value = typeParam;
    }

    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中...';

      const formData = {
        type: document.getElementById('submit-type').value,
        name: document.getElementById('submit-name').value.trim(),
        url: document.getElementById('submit-url').value.trim(),
        desc: (document.getElementById('submit-desc')||{}).value || '',
        category: (document.getElementById('submit-category')||{}).value || '',
        submittedAt: new Date().toISOString()
      };

      // 验证
      if (!formData.name || !formData.url) {
        showMsg(msgEl, '请填写名称和网址', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交';
        return;
      }

      if (!formData.url.startsWith('http')) {
        showMsg(msgEl, '网址必须以 http:// 或 https:// 开头', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交';
        return;
      }

      // 尝试 Worker API
      if (CONFIG.workerApi) {
        try {
          const resp = await fetch(CONFIG.workerApi + '/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
          if (resp.ok) {
            showMsg(msgEl, '✅ 提交成功！审核通过后将展示在导航站。', 'success');
            form.reset();
          } else {
            throw new Error('Server error');
          }
        } catch(e) {
          showMsg(msgEl, '⚠️ 自动提交暂不可用，已保存到本地。管理员将手动处理。', 'info');
          saveLocalSubmission(formData);
          form.reset();
        }
      } else {
        // Worker 未配置，使用本地存储
        saveLocalSubmission(formData);
        showMsg(msgEl, '📋 已保存！提交 API 暂未配置，管理员将手动审核后上线。', 'info');
        form.reset();
      }

      submitBtn.disabled = false;
      submitBtn.textContent = '提交';
    });
  }

  function saveLocalSubmission(data) {
    try {
      const stored = JSON.parse(localStorage.getItem('oierlink_submissions') || '[]');
      stored.push(data);
      localStorage.setItem('oierlink_submissions', JSON.stringify(stored));
      pendpendingSubmissions = stored;
    } catch(e) {
      console.warn('localStorage save failed');
    }
  }

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'status-msg ' + type;
    el.style.display = 'block';
    setTimeout(function(){ el.style.display = 'none'; }, 5000);
  }

  // ====== file:// 协议检测 ======
  function isFileProtocol() {
    return window.location.protocol === 'file:';
  }

  // ====== 显示加载错误提示 ======
  function showDataError(containerId, msg) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#86909c;line-height:1.8;">' +
      '<div style="font-size:40px;margin-bottom:12px;">📡</div>' +
      '<div style="font-weight:600;font-size:15px;margin-bottom:4px;">' + (msg || '数据加载失败') + '</div>' +
      '<div style="font-size:12px;">部署到 Cloudflare Pages 后将自动修复</div>' +
      '</div>';
  }

  // ====== 本地添加链接表单 ======
  function initAddLinkForm() {
    var btnOld = document.getElementById('btn-add-link');
    var btnNav = document.getElementById('nav-add-link');
    var formEl = document.getElementById('add-link-form');
    var btnCancel = document.getElementById('btn-cancel-add');
    var btnSave = document.getElementById('btn-save-link');
    var nameInp = document.getElementById('my-link-name');
    var urlInp = document.getElementById('my-link-url');
    var catSel = document.getElementById('my-link-cat');
    var msgEl = document.getElementById('add-link-msg');

    if (!formEl) return;

    function openForm() {
      formEl.style.display = 'block';
      nameInp.focus();
    }
    if (btnOld) btnOld.addEventListener('click', openForm);
    if (btnNav) btnNav.addEventListener('click', openForm);
    btnCancel.addEventListener('click', function(){
      formEl.style.display = 'none';
      nameInp.value = '';
      urlInp.value = '';
      if (msgEl) msgEl.style.display = 'none';
    });
    btnSave.addEventListener('click', function(){
      var name = nameInp.value.trim();
      var url = urlInp.value.trim();
      if (!name || !url) {
        if (msgEl) { msgEl.textContent = '请填写名称和网址'; msgEl.style.color = '#c0392b'; msgEl.style.display = 'block'; }
        return;
      }
      if (!url.startsWith('http')) {
        if (msgEl) { msgEl.textContent = '网址必须以 http:// 或 https:// 开头'; msgEl.style.color = '#c0392b'; msgEl.style.display = 'block'; }
        return;
      }
      addMyLink(name, url, catSel.value);
      renderNavLinks('nav-links-container');
      updateStats();
      formEl.style.display = 'none';
      nameInp.value = '';
      urlInp.value = '';
      if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; }
    });
  }

  // ====== 初始化 ======
  async function init() {
    // 导航栏始终渲染（不依赖数据）
    renderNavBar();

    // 加载本地自定义链接（即使 file:// 也能加载）
    loadMyLinks();

    // 绑定添加链接表单（即使 file:// 也能操作）
    initAddLinkForm();

    // 检测 file:// 协议
    if (isFileProtocol()) {
      showDataError('nav-links-container', '⚠️ 请通过 HTTP 服务器访问本页面');
      showDataError('news-container', 'file:// 协议不支持数据加载');
      showDataError('players-container', '请用 http://localhost 或部署到 Cloudflare');
      return;
    }

    // 加载数据
    await loadAllData();
    await loadWorkerData();

    // 根据当前页面渲染不同内容
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (currentPage === 'index.html' || currentPage === '') {
      // 首页：导航 + 倒计时
      renderNavLinks('nav-links-container');
      initSearch();
    } else if (currentPage === 'news.html') {
      // 信奥新闻独立页
      renderNewsPage();
    } else if (currentPage === 'share.html') {
      // 参赛分享独立页
      renderSharePage();
    } else if (currentPage === 'gzh.html') {
      // 公众号文章独立页
      renderGzhArticles();
    }

    // 提交表单（仅 submit.html）
    initSubmitForm();

    // 倒计时（countdown.js 独立初始化）
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露API供调试
  window.OIerLink = {
    allLinks: allLinks,
    allNews: allNews,
    allPlayers: allPlayers,
    allGzh: allGzh,
    config: CONFIG
  };
})();
