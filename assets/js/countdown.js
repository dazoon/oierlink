/* ============================================
   信奥导航站 - 倒计时模块
   动态计算赛事倒计时，每秒刷新
   支持本地自定义赛事（localStorage）
   增量更新，数字不抖动
   ============================================ */

(function(){
  'use strict';

  var EVENTS_KEY = 'oierlink_my_events';
  var builtinEvents = [
    { id: 'csp-j-first',  name: 'CSP-J 初赛',   date: '2026-09-19', time: '09:30', desc: '入门组·第一轮' },
    { id: 'csp-s-first',  name: 'CSP-S 初赛',   date: '2026-09-19', time: '14:30', desc: '提高组·第一轮' },
    { id: 'csp-j-second', name: 'CSP-J 复赛',   date: '2026-10-31', time: '08:30', desc: '入门组·第二轮' },
    { id: 'csp-s-second', name: 'CSP-S 复赛',   date: '2026-10-31', time: '14:30', desc: '提高组·第二轮' },
    { id: 'noi',          name: 'NOI 2026',     date: '2026-07-18', time: '09:00', desc: '全国决赛' }
  ];

  // ====== 本地自定义赛事 ======
  var myEvents = [];
  function loadMyEvents() {
    try { myEvents = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); } catch(e) { myEvents = []; }
  }
  function saveMyEvents() {
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(myEvents)); } catch(e) {}
  }
  function addMyEvent(name, date, time) {
    myEvents.push({ id: Date.now(), name: name, date: date, time: time || '09:00', desc: '自定义赛事' });
    saveMyEvents();
  }
  function removeMyEvent(id) {
    myEvents = myEvents.filter(function(e){ return e.id != id; });
    saveMyEvents();
  }

  // ====== 倒计时计算 ======
  function formatCountdown(diffMs) {
    if (diffMs <= 0) return { ended: true, days: 0, hours: 0, mins: 0, secs: 0 };
    var totalSeconds = Math.floor(diffMs / 1000);
    return {
      ended: false,
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      mins: Math.floor((totalSeconds % 3600) / 60),
      secs: totalSeconds % 60
    };
  }

  // ====== 渲染（仅首次调用） ======
  function renderCountdown(container) {
    var now = new Date();
    var allEvents = builtinEvents.concat(myEvents.map(function(e){ e._custom = true; return e; }));
    var html = '<div class="countdown-grid">';

    allEvents.forEach(function(evt) {
      var target = new Date(evt.date + 'T' + (evt.time||'09:00') + ':00+08:00');
      var cd = formatCountdown(target - now);
      var isCustom = evt._custom;

      html += '<div class="timer-card">';
      html += '<div class="timer-name">' + evt.name + '</div>';

      if (cd.ended) {
        html += '<div class="timer-value ended">已结束</div>';
      } else {
        var urgent = cd.days === 0 ? ' urgent' : '';
        html += '<div class="timer-value' + urgent + '" data-event-date="' + evt.date + '" data-event-time="' + (evt.time||'09:00') + '">';
        html += '<span class="timer-num" data-num="days">' + cd.days + '</span><span class="unit">天 </span>';
        html += '<span class="timer-num" data-num="hours">' + cd.hours + '</span><span class="unit">时 </span>';
        html += '<span class="timer-num" data-num="mins">' + cd.mins + '</span><span class="unit">分 </span>';
        html += '<span class="timer-num" data-num="secs">' + cd.secs + '</span><span class="unit">秒</span>';
        html += '</div>';
      }

      html += '<div class="timer-date">' + (evt.desc||'') + ' · ' + evt.date + ' ' + (evt.time||'') + '</div>';
      if (isCustom) {
        html += '<button class="del-event-btn" data-id="' + evt.id + '" title="删除">×</button>';
      }
      html += '</div>';
    });

    html += '</div>';
    if (container) container.innerHTML = html;

    // 绑定删除按钮
    if (container) {
      container.querySelectorAll('.del-event-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          removeMyEvent(btn.getAttribute('data-id'));
          renderCountdown(container);
        });
      });
    }
  }

  // ====== 增量更新（每秒仅改数字，不重建DOM） ======
  function tickCountdown() {
    var vals = document.querySelectorAll('.timer-value[data-event-date]');
    if (vals.length === 0) return;
    var now = new Date();

    vals.forEach(function(el) {
      var date = el.getAttribute('data-event-date');
      var time = el.getAttribute('data-event-time') || '09:00';
      var target = new Date(date + 'T' + time + ':00+08:00');
      var cd = formatCountdown(target - now);

      if (cd.ended) {
        el.innerHTML = '已结束';
        el.className = 'timer-value ended';
        return;
      }

      if (cd.days === 0) el.classList.add('urgent'); else el.classList.remove('urgent');

      var daysEl = el.querySelector('[data-num="days"]');
      var hoursEl = el.querySelector('[data-num="hours"]');
      var minsEl = el.querySelector('[data-num="mins"]');
      var secsEl = el.querySelector('[data-num="secs"]');

      if (daysEl) daysEl.textContent = cd.days;
      if (hoursEl) hoursEl.textContent = cd.hours;
      if (minsEl) minsEl.textContent = cd.mins;
      if (secsEl) secsEl.textContent = cd.secs;
    });
  }

  // ====== 添加赛事表单 ======
  function initAddEventForm() {
    var btnAdd = document.getElementById('btn-add-event');
    var formRow = document.getElementById('add-event-row');
    var btnSave = document.getElementById('btn-save-event');
    var btnCancel = document.getElementById('btn-cancel-event');
    var nameInp = document.getElementById('event-name');
    var dateInp = document.getElementById('event-date');
    var timeInp = document.getElementById('event-time');
    var container = document.getElementById('countdown-container');

    if (!btnAdd || !formRow) return;

    btnAdd.addEventListener('click', function() {
      formRow.style.display = 'flex';
      dateInp.valueAsDate = new Date();
      nameInp.focus();
    });
    btnCancel.addEventListener('click', function() {
      formRow.style.display = 'none';
      nameInp.value = '';
    });
    btnSave.addEventListener('click', function() {
      var name = nameInp.value.trim();
      var date = dateInp.value;
      var time = timeInp ? timeInp.value : '09:00';
      if (!name || !date) { alert('请填写赛事名称和日期'); return; }
      addMyEvent(name, date, time);
      renderCountdown(container);
      formRow.style.display = 'none';
      nameInp.value = '';
    });
  }

  // ====== 初始化 ======
  var container = document.getElementById('countdown-container');
  if (container) {
    loadMyEvents();
    renderCountdown(container);
    setInterval(tickCountdown, 1000);
    initAddEventForm();
  }

  window.renderCountdown = renderCountdown;
})();
