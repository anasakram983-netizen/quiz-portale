/* ============================================================
   ADMIN.JS — Admin Dashboard Logic (REST API Connected)
   Online Quiz Portal
   ============================================================ */

let adminSession = null;
let allStudentsCache = [];
let currentPwdStudentId = null;

// Wrap in async IIFE for initial auth check & authorization guard
(async () => {
  adminSession = await Auth.requireRole('admin');
  if (!adminSession) return;

  // Set admin name in sidebar
  const adminNameEl = document.getElementById('admin-name');
  const adminAvatarEl = document.getElementById('admin-avatar');
  if (adminNameEl && adminSession.name) adminNameEl.textContent = adminSession.name;
  if (adminAvatarEl && adminSession.name) adminAvatarEl.textContent = adminSession.name.charAt(0).toUpperCase();

  // Initialize accent + dark/light UI
  setupAdminAccentListeners();
  syncAdminThemeUI();

  // Initialize view
  setupAdminMobileMenu();
  setupPasswordModal();
  setupAddStudentModal();
  setupStudentsSearch();
  await renderDashboard();
  await renderCategoryTabs();
  await renderQuizCards();
})();

// ── Theme / Accent Management ─────────────────────────────────
function toggleTheme() {
  const cur  = API.getTheme();
  const next = cur === 'dark' ? 'light' : 'dark';
  API.setTheme(next);
  syncAdminThemeUI();
  // Redraw charts so text colors match
  refreshChartsColors();
}

function syncAdminThemeUI() {
  const btn = document.getElementById('admin-theme-toggle');
  if (btn) btn.textContent = API.getTheme() === 'dark' ? '🌙' : '☀️';
}

function setupAdminAccentListeners() {
  const saved = API.getAccent();
  document.querySelectorAll('#admin-accent-group .accent-dot').forEach(dot => {
    const isActive = dot.dataset.accent === saved;
    dot.classList.toggle('active', isActive);
    dot.addEventListener('click', () => {
      const accent = dot.dataset.accent;
      API.setAccent(accent);
      document.querySelectorAll('#admin-accent-group .accent-dot').forEach(d => {
        d.classList.toggle('active', d.dataset.accent === accent);
      });
      refreshChartsColors();
      toast(`Accent theme: ${accent.charAt(0).toUpperCase()+accent.slice(1)} 🎨`, 'success');
    });
  });
}

function setupAdminMobileMenu() {
  const toggleBtn = document.getElementById('admin-mobile-menu-btn');
  const sidebar   = document.querySelector('.sidebar');
  const overlay   = document.getElementById('admin-sidebar-overlay');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay?.classList.toggle('active');
    });

    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay?.classList.remove('active');
    });

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('mobile-open');
          overlay?.classList.remove('active');
        }
      });
    });
  }
}

// Toast Helper
function toast(msg, type = 'info') {
  Auth.toast(msg, type);
}

// ── Count-Up Animation Helper ─────────────────────────────
function countUpTo(elId, target, durationMs = 900) {
  const el = document.getElementById(elId);
  if (!el) return;
  target = Math.round(target || 0);
  if (target < 1) { el.textContent = '0'; return; }
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const p = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(from + (target - from) * eased);
    el.textContent = val;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Theme Toggle
const themeBtn = document.getElementById('admin-theme-toggle');
if (themeBtn) {
  themeBtn.addEventListener('click', toggleTheme);
}

// ── Panel Navigation ─────────────────────────────────────────
const navItems    = document.querySelectorAll('.nav-item');
const panels      = document.querySelectorAll('.panel');
const topbarTitle = document.getElementById('topbar-title');
const topbarSub   = document.getElementById('topbar-sub');

const panelMeta = {
  'panel-dashboard': { title: 'Dashboard',            sub: 'Overview & Statistics' },
  'panel-students':  { title: 'Students',             sub: 'Registered students & password management' },
  'panel-builder':   { title: 'Quiz Builder',         sub: 'Create & manage quizzes' },
  'panel-bank':      { title: 'Question Bank',        sub: 'Manage questions & bulk import' },
  'panel-results':   { title: 'Results & Leaderboard', sub: 'View student performance' },
};

async function showPanel(panelId) {
  panels.forEach(p => p.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
  const nav = document.querySelector(`[data-panel="${panelId}"]`);
  if (nav) nav.classList.add('active');
  const meta = panelMeta[panelId];
  if (meta) {
    if (topbarTitle) topbarTitle.textContent = meta.title;
    if (topbarSub)   topbarSub.textContent   = meta.sub;
  }

  if (panelId === 'panel-dashboard') await renderDashboard();
  if (panelId === 'panel-students')  await renderStudents();
  if (panelId === 'panel-builder')   { await renderCategoryTabs(); await renderQuizCards(); }
  if (panelId === 'panel-bank')      await renderQuestionBank();
  if (panelId === 'panel-results')   await renderResults();
}

navItems.forEach(item => {
  item.addEventListener('click', () => showPanel(item.dataset.panel));
});

// Logout
document.getElementById('admin-logout-btn')?.addEventListener('click', () => Auth.logout());

// ════════════════════════════════════════════════════════════
// ANALYTICS CHARTS (Chart.js)
// ════════════════════════════════════════════════════════════
let chartPassFail  = null;
let chartDaily     = null;
let chartAverages  = null;

function getChartColors() {
  const isDark   = API.getTheme() === 'dark';
  const accent   = API.getAccent() || 'purple';
  const accentMap = {
    purple: { primary: '#6c63ff', secondary: '#a78bfa', success: '#00e676', error: '#ff5252' },
    blue:   { primary: '#3b82f6', secondary: '#60a5fa', success: '#00e676', error: '#ff5252' },
    green:  { primary: '#10b981', secondary: '#34d399', success: '#6c63ff', error: '#ff5252' },
    orange: { primary: '#f97316', secondary: '#fb923c', success: '#00e676', error: '#ff5252' },
  };
  const colors = accentMap[accent] || accentMap.purple;
  return {
    text:    isDark ? '#c8c8e8' : '#334155',
    grid:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    bg:      isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    error:   colors.error,
  };
}

async function loadAndRenderAnalyticsCharts() {
  if (typeof Chart === 'undefined') return; // Chart.js not loaded

  const results  = await API.Results.getAllResults();
  const quizzes  = await API.Quiz.getAll();
  const c        = getChartColors();

  // ── 1. Pass / Fail Pie Chart ─────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  const ctxPF = document.getElementById('chart-passfail');
  if (ctxPF) {
    if (chartPassFail) { chartPassFail.destroy(); chartPassFail = null; }
    chartPassFail = new Chart(ctxPF, {
      type: 'doughnut',
      data: {
        labels: ['Passed', 'Failed'],
        datasets: [{
          data: results.length === 0 ? [0, 0] : [passed, failed],
          backgroundColor: [c.success, c.error],
          borderWidth: 0,
          hoverOffset: 8
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: c.text, font: { size: 13, family: 'Inter, sans-serif' }, padding: 16 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${results.length > 0 ? Math.round(ctx.parsed / results.length * 100) : 0}%)` } },
        },
        cutout: '65%',
      },
    });
  }

  // ── 2. Daily Activity Line Chart (last 14 days) ──────────
  const ctxDaily = document.getElementById('chart-daily');
  if (ctxDaily) {
    if (chartDaily) { chartDaily.destroy(); chartDaily = null; }

    const days = 14;
    const labels = [];
    const counts = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      counts.push(results.filter(r => r.submittedAt && r.submittedAt.slice(0, 10) === key).length);
    }

    chartDaily = new Chart(ctxDaily, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Submissions',
          data: counts,
          borderColor: c.primary,
          backgroundColor: c.primary + '22',
          borderWidth: 2.5,
          pointBackgroundColor: c.primary,
          pointRadius: 4,
          fill: true,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: c.text, font: { size: 11 } }, grid: { color: c.grid } },
          y: { ticks: { color: c.text, stepSize: 1, font: { size: 11 } }, grid: { color: c.grid }, beginAtZero: true },
        },
      },
    });
  }

  // ── 3. Bar Chart: Avg Score % per Quiz (top 10) ──────────
  const ctxAvg = document.getElementById('chart-averages');
  if (ctxAvg) {
    if (chartAverages) { chartAverages.destroy(); chartAverages = null; }

    // Group results by quiz, compute avg %
    const quizMap = {};
    results.forEach(r => {
      const qTitle = r.quizTitle || r.quiz_title || 'Unknown';
      if (!quizMap[r.quizId]) quizMap[r.quizId] = { title: qTitle, total: 0, count: 0 };
      quizMap[r.quizId].total += (r.percentage || 0);
      quizMap[r.quizId].count++;
    });

    const quizStats = Object.values(quizMap)
      .map(q => ({ title: q.title, avg: Math.round(q.total / q.count) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);

    const labels = quizStats.length > 0 ? quizStats.map(q => q.title.length > 22 ? q.title.slice(0, 20) + '…' : q.title) : ['No Quiz Data'];
    const dataVals = quizStats.length > 0 ? quizStats.map(q => q.avg) : [0];

    chartAverages = new Chart(ctxAvg, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Avg Score %',
          data: dataVals,
          backgroundColor: quizStats.map((_, i) => i === 0 ? c.success : c.primary + 'cc'),
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}% average` } },
        },
        scales: {
          x: { ticks: { color: c.text, font: { size: 11 } }, grid: { color: 'transparent' } },
          y: {
            ticks: { color: c.text, font: { size: 11 }, callback: v => v + '%' },
            grid: { color: c.grid },
            beginAtZero: true, max: 100,
          },
        },
      },
    });
  }
}

function refreshChartsColors() {
  // Simply re-render dashboard charts with updated colors
  if (document.getElementById('panel-dashboard')?.classList.contains('active') ||
      document.getElementById('panel-dashboard')?.style.display !== 'none') {
    loadAndRenderAnalyticsCharts();
  }
}



// ════════════════════════════════════════════════════════════
// DASHBOARD PANEL
// ════════════════════════════════════════════════════════════
async function renderDashboard() {
  const quizzes   = await API.Quiz.getAll();
  const results   = await API.Results.getAllResults();
  const questions = await API.Admin.getAllQuestions();
  const users     = await API.Admin.getAllStudents();

  // Count ALL registered students (even those who haven't taken any quiz)
  const studentCount = users.filter(u => u.role === 'student').length;

  // Count-up animate stat values
  countUpTo('stat-quizzes',   quizzes.length);
  countUpTo('stat-students',  studentCount);
  countUpTo('stat-attempts',  results.length);
  countUpTo('stat-questions', questions.length);

  const recentEl = document.getElementById('recent-activity');
  const recent   = [...results].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 5);

  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><h4>No Attempts Yet</h4><p>Students haven't taken any quizzes yet.</p></div>`;
  } else {
    recentEl.innerHTML = recent.map(r => {
      const name = r.userName || r.studentName || r.student_name || 'Student';
      const pct  = Math.round(r.percentage || 0);
      return `
        <div style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="width:40px;height:40px;border-radius:10px;background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;color:#fff;">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.875rem;">${name}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${r.quizTitle || r.quiz_title || 'Quiz'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;font-size:0.875rem;">${r.score}/${r.totalMarks}</div>
            <span class="badge ${r.passed ? 'badge-success' : 'badge-error'}">${r.passed ? 'PASSED' : 'FAILED'}</span>
          </div>
        </div>`;
    }).join('');
  }

  // ALWAYS render analytics charts (even with 0 attempts)
  await loadAndRenderAnalyticsCharts();
}

// ════════════════════════════════════════════════════════════
// QUIZ BUILDER PANEL
// ════════════════════════════════════════════════════════════
let editingQuizId    = null;
let activeCategoryFilter = 'All';

async function renderCategoryTabs() {
  const container = document.getElementById('admin-category-tabs');
  if (!container) return;
  const categories = ['All', ...(await API.Quiz.getCategories())];
  container.innerHTML = categories.map(cat => `
    <button class="category-tab ${activeCategoryFilter === cat ? 'active' : ''}" onclick="filterAdminQuizzes('${cat}')">${cat}</button>
  `).join('');
}

async function filterAdminQuizzes(cat) {
  activeCategoryFilter = cat;
  await renderCategoryTabs();
  await renderQuizCards();
}

const quizForm = document.getElementById('quiz-form');
quizForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title       = document.getElementById('quiz-title').value.trim();
  const subject     = document.getElementById('quiz-subject').value.trim() || 'General';
  const dur         = parseInt(document.getElementById('quiz-duration').value) || 10;
  const passing     = parseFloat(document.getElementById('quiz-passing').value) || 0;
  const emoji       = document.getElementById('quiz-emoji').value.trim() || '📝';
  const negative    = parseFloat(document.getElementById('quiz-negative').value) || 0;
  const maxAttemptsVal = parseInt(document.getElementById('quiz-max-attempts').value);
  const maxAttempts = Number.isInteger(maxAttemptsVal) && maxAttemptsVal >= 0 ? maxAttemptsVal : 5;
  const randomize   = document.getElementById('quiz-randomize').checked;

  if (!title) return toast('Quiz title is required.', 'error');

  const quizPayload = {
    title, subject, durationMinutes: dur, passingMarks: passing, emoji,
    negativeMarks: negative, maxAttempts, randomize
  };

  if (editingQuizId) {
    const res = await API.Admin.updateQuiz(editingQuizId, quizPayload);
    if (!res.ok) return toast(res.msg || 'Update failed.', 'error');
    toast('Quiz updated! ✏️', 'success');
    editingQuizId = null;
    document.getElementById('quiz-form-btn').textContent = '➕ Create Quiz';
    document.getElementById('quiz-form-cancel').classList.add('hidden');
  } else {
    const res = await API.Admin.createQuiz(quizPayload);
    if (!res.ok) return toast(res.msg || 'Create failed.', 'error');
    toast('Quiz created! 🎉', 'success');
  }

  quizForm.reset();
  await renderCategoryTabs();
  await renderQuizCards();
});

document.getElementById('quiz-form-cancel')?.addEventListener('click', () => {
  editingQuizId = null;
  quizForm.reset();
  document.getElementById('quiz-form-btn').textContent = '➕ Create Quiz';
  document.getElementById('quiz-form-cancel').classList.add('hidden');
});

async function renderQuizCards() {
  const container = document.getElementById('quiz-cards-container');
  if (!container) return;

  container.innerHTML = `<div class="empty-state"><h4>⏳ Loading Quizzes...</h4></div>`;

  let quizzes = await API.Quiz.getAll();

  if (activeCategoryFilter !== 'All') {
    quizzes = quizzes.filter(q => (q.category || q.subject || 'General') === activeCategoryFilter);
  }

  if (quizzes.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><h4>No Quizzes Found</h4><p>Create a quiz or switch category filter.</p></div>`;
    return;
  }

  container.innerHTML = quizzes.map((q, idx) => {
    const delay = Math.min(idx * 50, 500);
    return `
    <div class="glass-card quiz-manage-card animate-stagger" style="--d:${delay}ms;" data-quizid="${q.id}">
      <div class="quiz-card-header">
        <div class="quiz-card-icon">${q.emoji || '📝'}</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-secondary" onclick="editQuiz('${q.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteQuiz('${q.id}')">🗑️</button>
        </div>
      </div>
      <div class="quiz-card-title">${q.title}</div>
      <div class="quiz-card-subject">
        <span class="badge badge-purple">${q.category || q.subject || 'General'}</span>
        ${q.negativeMarks > 0 ? `<span class="badge badge-warning">-${q.negativeMarks} Neg</span>` : ''}
        ${q.randomize ? `<span class="badge badge-info">🔀 Shuffled</span>` : ''}
      </div>
      <div class="quiz-card-meta">
        <div class="quiz-meta-item">
          <span class="meta-label">Questions</span>
          <span class="meta-value">${q.questionCount || 0}</span>
        </div>
        <div class="quiz-meta-item">
          <span class="meta-label">Duration</span>
          <span class="meta-value">${q.durationMinutes} min</span>
        </div>
        <div class="quiz-meta-item">
          <span class="meta-label">Marks</span>
          <span class="meta-value">${q.totalMarks || 0}</span>
        </div>
        <div class="quiz-meta-item">
          <span class="meta-label">Attempts Limit</span>
          <span class="meta-value">${q.maxAttempts === 0 ? '∞ Unlimited' : (q.maxAttempts || 5)}</span>
        </div>
      </div>
      <div class="quiz-card-actions">
        <button class="btn btn-secondary btn-sm w-full" onclick="openAddQuestion('${q.id}', '${q.title.replace(/'/g, '&apos;')}')">➕ Add Question</button>
      </div>`;
  }).join('');
}

async function editQuiz(id) {
  const quizzes = await API.Quiz.getAll();
  // Use String comparison to avoid type mismatch (server returns string IDs)
  const q = quizzes.find(item => String(item.id) === String(id));
  if (!q) return;
  editingQuizId = id;
  document.getElementById('quiz-title').value        = q.title;
  document.getElementById('quiz-subject').value      = q.subject || '';
  document.getElementById('quiz-duration').value     = q.durationMinutes;
  document.getElementById('quiz-passing').value      = q.passingMarks;
  document.getElementById('quiz-emoji').value        = q.emoji || '';
  document.getElementById('quiz-negative').value     = q.negativeMarks || 0;
  document.getElementById('quiz-max-attempts').value = q.maxAttempts !== undefined ? q.maxAttempts : 5;
  document.getElementById('quiz-randomize').checked  = !!q.randomize;

  document.getElementById('quiz-form-btn').textContent = '💾 Update Quiz';
  document.getElementById('quiz-form-cancel').classList.remove('hidden');
  document.getElementById('quiz-form').scrollIntoView({ behavior: 'smooth' });
}

async function deleteQuiz(id) {
  if (!confirm('Delete this quiz and ALL its questions?')) return;
  const res = await API.Admin.deleteQuiz(id);
  if (!res.ok) return toast(res.msg || 'Delete failed.', 'error');
  toast('Quiz deleted.', 'warning');
  await renderCategoryTabs();
  await renderQuizCards();
}

// ════════════════════════════════════════════════════════════
// DYNAMIC MCQ QUESTION MODAL (2 to 6 options)
// ════════════════════════════════════════════════════════════
let currentAddQuizId = null;
let currentQType     = 'mcq';
let dynamicOptions   = ['', ''];

function renderDynamicOptions() {
  const container = document.getElementById('dynamic-options-container');
  if (!container) return;

  const letters = ['A','B','C','D','E','F'];

  container.innerHTML = dynamicOptions.map((optVal, idx) => `
    <div class="option-row" data-index="${idx}">
      <input type="radio" name="correct-opt" class="option-radio" id="radio-opt-${idx}" ${idx === 0 ? 'checked' : ''} />
      <input type="text" class="form-input option-input" placeholder="Option ${letters[idx] || idx+1}" value="${optVal.replace(/"/g, '&quot;')}" onchange="updateDynamicOptVal(${idx}, this.value)" />
      <label for="radio-opt-${idx}" class="option-correct-label">✅ Correct</label>
      ${dynamicOptions.length > 2 ? `<button type="button" class="option-remove-btn" onclick="removeOptionRow(${idx})" title="Remove Option">✕</button>` : ''}
    </div>
  `).join('');
}

function updateDynamicOptVal(idx, val) {
  dynamicOptions[idx] = val;
}

function addOptionRow() {
  if (dynamicOptions.length >= 6) return toast('Maximum 6 options allowed.', 'warning');
  dynamicOptions.push('');
  renderDynamicOptions();
}

function removeOptionRow(idx) {
  if (dynamicOptions.length <= 2) return toast('Minimum 2 options required.', 'warning');
  dynamicOptions.splice(idx, 1);
  renderDynamicOptions();
}

document.getElementById('btn-add-option')?.addEventListener('click', addOptionRow);

function openAddQuestion(quizId, quizTitle = '') {
  currentAddQuizId = quizId;
  document.getElementById('add-q-quiz-name').textContent = quizTitle;
  document.getElementById('add-question-form').reset();
  document.getElementById('modal-q-title').textContent = '➕ Add Question';

  dynamicOptions = ['', '', '', ''];
  renderDynamicOptions();
  setQType('mcq');
  document.getElementById('add-question-modal').classList.remove('hidden');
}

function closeAddQuestion() {
  document.getElementById('add-question-modal').classList.add('hidden');
  currentAddQuizId = null;
}

document.getElementById('add-q-close')?.addEventListener('click', closeAddQuestion);
document.getElementById('add-question-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAddQuestion();
});

document.querySelectorAll('.q-type-tab').forEach(tab => {
  tab.addEventListener('click', () => setQType(tab.dataset.type));
});

function setQType(type) {
  currentQType = type;
  document.querySelectorAll('.q-type-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.type === type);
  });
  document.querySelectorAll('.q-type-panel').forEach(p => {
    p.classList.toggle('hidden', p.dataset.for !== type);
  });
}

// Submit Question
document.getElementById('add-question-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentAddQuizId) return;

  const text        = document.getElementById('q-text').value.trim();
  const marks       = parseFloat(document.getElementById('q-marks').value) || 1;
  const explanation = document.getElementById('q-explanation').value.trim();

  if (!text) return toast('Question text is required.', 'error');

  let options = [], correct = '';

  if (currentQType === 'mcq') {
    const inputs = document.querySelectorAll('.option-input');
    const radios = document.querySelectorAll('input[name="correct-opt"]');

    options = Array.from(inputs).map(inp => inp.value.trim());
    if (options.some(o => !o)) return toast('Fill all option fields or remove empty ones.', 'error');

    let correctIdx = -1;
    radios.forEach((r, i) => { if (r.checked) correctIdx = i; });
    if (correctIdx === -1 || !options[correctIdx]) return toast('Select the correct answer.', 'error');

    correct = options[correctIdx];
  } else if (currentQType === 'truefalse') {
    options = ['True', 'False'];
    const sel = document.querySelector('input[name="tf-answer"]:checked');
    if (!sel) return toast('Select True or False.', 'error');
    correct = sel.value;
  } else if (currentQType === 'fillblank') {
    correct = document.getElementById('fill-answer').value.trim();
    if (!correct) return toast('Provide the correct answer.', 'error');
  }

  const res = await API.Admin.createQuestion({
    quizId: currentAddQuizId,
    type: currentQType,
    questionText: text,
    options,
    correctOption: correct,
    marks,
    explanation,
  });

  if (!res.ok) return toast(res.msg || 'Error adding question.', 'error');

  toast('Question added! ✅', 'success');
  closeAddQuestion();
  await renderQuizCards();
});

// ════════════════════════════════════════════════════════════
// QUESTION BANK PANEL & BULK CSV IMPORT
// ════════════════════════════════════════════════════════════
async function renderQuestionBank() {
  const filterEl = document.getElementById('bank-quiz-filter');
  const quizzes  = await API.Quiz.getAll() || [];

  if (filterEl) {
    filterEl.innerHTML = `<option value="">All Quizzes</option>` +
      quizzes.map(q => `<option value="${q.id}">${q.title}</option>`).join('');
  }

  await renderBankTable(filterEl ? filterEl.value : '');
}

async function renderBankTable(quizId = '') {
  let questions = await API.Admin.getAllQuestions();
  if (quizId) questions = questions.filter(q => q.quizId === quizId);

  const tbody = document.getElementById('bank-table-body');
  if (questions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="padding:40px 0"><div class="empty-state-icon">❓</div><h4>No Questions Found</h4></div></td></tr>`;
    return;
  }

  tbody.innerHTML = questions.map((q, i) => {
    const typeMap = { mcq: '🔘 MCQ', truefalse: '✅ T/F', fillblank: '📝 Fill' };
    return `
    <tr>
      <td style="color:var(--text-muted);font-weight:600;">#${i+1}</td>
      <td style="max-width:280px;">
        <div style="font-weight:500;font-size:0.875rem;line-height:1.4;">${q.questionText}</div>
        ${q.explanation ? `<small style="color:var(--accent-start);">💡 ${q.explanation}</small>` : ''}
      </td>
      <td><span class="badge badge-info">${typeMap[q.type] || q.type}</span></td>
      <td><span class="badge badge-purple">${q.quizTitle || 'Quiz'}</span></td>
      <td style="font-weight:700;color:var(--accent-start);">${q.marks}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteQuestion('${q.id}')">🗑️ Delete</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('bank-quiz-filter')?.addEventListener('change', async function() {
  await renderBankTable(this.value);
});

async function deleteQuestion(id) {
  if (!confirm('Delete this question?')) return;
  const res = await API.Admin.deleteQuestion(id);
  if (!res.ok) return toast(res.msg || 'Delete failed.', 'error');
  toast('Question deleted.', 'warning');
  await renderQuestionBank();
}

// CSV Bulk Import
document.getElementById('btn-open-csv-modal')?.addEventListener('click', async () => {
  const select = document.getElementById('csv-target-quiz');
  const quizzes = await API.Quiz.getAll();

  if (quizzes.length === 0) return toast('Create a quiz first before importing questions.', 'warning');

  select.innerHTML = `<option value="">-- Select Quiz --</option>` +
    quizzes.map(q => `<option value="${q.id}">${q.title}</option>`).join('');

  document.getElementById('csv-import-modal').classList.remove('hidden');
});

document.getElementById('csv-modal-close')?.addEventListener('click', () => {
  document.getElementById('csv-import-modal').classList.add('hidden');
});

document.getElementById('btn-download-sample-csv')?.addEventListener('click', () => {
  const csvContent = `questionText,type,optionA,optionB,optionC,optionD,correctOption,marks,explanation
"What is 2 + 2?",mcq,"3","4","5","6","4",1,"Basic addition of 2 and 2 equals 4."
"Is Earth round?",truefalse,"","","","","True",1,"Earth is an oblate spheroid."
"Capital of Japan is ___.",fillblank,"","","","","Tokyo",2,"Tokyo has been Japan's capital since 1868."`;

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'sample_questions_import.csv';
  a.click();
});

document.getElementById('csv-file-input')?.addEventListener('change', function(e) {
  const quizId = document.getElementById('csv-target-quiz').value;
  if (!quizId) {
    toast('Please select a target quiz first.', 'error');
    this.value = '';
    return;
  }

  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const text = evt.target.result;
      const lines = parseCSVLines(text);
      if (lines.length <= 1) return toast('CSV file is empty or has no data rows.', 'error');

      const questionsToImport = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 2) continue;

        const [qText, type, optA, optB, optC, optD, correct, marks, exp] = row.map(cell => cell.trim());

        if (!qText) continue;

        let options = [];
        if (type === 'mcq') {
          options = [optA, optB, optC, optD].filter(Boolean);
        } else if (type === 'truefalse') {
          options = ['True', 'False'];
        }

        questionsToImport.push({
          type: type || 'mcq',
          questionText: qText,
          options,
          correctOption: correct || optA || 'True',
          marks: parseFloat(marks) || 1,
          explanation: exp || '',
        });
      }

      const res = await API.Admin.importCsvQuestions(quizId, questionsToImport);
      if (!res.ok) return toast(res.msg || 'Import failed.', 'error');

      toast(`Successfully imported ${res.inserted} questions! 🎉`, 'success');
      document.getElementById('csv-import-modal').classList.add('hidden');
      await renderQuestionBank();
    } catch (err) {
      toast('Failed to parse CSV file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
});

function parseCSVLines(text) {
  const lines = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const nextC = text[i+1];

    if (c === '"') {
      if (inQuotes && nextC === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && nextC === '\n') i++;
      if (row.length > 1 || row[0] !== '') lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') lines.push(row);
  return lines;
}

// ════════════════════════════════════════════════════════════
// RESULTS PANEL & CSV EXPORT
// ════════════════════════════════════════════════════════════
async function renderResults() {
  const quizFilter = document.getElementById('results-quiz-filter');
  const quizzes    = await API.Quiz.getAll() || [];
  if (quizFilter) {
    quizFilter.innerHTML = `<option value="">All Quizzes</option>` +
      quizzes.map(q => `<option value="${q.id}">${q.title}</option>`).join('');
  }

  await renderResultsTable(quizFilter ? quizFilter.value : '');
}

async function renderResultsTable(quizId = '') {
  let results = await API.Results.getAllResults();
  if (quizId) results = results.filter(r => r.quizId === quizId);

  const tbody = document.getElementById('results-table-body');

  if (results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:40px 0"><div class="empty-state-icon">📊</div><h4>No Results Yet</h4><p>No students have submitted any quizzes yet.</p></div></td></tr>`;
    return;
  }

  const ranked = [...results].sort((a,b) => b.percentage - a.percentage);

  tbody.innerHTML = ranked.map((r, i) => {
    const name      = r.userName || r.studentName || r.student_name || 'Student';
    const pct       = Math.round(r.percentage || 0);
    const rankNum   = i + 1;
    const rankClass = rankNum <= 3 ? `rank-${rankNum}` : 'rank-other';
    const date      = new Date(r.submittedAt).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' });
    return `
    <tr>
      <td><div class="leaderboard-rank ${rankClass}">${rankNum}</div></td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:0.75rem;flex-shrink:0;">
            ${name.charAt(0).toUpperCase()}
          </div>
          <span style="font-weight:600;font-size:0.875rem;">${name}</span>
        </div>
      </td>
      <td style="font-size:0.8rem;color:var(--text-secondary);max-width:150px;overflow:hidden;text-overflow:ellipsis;">${r.quizTitle || r.quiz_title || 'Unknown'}</td>
      <td style="font-weight:700;">${r.score}<span style="color:var(--text-muted);font-weight:400;">/${r.totalMarks}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="progress-bar-wrap" style="width:80px;">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
          <span style="font-size:0.75rem;font-weight:700;">${pct}%</span>
        </div>
      </td>
      <td><span class="badge ${r.passed ? 'badge-success' : 'badge-error'}">${r.passed ? '✅ PASSED' : '❌ FAILED'}</span></td>
      <td style="font-size:0.75rem;color:var(--text-muted);">${date}</td>
    </tr>`;
  }).join('');
}

document.getElementById('results-quiz-filter')?.addEventListener('change', async function() {
  await renderResultsTable(this.value);
});

document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
  const results = await API.Results.getAllResults();
  if (results.length === 0) return toast('No results available to export.', 'warning');

  let csvContent = '\uFEFFStudent Name,Student Email,Quiz Title,Score,Total Marks,Percentage,Passed,Time Taken,Submitted At\n';

  results.forEach(r => {
    const name  = `"${r.userName || r.studentName || r.student_name || 'Student'}"`;
    const email = `"${r.userEmail || r.studentEmail || r.student_email || ''}"`;
    const title = `"${r.quizTitle || r.quiz_title || 'Quiz'}"`;
    const date  = `"${new Date(r.submittedAt).toLocaleString()}"`;

    csvContent += `${name},${email},${title},${r.score},${r.totalMarks},${r.percentage}%,${r.passed ? 'Yes' : 'No'},"${r.timeTaken || '-'}",${date}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `quiz_results_export_${Date.now()}.csv`;
  a.click();
  toast('Results exported to CSV! 📊', 'success');
});

// ════════════════════════════════════════════════════════════
// STUDENTS MANAGEMENT PANEL
// ════════════════════════════════════════════════════════════
async function renderStudents(filterText = '') {
  allStudentsCache = await API.Admin.getAllStudents();

  let users = [...allStudentsCache];
  if (filterText) {
    const q = filterText.toLowerCase().trim();
    users = users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }

  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:40px 0"><div class="empty-state-icon">👥</div><h4>${filterText ? 'No matching students' : 'No students registered yet'}</h4></div></td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u, i) => {
    const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' }) : '-';
    const roleBadge = u.role === 'admin'
      ? `<span class="badge badge-purple">🛡️ Admin</span>`
      : `<span class="badge badge-info">🎓 Student</span>`;
    const pwd = u.password || u.rawPassword || '-';
    // Server returns quizzesAttempted (from JOIN), also check quizAttempts for offline fallback
    const attempts = u.quizzesAttempted || u.quizAttempts || 0;
    return `
    <tr>
      <td style="color:var(--text-muted);font-weight:600;">#${i+1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:0.75rem;flex-shrink:0;">
            ${u.name.charAt(0).toUpperCase()}
          </div>
          <span style="font-weight:600;font-size:0.875rem;">${u.name}</span>
        </div>
      </td>
      <td style="font-size:0.85rem;color:var(--text-secondary);">${u.email}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <code style="background:rgba(108,99,255,0.12);padding:3px 8px;border-radius:6px;font-size:0.8rem;color:var(--accent-start);font-weight:600;">${pwd}</code>
          <button class="btn btn-sm btn-secondary" title="Copy Password" onclick="copyToClipboard('${pwd.replace(/'/g, "\\'")}', 'Password copied!')" style="padding:4px 8px;">📋</button>
        </div>
      </td>
      <td>${roleBadge}</td>
      <td style="font-weight:600;color:${attempts > 0 ? 'var(--success)' : 'var(--text-muted)'};">${attempts} quiz${attempts !== 1 ? 'zes' : ''}</td>
      <td style="font-size:0.75rem;color:var(--text-muted);">${date}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openChangePassword('${u.id}', '${u.name.replace(/'/g, "\\'")}', '${u.email.replace(/'/g, "\\'")}')" style="padding:6px 10px;">🔑 Change Password</button>
      </td>
    </tr>`;
  }).join('');
}

// Helper to copy text to clipboard
function copyToClipboard(text, msg) {
  navigator.clipboard.writeText(text).then(() => {
    toast(msg || 'Copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(msg || 'Copied!', 'success'); } catch(e) { toast('Copy failed.', 'error'); }
    document.body.removeChild(ta);
  });
}

// Students Search filter
function setupStudentsSearch() {
  const searchEl = document.getElementById('students-search');
  if (!searchEl) return;
  let debounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      renderStudents(searchEl.value);
    }, 200);
  });
}

// ════════════════════════════════════════════════════════════
// CHANGE STUDENT PASSWORD MODAL
// ════════════════════════════════════════════════════════════
function setupPasswordModal() {
  // Close buttons
  document.getElementById('pwd-modal-close')?.addEventListener('click', closeChangePassword);
  document.getElementById('pwd-cancel-btn')?.addEventListener('click', closeChangePassword);
  document.getElementById('change-password-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeChangePassword();
  });

  // Form submit
  document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentPwdStudentId) return;

    const newPwd = document.getElementById('pwd-new-password').value.trim();
    const confPwd = document.getElementById('pwd-confirm-password').value.trim();

    if (!newPwd || newPwd.length < 4) return toast('Password must be at least 4 characters.', 'error');
    if (newPwd !== confPwd) return toast('Passwords do not match.', 'error');

    const res = await API.Admin.changeStudentPassword(currentPwdStudentId, newPwd);
    if (!res.ok) return toast(res.msg || 'Failed to update password.', 'error');

    toast('Password updated successfully! ✅', 'success');
    closeChangePassword();
    await renderStudents(document.getElementById('students-search')?.value || '');
  });
}

function openChangePassword(userId, name, email) {
  currentPwdStudentId = userId;
  document.getElementById('pwd-student-name').textContent = name;
  document.getElementById('pwd-student-email').textContent = email;
  document.getElementById('pwd-new-password').value = '';
  document.getElementById('pwd-confirm-password').value = '';
  document.getElementById('change-password-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('pwd-new-password')?.focus(), 100);
}

function closeChangePassword() {
  currentPwdStudentId = null;
  document.getElementById('change-password-modal').classList.add('hidden');
}

// ════════════════════════════════════════════════════════════
// REGISTER NEW STUDENT MODAL (ADMIN ONLY)
// ════════════════════════════════════════════════════════════
function setupAddStudentModal() {
  const modal = document.getElementById('add-student-modal');
  const openBtn = document.getElementById('btn-open-add-student-modal');
  const closeBtn = document.getElementById('add-student-modal-close');
  const cancelBtn = document.getElementById('add-student-cancel-btn');
  const form = document.getElementById('add-student-form');

  const close = () => {
    modal?.classList.add('hidden');
    form?.reset();
  };

  openBtn?.addEventListener('click', () => {
    form?.reset();
    modal?.classList.remove('hidden');
    setTimeout(() => document.getElementById('add-stud-name')?.focus(), 100);
  });

  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('add-stud-name').value.trim();
    const email = document.getElementById('add-stud-email').value.trim();
    const password = document.getElementById('add-stud-password').value.trim();

    if (!name || !email || !password) return toast('All fields are required.', 'warning');
    if (password.length < 4) return toast('Password must be at least 4 characters.', 'error');
    if (!/\S+@\S+\.\S+/.test(email)) return toast('Enter a valid email address.', 'error');

    const res = await API.Admin.createStudent(name, email, password);
    if (!res.ok) return toast(res.msg || 'Failed to create student account.', 'error');

    toast(`Student account created for ${name}! 🎉`, 'success');
    close();
    await renderStudents(document.getElementById('students-search')?.value || '');
  });
}
