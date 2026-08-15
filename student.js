/* ============================================================
   STUDENT.JS — Student Dashboard + Quiz Engine + Anti-Cheat
   Online Quiz Portal
   ============================================================ */

let studentSession = null;

// Wrap in async IIFE for initial auth check
(async () => {
  studentSession = await Auth.requireRole('student');
  if (!studentSession) return;

  // Set student info in topbar/sidebar
  document.getElementById('student-name').textContent   = studentSession.name;
  document.getElementById('student-avatar').textContent = studentSession.name.charAt(0).toUpperCase();
  document.getElementById('welcome-name').textContent   = studentSession.name.split(' ')[0];

  // Initialize accent dots active state + click listeners + theme icon
  setupAccentThemeListeners();
  syncThemeModeUI();

  // Initialize view & listeners
  setupSearchListener();
  setupMobileMenu();
  setupProfilePasswordForm();
  await renderCategoryTabs();
  await renderCatalog();
})();

// ── Sound Effects (Web Audio API — no files needed) ──────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { audioCtx = null; }
  }
  return audioCtx;
}

function playChime(type = 'success') {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;

  // 3-note ascending chime for success, 2-note descending for fail
  const notes = type === 'success'
    ? [ { f: 523.25, t: 0 }, { f: 659.25, t: 0.12 }, { f: 783.99, t: 0.24 } ]
    : [ { f: 392, t: 0 }, { f: 311.13, t: 0.15 } ];

  notes.forEach(n => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.f, now + n.t);
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(0.25, now + n.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + 0.3);
  });
}

// ── Confetti Burst Effect (Canvas) ──────────────────────────
let confettiCanvas = null;
let confettiAnimId = null;

function burstConfetti(durationMs = 2500) {
  if (confettiAnimId) { cancelAnimationFrame(confettiAnimId); confettiAnimId = null; }
  if (confettiCanvas) { confettiCanvas.remove(); confettiCanvas = null; }

  confettiCanvas = document.createElement('canvas');
  Object.assign(confettiCanvas.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none',
    zIndex: '99998', width: '100vw', height: '100vh'
  });
  document.body.appendChild(confettiCanvas);
  const ctx = confettiCanvas.getContext('2d');
  const resize = () => { confettiCanvas.width = innerWidth; confettiCanvas.height = innerHeight; };
  resize(); window.addEventListener('resize', resize);

  const palette = ['#6c63ff', '#a855f7', '#00d2ff', '#00e676', '#ffd740', '#ff5252', '#f97316', '#3b82f6'];
  const pieces = [];
  const cx = innerWidth / 2, cy = innerHeight * 0.3;
  for (let i = 0; i < 160; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    pieces.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      g: 0.18 + Math.random() * 0.08,
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      color: palette[(Math.random() * palette.length) | 0],
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
      life: 1,
      decay: 0.004 + Math.random() * 0.004,
    });
  }

  const start = performance.now();
  function tick(now) {
    const t = now - start;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = 0;
    for (const p of pieces) {
      if (p.life <= 0) continue;
      alive++;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.life -= p.decay;
      if (p.life < 0) p.life = 0;
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (t < durationMs || alive > 0) {
      confettiAnimId = requestAnimationFrame(tick);
    } else {
      confettiAnimId = null;
      confettiCanvas?.remove();
      confettiCanvas = null;
      window.removeEventListener('resize', resize);
    }
  }
  confettiAnimId = requestAnimationFrame(tick);
}

// ── Theme / Accent Management ─────────────────────────────────
function toggleTheme() {
  const cur = API.getTheme();
  const next = cur === 'dark' ? 'light' : 'dark';
  API.setTheme(next);
  syncThemeModeUI();
}

// Theme toggle handler on the moon/sun button
const studentThemeBtn = document.getElementById('student-theme-toggle');
if (studentThemeBtn) {
  studentThemeBtn.addEventListener('click', toggleTheme);
}

function syncThemeModeUI() {
  // Update icon on topbar button
  const btn = document.getElementById('student-theme-toggle');
  if (btn) btn.textContent = API.getTheme() === 'dark' ? '🌙' : '☀️';

  // Update profile panel mode buttons active state
  document.querySelectorAll('.stud-theme-btn').forEach(b => {
    const isActive = b.dataset.mode === API.getTheme();
    if (isActive) {
      b.classList.remove('btn-secondary');
      b.classList.add('btn-primary');
    } else {
      b.classList.add('btn-secondary');
      b.classList.remove('btn-primary');
    }
  });
}

// Profile panel mode buttons
document.querySelectorAll('.stud-theme-btn').forEach(b => {
  b.addEventListener('click', () => {
    API.setTheme(b.dataset.mode);
    syncThemeModeUI();
  });
});

function setupAccentThemeListeners() {
  const saved = API.getAccent();
  // On load, set active state on ALL accent dots in document
  document.querySelectorAll('.accent-dot').forEach(dot => {
    const isActive = dot.dataset.accent === saved;
    dot.classList.toggle('active', isActive);
    dot.addEventListener('click', () => {
      const accent = dot.dataset.accent;
      API.setAccent(accent);
      document.querySelectorAll('.accent-dot').forEach(d => {
        d.classList.toggle('active', d.dataset.accent === accent);
      });
      toast(`Theme changed to ${accent.charAt(0).toUpperCase()+accent.slice(1)}! 🎨`, 'success');
    });
  });
}

// ── Profile Panel ─────────────────────────────────────────────
async function renderProfilePanel() {
  if (!studentSession) return;

  const av = document.getElementById('profile-avatar');
  const nm = document.getElementById('profile-name');
  const em = document.getElementById('profile-email');
  const jn = document.getElementById('profile-joined');
  const at = document.getElementById('profile-attempts');
  const pr = document.getElementById('profile-passrate');

  if (av) av.textContent = studentSession.name.charAt(0).toUpperCase();
  if (nm) nm.textContent = studentSession.name;
  if (em) em.textContent = studentSession.email;

  // Get full user details via /me (includes createdAt)
  const me = await API.Auth.getMe();
  if (me && jn) {
    const dt = me.createdAt ? new Date(me.createdAt) : null;
    jn.textContent = dt
      ? dt.toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' })
      : '—';
  }

  // Compute attempts & pass rate from my results
  const res = await API.Results.getMyResults();
  if (at) at.textContent = res.length;
  if (pr) {
    if (res.length === 0) pr.textContent = '—';
    else {
      const passed = res.filter(r => r.passed).length;
      const rate = Math.round((passed / res.length) * 100);
      pr.textContent = `${rate}% (${passed}/${res.length})`;
    }
  }
}

function setupProfilePasswordForm() {
  const form = document.getElementById('student-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = document.getElementById('stud-pwd-current').value.trim();
    const nw  = document.getElementById('stud-pwd-new').value.trim();
    const cn  = document.getElementById('stud-pwd-confirm').value.trim();

    if (!cur || !nw || !cn) return toast('Please fill all fields.', 'warning');
    if (nw.length < 4) return toast('New password must be at least 4 characters.', 'warning');
    if (nw !== cn) return toast('New passwords do not match.', 'error');
    if (cur === nw) return toast('New password must be different from current.', 'warning');

    const res = await API.Auth.changeMyPassword(cur, nw);
    if (res.ok) {
      toast(res.msg || 'Password changed!', 'success');
      form.reset();
    } else {
      toast(res.msg || 'Password change failed.', 'error');
    }
  });
}
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768 || ('ontouchstart' in window);
};

// Toast Helper
function toast(msg, type = 'info') {
  Auth.toast(msg, type);
}

// ── Panel Navigation ─────────────────────────────────────────
const navItems    = document.querySelectorAll('.nav-item');
const panels      = document.querySelectorAll('.panel');
const topbarTitle = document.getElementById('topbar-title');
const topbarSub   = document.getElementById('topbar-sub');

const panelMeta = {
  'panel-home':    { title: 'Quiz Catalog',         sub: 'Browse & attempt quizzes' },
  'panel-results': { title: 'My Results',            sub: 'View your quiz history and scores' },
  'panel-profile': { title: 'Profile & Settings',    sub: 'Manage your account and appearance' },
};

function showPanel(panelId) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });

  // Remove active from all nav items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show the target panel
  const target = document.getElementById(panelId);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';
  }

  // Mark the nav item active
  const activeNav = document.querySelector(`.nav-item[data-panel="${panelId}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Update topbar
  const meta = panelMeta[panelId] || {};
  if (topbarTitle) topbarTitle.textContent = meta.title || '';
  if (topbarSub)   topbarSub.textContent   = meta.sub   || '';

  // Trigger panel-specific data loading
  if (panelId === 'panel-results') {
    renderMyResults();
  } else if (panelId === 'panel-profile') {
    renderProfilePanel();
  }
}

// Initialise: make sure home panel is visible on load
(function initPanels() {
  document.querySelectorAll('.panel').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });
  const home = document.getElementById('panel-home');
  if (home) { home.style.display = 'block'; home.classList.add('active'); }
  const homeNav = document.querySelector('.nav-item[data-panel="panel-home"]');
  if (homeNav) homeNav.classList.add('active');
})();

navItems.forEach(item => {
  item.addEventListener('click', () => showPanel(item.dataset.panel));
});

// Logout
document.getElementById('student-logout-btn')?.addEventListener('click', () => Auth.logout());

// ════════════════════════════════════════════════════════════
// CATALOG PANEL & CATEGORY FILTERING & SEARCH
// ════════════════════════════════════════════════════════════
let studentCategoryFilter = 'All';
let studentSearchQuery    = '';

function setupSearchListener() {
  const searchInput = document.getElementById('student-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      studentSearchQuery = e.target.value.toLowerCase().trim();
      renderCatalog();
    });
  }
}

function setupMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-btn');
  const sidebar   = document.querySelector('.sidebar');
  const overlay   = document.getElementById('sidebar-overlay');

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

async function renderCategoryTabs() {
  const container = document.getElementById('student-category-tabs');
  if (!container) return;
  const categories = ['All', ...(await API.Quiz.getCategories())];
  container.innerHTML = categories.map(cat => `
    <button class="category-tab ${studentCategoryFilter === cat ? 'active' : ''}" onclick="filterStudentCatalog('${cat}')">${cat}</button>
  `).join('');
}

async function filterStudentCatalog(cat) {
  studentCategoryFilter = cat;
  await renderCategoryTabs();
  await renderCatalog();
}

async function renderCatalog() {
  const container = document.getElementById('catalog-container');
  if (!container) return;

  container.innerHTML = `<div class="empty-state"><h4>⏳ Loading Available Quizzes...</h4></div>`;

  let quizzes     = await API.Quiz.getAll();
  const myResults = await API.Results.getMyResults();

  if (studentCategoryFilter !== 'All') {
    quizzes = quizzes.filter(q => (q.category || q.subject || 'General') === studentCategoryFilter);
  }

  if (studentSearchQuery) {
    quizzes = quizzes.filter(q => 
      (q.title && q.title.toLowerCase().includes(studentSearchQuery)) ||
      (q.subject && q.subject.toLowerCase().includes(studentSearchQuery)) ||
      (q.category && q.category.toLowerCase().includes(studentSearchQuery))
    );
  }

  if (quizzes.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><h4>No Quizzes Available</h4><p>Check back later or switch category.</p></div>`;
    return;
  }

  container.innerHTML = quizzes.map((q, idx) => {
    const attempts     = myResults.filter(r => String(r.quizId) === String(q.id));
    const attemptCount = (q.myAttempts !== undefined && q.myAttempts > 0) ? q.myAttempts : attempts.length;
    const latestAttempt= attempts[0];
    const subjectEmoji = { 'General Knowledge':'🌍', 'Programming':'💻', 'Science':'🔬', 'Math':'📐', 'History':'📜', 'English':'📖' };
    const icon         = q.emoji || subjectEmoji[q.subject] || '📝';

    const rawMax       = Number(q.maxAttempts);
    const maxAttempts  = (rawMax <= 0 || Number.isNaN(rawMax)) ? 0 : rawMax;
    const isExhausted  = maxAttempts > 0 && attemptCount >= maxAttempts;
    const delay        = Math.min(idx * 60, 480);

    return `
    <div class="glass-card quiz-catalog-card ${isExhausted ? 'attempt-exhausted-card' : ''} animate-stagger" style="--d:${delay}ms;">
      <div class="catalog-card-top">
        <div class="catalog-card-icon">${icon}</div>
        ${latestAttempt ? `<span class="badge ${latestAttempt.passed ? 'badge-success' : 'badge-error'}">${latestAttempt.passed ? '✅ Passed' : '❌ Failed'}</span>` : '<span class="badge badge-info">🆕 New</span>'}
      </div>
      <div class="catalog-card-title">${q.title}</div>
      <div class="catalog-card-subject">
        <span class="badge badge-purple">${q.category || q.subject || 'General'}</span>
        ${q.negativeMarks > 0 ? `<span class="badge badge-warning">-${q.negativeMarks} Neg Marks</span>` : ''}
      </div>

      <div class="attempt-limit-badge" style="margin-top:10px;">
        ⏱️ Attempts: <strong>${attemptCount} / ${maxAttempts === 0 ? '∞ Unlimited' : maxAttempts}</strong>
        ${isExhausted ? '<span style="color:var(--error); margin-left:auto;">(Limit Reached)</span>' : ''}
      </div>

      <div class="catalog-card-stats">
        <div class="catalog-stat">
          <div class="cs-value">${q.questionCount || 0}</div>
          <div class="cs-label">Questions</div>
        </div>
        <div class="catalog-stat">
          <div class="cs-value">${q.durationMinutes}</div>
          <div class="cs-label">Minutes</div>
        </div>
        <div class="catalog-stat">
          <div class="cs-value">${q.totalMarks}</div>
          <div class="cs-label">Marks</div>
        </div>
      </div>

      ${latestAttempt ? `
        <div style="padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid var(--border);margin-bottom:12px;font-size:0.8rem;color:var(--text-secondary);">
          Last score: <strong style="color:var(--text-primary);">${latestAttempt.score}/${latestAttempt.totalMarks} (${Math.round(latestAttempt.percentage)}%)</strong>
        </div>` : ''}

      <button class="btn btn-primary catalog-card-btn" ${isExhausted ? 'disabled' : ''} ${isExhausted ? '' : `onclick="startQuiz('${q.id}')"`}>
        ${isExhausted ? '🚫 Already Attempted' : (latestAttempt ? '🔁 Retake Quiz' : '🚀 Start Quiz')}
      </button>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
// QUIZ ENGINE + ANTI-CHEATING SYSTEM (Server-Graded)
// ════════════════════════════════════════════════════════════
let quizState = {
  quizId:        null,
  quiz:          null,
  questions:     [],
  current:       0,
  answers:       {},
  markedReview:  new Set(),
  timerSeconds:  0,
  timerInterval: null,
  startTime:     null,
  antiCheatStrikes: 0,
  active:        false,
};

async function startQuiz(quizId) {
  toast('Initializing secure exam session...', 'info');
  const sessionRes = await API.Quiz.getSession(quizId);

  if (!sessionRes.ok) {
    return toast(sessionRes.msg || 'Failed to start quiz.', 'error');
  }

  const { quiz, questions } = sessionRes;

  quizState = {
    quizId,
    quiz,
    questions,
    current: 0,
    answers: {},
    markedReview: new Set(),
    timerSeconds: quiz.durationMinutes * 60,
    timerInterval: null,
    startTime: Date.now(),
    antiCheatStrikes: 0,
    active: true,
  };

  document.getElementById('quiz-engine').classList.remove('hidden');
  document.getElementById('qe-quiz-title').textContent = quiz.title;
  document.body.style.overflow = 'hidden';

  // Request Fullscreen Mode
  requestFullScreenMode();

  // Attach Anti-Cheat Protection Listeners
  attachAntiCheatListeners();

  renderQuestion();
  startTimer();
  renderNavigator();
}

function requestFullScreenMode() {
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(err => console.log('Fullscreen blocked:', err));
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  }
}

function exitFullScreenMode() {
  if (document.exitFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function attachAntiCheatListeners() {
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleWindowBlur);
  document.addEventListener('contextmenu', preventDefaultAction);
  document.addEventListener('copy', preventDefaultAction);
  document.addEventListener('cut', preventDefaultAction);
  document.addEventListener('paste', preventDefaultAction);
  document.addEventListener('selectstart', preventDefaultAction);
  document.addEventListener('keydown', handleKeyBlock);
  document.addEventListener('fullscreenchange', handleFullScreenChange);
}

function detachAntiCheatListeners() {
  window.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('blur', handleWindowBlur);
  document.removeEventListener('contextmenu', preventDefaultAction);
  document.removeEventListener('copy', preventDefaultAction);
  document.removeEventListener('cut', preventDefaultAction);
  document.removeEventListener('paste', preventDefaultAction);
  document.removeEventListener('selectstart', preventDefaultAction);
  document.removeEventListener('keydown', handleKeyBlock);
  document.removeEventListener('fullscreenchange', handleFullScreenChange);
}

function preventDefaultAction(e) {
  if (quizState.active) {
    e.preventDefault();
    return false;
  }
}

function handleKeyBlock(e) {
  if (!quizState.active) return;
  if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'a', 'u', 'p', 's'].includes(e.key.toLowerCase())) {
    e.preventDefault();
    toast('🔒 Copy/Paste and shortcuts are disabled during the quiz!', 'warning');
  }
  if (e.key === 'F12') {
    e.preventDefault();
  }
}

function handleVisibilityChange() {
  if (quizState.active && document.hidden) {
    triggerAntiCheatViolation('Tab switch detected! Do not leave the quiz window.');
  }
}

function handleWindowBlur() {
  if (!quizState.active) return;
  // Soft keyboard focus on mobile should not trigger cheat violation
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    return;
  }
  if (isMobileDevice()) {
    return; // Ignore window blur on mobile to avoid false positives
  }
  if (!document.hidden) {
    triggerAntiCheatViolation('Window focus lost! Please stay focused on the quiz.');
  }
}

function handleFullScreenChange() {
  if (!quizState.active) return;
  if (isMobileDevice()) return; // Suppress fullscreen warnings on mobile touch devices
  if (!document.fullscreenElement) {
    triggerAntiCheatViolation('You exited full-screen mode! Fullscreen is required for this exam.');
  }
}

function triggerAntiCheatViolation(reason) {
  if (!quizState.active) return;

  quizState.antiCheatStrikes++;
  const strikes = quizState.antiCheatStrikes;

  document.getElementById('sd-1')?.classList.toggle('active', strikes >= 1);
  document.getElementById('sd-2')?.classList.toggle('active', strikes >= 2);
  document.getElementById('sd-3')?.classList.toggle('active', strikes >= 3);

  const warnEl = document.getElementById('anticheat-warning');
  const msgEl  = document.getElementById('anticheat-msg');
  const countEl= document.getElementById('anticheat-strikes');

  if (strikes >= 3) {
    msgEl.textContent = 'Maximum anti-cheating warnings exceeded (3/3). Quiz is auto-submitting now!';
    countEl.textContent = '❌ EXAM DISQUALIFIED / AUTO-SUBMITTING';
    warnEl.classList.remove('hidden');
    setTimeout(() => {
      warnEl.classList.add('hidden');
      submitQuiz(true);
    }, 2000);
  } else {
    msgEl.textContent = `${reason}\nAny further tab switches or exiting full-screen will result in automatic submission.`;
    countEl.textContent = `Warning ${strikes} of 3`;
    warnEl.classList.remove('hidden');
  }
}

document.getElementById('btn-return-quiz')?.addEventListener('click', () => {
  document.getElementById('anticheat-warning').classList.add('hidden');
  requestFullScreenMode();
});

// Timer
function startTimer() {
  updateTimerDisplay();
  quizState.timerInterval = setInterval(() => {
    quizState.timerSeconds--;
    updateTimerDisplay();
    if (quizState.timerSeconds <= 0) {
      clearInterval(quizState.timerInterval);
      playChime('fail');
      toast('⏱️ Time is up! Auto-submitting...', 'warning');
      setTimeout(() => submitQuiz(), 1000);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const s   = quizState.timerSeconds;
  const min = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  const el  = document.getElementById('qe-timer');
  el.textContent = `⏱ ${min}:${sec}`;
  el.className   = 'qe-timer';
  if (s <= 60)       el.classList.add('danger');
  else if (s <= 180) el.classList.add('warning');
}

// Render Question
function renderQuestion() {
  const { questions, current, answers, markedReview, quiz } = quizState;
  const q     = questions[current];
  const ans   = answers[current];
  const total = questions.length;

  document.getElementById('qe-progress-text').textContent = `${current + 1} / ${total}`;
  const pct = ((current + 1) / total) * 100;
  document.getElementById('qe-progress-fill').style.width = pct + '%';

  document.getElementById('qe-question-num').textContent  = `Question ${current + 1} of ${total}`;
  document.getElementById('qe-question-text').textContent = q.questionText;

  const typeMap = { mcq:'🔘 Multiple Choice', truefalse:'✅ True / False', fillblank:'📝 Fill in the Blank' };
  document.getElementById('qe-question-type-badge').innerHTML = `<span class="badge badge-info">${typeMap[q.type]||q.type}</span>`;

  const negBadge = document.getElementById('qe-negative-badge');
  if (negBadge) {
    negBadge.innerHTML = quiz.negativeMarks > 0 ? `<span class="badge badge-warning">⚠️ Neg Marking: -${quiz.negativeMarks}</span>` : '';
  }

  const revBtn = document.getElementById('qe-review-btn');
  if (revBtn) {
    const isMarked = markedReview.has(current);
    revBtn.textContent = isMarked ? '📌 Marked for Review' : '🔖 Mark for Review';
    revBtn.className   = `btn btn-sm ${isMarked ? 'btn-warning' : 'btn-secondary'}`;
  }

  const optionsContainer = document.getElementById('qe-options-container');
  optionsContainer.innerHTML = '';

  if (q.type === 'mcq') {
    optionsContainer.innerHTML = `<div class="qe-options-list">${(q.options || []).map((opt, idx) => {
      const letter = String.fromCharCode(65 + idx);
      const selected = ans === opt;
      return `
      <div class="qe-option-card ${selected ? 'qe-selected' : ''}" onclick="selectAnswer('${opt.replace(/'/g, "\\'")}')">
        <div class="qe-option-letter-box ${selected ? 'qe-letter-selected' : ''}">${selected ? '✔' : letter}</div>
        <div class="qe-option-text">${opt}</div>
        ${selected ? '<div class="qe-selected-badge">Selected</div>' : ''}
      </div>`;
    }).join('')}</div>`;
  } else if (q.type === 'truefalse') {
    optionsContainer.innerHTML = `<div class="qe-tf-row">${['True', 'False'].map(opt => {
      const selected = ans === opt;
      const isTrue = opt === 'True';
      return `
      <div class="qe-tf-card ${selected ? (isTrue ? 'qe-tf-true-selected' : 'qe-tf-false-selected') : ''}" onclick="selectAnswer('${opt}')">
        <div class="qe-tf-icon">${isTrue ? '✓' : '✕'}</div>
        <div class="qe-tf-label">${opt}</div>
        ${selected ? '<div class="qe-selected-badge">Selected</div>' : ''}
      </div>`;
    }).join('')}</div>`;
  } else if (q.type === 'fillblank') {
    optionsContainer.innerHTML = `
      <div style="padding:16px;">
        <label class="form-label" style="margin-bottom:8px;">Type Your Answer:</label>
        <input type="text" id="qe-fill-input" class="form-input qe-fill-input-lg" placeholder="Type answer here..." value="${ans || ''}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" />
      </div>`;
    setTimeout(() => {
      const inp = document.getElementById('qe-fill-input');
      if (inp) {
        const saveFill = (e) => {
          const q = quizState.questions[quizState.current];
          const qId = String(q.id || quizState.current);
          quizState.answers[quizState.current] = e.target.value;
          quizState.answersByQId = quizState.answersByQId || {};
          quizState.answersByQId[qId] = e.target.value;
          renderNavigator();
        };
        inp.addEventListener('input', saveFill);
        inp.addEventListener('change', saveFill);
        inp.focus();
        try {
          const len = inp.value.length;
          inp.setSelectionRange(len, len);
        } catch(e){}
      }
    }, 30);
  }
}

function selectAnswer(val) {
  const q = quizState.questions[quizState.current];
  const qId = String(q.id || quizState.current);
  quizState.answers[quizState.current] = val;   // for UI nav
  quizState.answersByQId = quizState.answersByQId || {};
  quizState.answersByQId[qId] = val;            // for server submit
  if (q && q.type === 'fillblank') {
    renderNavigator();
  } else {
    renderQuestion();
    renderNavigator();
  }
}

function toggleMarkReview() {
  const { current, markedReview, questions, answers } = quizState;
  const q = questions[current];
  if (markedReview.has(current)) markedReview.delete(current);
  else markedReview.add(current);

  let savedCursor = null;
  let savedValue = '';
  const isFillBlank = q && q.type === 'fillblank';
  if (isFillBlank) {
    const inp = document.getElementById('qe-fill-input');
    if (inp) {
      savedCursor = [inp.selectionStart, inp.selectionEnd];
      savedValue  = inp.value;
      answers[current] = savedValue;
    }
  }

  renderQuestion();
  renderNavigator();

  if (isFillBlank) {
    setTimeout(() => {
      const inp = document.getElementById('qe-fill-input');
      if (inp) {
        inp.value = savedValue || inp.value;
        inp.focus();
        if (savedCursor) {
          try { inp.setSelectionRange(savedCursor[0], savedCursor[1]); } catch(e){}
        }
      }
    }, 0);
  }
}

document.getElementById('qe-review-btn')?.addEventListener('click', toggleMarkReview);

function renderNavigator() {
  const { questions, current, answers, markedReview } = quizState;
  const grid = document.getElementById('qe-nav-grid');
  grid.innerHTML = questions.map((q, i) => {
    let cls = 'qe-nav-dot';
    if (i === current)          cls += ' current';
    else if (markedReview.has(i)) cls += ' review';
    else if (answers[i] !== undefined && answers[i] !== '') cls += ' answered';
    return `<div class="${cls}" onclick="jumpTo(${i})" title="Q${i+1}">${i+1}</div>`;
  }).join('');

  const answered = Object.values(answers).filter(a => a !== undefined && a !== '').length;
  const reviewCount = markedReview.size;
  const skipped  = questions.length - answered;
  document.getElementById('qe-answered-count').textContent = answered;
  document.getElementById('qe-review-count').textContent   = reviewCount;
  document.getElementById('qe-skipped-count').textContent  = skipped;
}

function saveFillBlankAnswer() {
  const q = quizState.questions[quizState.current];
  if (q && q.type === 'fillblank') {
    const inp = document.getElementById('qe-fill-input');
    if (inp) {
      const qId = String(q.id || quizState.current);
      quizState.answers[quizState.current] = inp.value;
      quizState.answersByQId = quizState.answersByQId || {};
      quizState.answersByQId[qId] = inp.value;
    }
  }
}

function jumpTo(idx) {
  saveFillBlankAnswer();
  quizState.current = idx;
  renderQuestion();
  renderNavigator();
}

document.getElementById('qe-prev-btn')?.addEventListener('click', () => {
  if (quizState.current > 0) {
    saveFillBlankAnswer();
    quizState.current--;
    renderQuestion();
    renderNavigator();
  }
});

document.getElementById('qe-next-btn')?.addEventListener('click', () => {
  const { current, questions } = quizState;
  saveFillBlankAnswer();
  if (current < questions.length - 1) {
    quizState.current++;
    renderQuestion();
    renderNavigator();
  } else {
    document.getElementById('submit-confirm-modal').classList.remove('hidden');
    updateSubmitSummary();
  }
});

function updateSubmitSummary() {
  saveFillBlankAnswer();
  const { questions, answers, markedReview } = quizState;
  const answered = Object.values(answers).filter(a => a !== undefined && a !== '').length;
  const skipped  = questions.length - answered;
  document.getElementById('sc-answered').textContent = answered;
  document.getElementById('sc-review').textContent   = markedReview.size;
  document.getElementById('sc-skipped').textContent  = skipped;
}

document.getElementById('sc-cancel')?.addEventListener('click', () => {
  document.getElementById('submit-confirm-modal').classList.add('hidden');
});

document.getElementById('sc-submit')?.addEventListener('click', () => {
  saveFillBlankAnswer();
  document.getElementById('submit-confirm-modal').classList.add('hidden');
  submitQuiz();
});

// ── Submit Quiz (Server-Side Evaluation) ──
async function submitQuiz(isDisqualified = false) {
  saveFillBlankAnswer();
  quizState.active = false;
  clearInterval(quizState.timerInterval);
  detachAntiCheatListeners();
  exitFullScreenMode();

  const { quiz, questions, startTime, quizId, antiCheatStrikes } = quizState;
  const elapsed = Math.max(0, Math.floor((Date.now() - (startTime || Date.now())) / 1000));
  const mm      = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss      = String(elapsed % 60).padStart(2, '0');
  const timeTakenStr = `${mm}:${ss}`;

  // Build answers by QUESTION ID (for server) — fallback to index-keyed answers
  const answersByQId = quizState.answersByQId || {};
  // Also fill in any index-keyed answers that weren't captured by ID
  questions.forEach((q, idx) => {
    const qId = String(q.id || idx);
    if (answersByQId[qId] === undefined && quizState.answers[idx] !== undefined) {
      answersByQId[qId] = quizState.answers[idx];
    }
  });

  toast('Evaluating answers securely on server...', 'info');

  try {
    const res = await API.Quiz.submit(quizId, {
      answers: answersByQId,
      timeTaken: timeTakenStr,
      antiCheatStrikes,
      isDisqualified,
    });

    document.getElementById('quiz-engine')?.classList.add('hidden');
    document.body.style.overflow = '';

    if (!res || !res.ok) {
      toast('Quiz evaluated successfully!', 'success');
      const localResult = buildLocalResult(questions, quizState.answers, quiz, quizId, isDisqualified, timeTakenStr);
      renderResult(localResult, questions);
      await showPanel('panel-results');
      return;
    }

    // Use questions from submit response (they have correctAnswer + explanation)
    const serverQuestions = (res.questions && res.questions.length > 0) ? res.questions : (questions || []);
    let detailedQuestions = serverQuestions;
    let finalResult = res.result;

    // Try to fetch full detailed result
    if (res.result && res.result.id) {
      try {
        const det = await API.Results.getById(res.result.id);
        if (det && det.ok && det.result) {
          finalResult = det.result;
          if (det.questions && det.questions.length > 0) detailedQuestions = det.questions;
        }
      } catch(e) { /* use res.result */ }
    }

    if (!finalResult) {
      toast('Quiz submitted! Check My Results.', 'info');
      playChime('success');
      await showPanel('panel-results');
      return;
    }

    playChime(finalResult.passed ? 'success' : 'fail');
    if (finalResult.passed) setTimeout(() => burstConfetti(2800), 200);
    LocalSync.addCustomResult(finalResult);
    renderResult(finalResult, detailedQuestions);
    await showPanel('panel-results');
    await renderCatalog().catch(() => {});

  } catch (err) {
    console.error('[Quiz Submission Error]', err);
    document.getElementById('quiz-engine')?.classList.add('hidden');
    document.body.style.overflow = '';
    // Try to show basic result from local data
    toast('Quiz submitted! Showing local result.', 'info');
    const localResult = buildLocalResult(questions, quizState.answers, quiz, quizId, isDisqualified, timeTakenStr);
    renderResult(localResult, questions);
    await showPanel('panel-results');
  }
}

// ── Fallback: build result locally if server fails ──
function buildLocalResult(questions, answers, quiz, quizId, isDisqualified, timeTaken) {
  let totalMarks = 0, earned = 0, correct = 0, wrong = 0, skipped = 0;
  const neg = quiz.negativeMarks || quiz.negative_marking || 0;
  questions.forEach((q, idx) => {
    const pts = q.points || 1;
    totalMarks += pts;
    const given = (quizState.answersByQId || {})[String(q.id || idx)] ?? answers[idx];
    const isSkipped = given === undefined || given === null || given === '';
    if (isSkipped) { skipped++; return; }
    const correctOpt = q.correctOption || q.correctAnswer;
    const opts = q.options || [];
    const isCorrect = String(given) === String(correctOpt) ||
      opts.some((o, i) => String(given) === String(o) && ['A','B','C','D'][i] === String(correctOpt));
    if (isCorrect) { correct++; earned += pts; }
    else { wrong++; earned -= pts * neg; }
  });
  if (earned < 0) earned = 0;
  const percentage = totalMarks > 0 ? Math.round((earned / totalMarks) * 1000) / 10 : 0;
  const passingScore = quiz.passingMarks || quiz.passing_score || 60;
  const passed = isDisqualified ? false : percentage >= passingScore;
  return {
    id: `local_${Date.now()}`, quizId, quizTitle: quiz.title || 'Quiz',
    score: Math.round(earned * 10) / 10, totalMarks, percentage, passed,
    correct, wrong, skipped, timeTaken,
    status: passed ? 'PASSED' : 'FAILED',
    submittedAt: new Date().toISOString()
  };
}

// ════════════════════════════════════════════════════════════
// DETAILED ANSWER REVIEW SCREEN & CERTIFICATE GENERATION
// ════════════════════════════════════════════════════════════
let currentResultForCert = null;

function renderResult(result, questions) {
  currentResultForCert = result;
  const el = document.getElementById('result-screen-wrap');
  el.classList.remove('hidden');
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  const { score, totalMarks, percentage, passed, correct, wrong, skipped, timeTaken, quizTitle, isDisqualified, answers } = result;
  const emoji = isDisqualified ? '🚨' : (passed ? '🏆' : '😔');
  const pct = Math.round(percentage);
  const circleColor = passed ? '#6c63ff' : '#ff5252';

  // Check if retake is allowed
  const resultQuizId = result.quizId || (quizState?.quizId);
  let canRetake = true;
  if (result.maxAttempts && result.maxAttempts > 0 && result.attemptCount) {
    canRetake = result.attemptCount < result.maxAttempts;
  }

  // Build per-question DETAILED answer review — correct ans + explanation
  let reviewHtml = '';
  const userAnsObj = answers || result.answers || quizState.answersByQId || quizState.answers || {};
  if (questions && questions.length > 0) {
    reviewHtml = `
    <div class="glass-card" style="margin-top:24px;padding:28px 24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
        <h3 style="font-size:1.1rem;display:flex;align-items:center;gap:8px;">📋 Detailed Question Breakdown</h3>
        <div style="display:flex;gap:12px;font-size:0.78rem;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:var(--success);"></span> Correct</span>
          <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:var(--error);"></span> Wrong</span>
          <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:var(--warning);"></span> Skipped</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${questions.map((q, idx) => {
          const qid = String(q.id || idx);
          // Look up student answer by id OR index (for compatibility)
          let givenAns = userAnsObj[qid];
          if (givenAns === undefined) givenAns = userAnsObj[idx];
          if (givenAns === undefined) givenAns = null;

          const correctOptLetter = q.correctOption || q.correct_option || q.correctAnswer;
          let correctAns = q.correctAnswer;
          if (!correctAns && q.options && q.options.length) {
            if (correctOptLetter === 'A') correctAns = q.options[0];
            else if (correctOptLetter === 'B') correctAns = q.options[1];
            else if (correctOptLetter === 'C') correctAns = q.options[2];
            else if (correctOptLetter === 'D') correctAns = q.options[3];
            else correctAns = correctOptLetter;
          }
          if (!correctAns) correctAns = correctOptLetter;

          // Compute correctness
          let isCorrect = false;
          const isSkipped = givenAns === null || givenAns === undefined || String(givenAns).trim() === '';

          if (!isSkipped && correctAns !== null) {
            if (q.type === 'fillblank') {
              isCorrect = String(givenAns).trim().toLowerCase() === String(correctAns).trim().toLowerCase();
            } else {
              isCorrect = String(givenAns) === String(correctAns) ||
                String(givenAns).toUpperCase() === String(correctOptLetter).toUpperCase() ||
                (q.options && q.options.some((opt, i) => String(givenAns) === String(opt) && ['A','B','C','D'][i] === String(correctOptLetter)));
            }
          }

          // Decide status UI
          let statusIcon, statusLabel, statusColor, statusBg, answerBg, answerBorder, answerTextColor;
          if (isSkipped) {
            statusIcon = '⬜';
            statusLabel = 'Skipped';
            statusColor = 'var(--warning)';
            statusBg = 'rgba(255,215,64,0.08)';
            answerBg = 'rgba(255,215,64,0.06)';
            answerBorder = 'rgba(255,215,64,0.25)';
            answerTextColor = 'var(--warning)';
          } else if (isCorrect) {
            statusIcon = '✅';
            statusLabel = 'Correct';
            statusColor = 'var(--success)';
            statusBg = 'rgba(0,230,118,0.08)';
            answerBg = 'rgba(0,230,118,0.06)';
            answerBorder = 'rgba(0,230,118,0.3)';
            answerTextColor = 'var(--success)';
          } else {
            statusIcon = '❌';
            statusLabel = 'Wrong';
            statusColor = 'var(--error)';
            statusBg = 'rgba(255,82,82,0.08)';
            answerBg = 'rgba(255,82,82,0.06)';
            answerBorder = 'rgba(255,82,82,0.3)';
            answerTextColor = 'var(--error)';
          }

          const qMarks = q.marks || 1;
          const earned = isSkipped ? 0 : (isCorrect ? qMarks : 0);

          const typeLabel = { mcq: 'MCQ', truefalse: 'True/False', fillblank: 'Fill in the Blank' }[q.type] || q.type;

          // For MCQ/TF — show option letters A,B,C,D nicely
          let correctAnsDisplay = correctAns;
          let givenAnsDisplay = givenAns;
          if (q.type === 'mcq' && q.options && q.options.length) {
            const idxCorrect = q.options.indexOf(correctAns);
            const idxGiven   = q.options.indexOf(givenAns);
            if (idxCorrect >= 0) correctAnsDisplay = `(${String.fromCharCode(65 + idxCorrect)}) ${correctAns}`;
            if (idxGiven   >= 0) givenAnsDisplay   = `(${String.fromCharCode(65 + idxGiven)}) ${givenAns}`;
          } else if (q.type === 'truefalse') {
            if (givenAns)   givenAnsDisplay   = givenAns   === 'True'  ? '✓ True'  : '✕ False';
            if (correctAns) correctAnsDisplay = correctAns === 'True'  ? '✓ True'  : '✕ False';
          }

          const showCorrect = (isSkipped || !isCorrect);

          return `
          <div style="border:1.5px solid var(--border);border-radius:14px;padding:18px 20px;background:var(--bg-card);box-shadow:0 1px 3px rgba(0,0,0,0.25);">
            <!-- Question header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:var(--text-muted);background:rgba(108,99,255,0.1);padding:3px 10px;border-radius:99px;">Q${idx + 1}</span>
                <span style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);background:var(--bg-card);padding:3px 9px;border-radius:6px;">${typeLabel}</span>
                <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);">🎯 ${qMarks} Mark${qMarks !== 1 ? 's' : ''}</span>
              </div>
              <span style="font-size:0.78rem;font-weight:700;color:${statusColor};background:${statusBg};padding:4px 12px;border-radius:99px;border:1px solid ${statusColor}33;">${statusIcon} ${statusLabel} · <strong style="font-weight:800;">${earned}/${qMarks}</strong></span>
            </div>

            <!-- Question text -->
            <div style="font-size:0.98rem;font-weight:600;color:var(--text-primary);margin-bottom:14px;line-height:1.55;">${q.questionText}</div>

            <!-- Answers row -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:12px;">
              <!-- Your Answer -->
              <div style="padding:12px 14px;border-radius:10px;background:${answerBg};border:1.5px solid ${answerBorder};">
                <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:${answerTextColor};font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                  ${isSkipped ? '⬜' : (isCorrect ? '✅' : '❌')} Your Answer
                </div>
                <div style="font-weight:700;color:${isSkipped ? 'var(--warning)' : 'var(--text-primary)'};font-size:0.92rem;line-height:1.4;">
                  ${ isSkipped ? '<span style="opacity:0.7;">— Not Answered —</span>' : givenAnsDisplay }
                </div>
              </div>

              ${showCorrect ? `
              <!-- Correct Answer (only shown if wrong/skipped) -->
              <div style="padding:12px 14px;border-radius:10px;background:rgba(0,230,118,0.08);border:1.5px solid rgba(0,230,118,0.35);">
                <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--success);font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                  ✅ Correct Answer
                </div>
                <div style="font-weight:700;color:var(--text-primary);font-size:0.92rem;line-height:1.4;">
                  ${correctAnsDisplay || '<span style="opacity:0.6;">—</span>'}
                </div>
              </div>` : `
              <!-- Correct confirmation (student was right) -->
              <div style="padding:12px 14px;border-radius:10px;background:rgba(108,99,255,0.08);border:1.5px solid rgba(108,99,255,0.3);">
                <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent-start);font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                  💯 Marked
                </div>
                <div style="font-weight:700;color:var(--text-primary);font-size:0.92rem;line-height:1.4;">
                  Full marks awarded! <strong style="color:var(--success);">+${qMarks}</strong>
                </div>
              </div>`}
            </div>

            ${q.explanation ? `
            <!-- Explanation Box -->
            <div style="padding:12px 16px;border-radius:10px;background:rgba(0,210,255,0.06);border-left:3px solid var(--info);margin-top:8px;">
              <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.09em;color:var(--info);font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                💡 Explanation
              </div>
              <div style="font-size:0.9rem;color:var(--text-secondary);line-height:1.55;">${q.explanation}</div>
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  el.innerHTML = `
  <div class="result-screen">
    <div class="result-hero glass-card" style="padding:48px 32px;margin-bottom:24px;">
      <div style="width:180px;height:180px;border-radius:50%;background:conic-gradient(${circleColor} ${pct*3.6}deg, rgba(255,255,255,0.05) 0deg);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;box-shadow:0 0 40px rgba(108,99,255,0.3);position:relative;">
        <div style="width:148px;height:148px;border-radius:50%;background:var(--bg-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;position:absolute;">
          <div style="font-family:var(--font-head);font-size:2.8rem;font-weight:900;background:var(--grad-primary);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;line-height:1;">${pct}%</div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;">Score</div>
        </div>
      </div>
      <div style="font-size:3rem;margin-bottom:8px;">${emoji}</div>
      <h2 class="result-verdict ${passed ? 'pass' : 'fail'}" style="margin-bottom:8px;">
        ${isDisqualified ? 'Disqualified (Anti-Cheat Strike)' : (passed ? 'Congratulations! You Passed!' : 'Better Luck Next Time!')}
      </h2>
      <p style="color:var(--text-secondary);font-size:0.9rem;">${quizTitle}</p>
      <div class="result-stats-row">
        <div class="result-stat-pill"><div class="rsp-value" style="color:var(--accent-start);">${score}/${totalMarks}</div><div class="rsp-label">Score</div></div>
        <div class="result-stat-pill"><div class="rsp-value" style="color:var(--success);">${correct}</div><div class="rsp-label">Correct</div></div>
        <div class="result-stat-pill"><div class="rsp-value" style="color:var(--error);">${wrong}</div><div class="rsp-label">Wrong</div></div>
        <div class="result-stat-pill"><div class="rsp-value" style="color:var(--warning);">${skipped}</div><div class="rsp-label">Skipped</div></div>
        <div class="result-stat-pill"><div class="rsp-value" style="color:var(--info);">${timeTaken}</div><div class="rsp-label">Time</div></div>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:16px;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="document.getElementById('result-screen-wrap').classList.add('hidden');showPanel('panel-home')">🔙 Back to Catalog</button>
        ${passed ? `<button class="btn btn-success" onclick="openCertificateModal()">📜 Download Certificate</button>` : ''}
        ${canRetake && resultQuizId ? `<button class="btn btn-primary" onclick="document.getElementById('result-screen-wrap').classList.add('hidden');startQuiz('${resultQuizId}')">🔁 Retake Quiz</button>` : `<span style="font-size:0.82rem;color:var(--warning);align-self:center;">🔒 Attempt limit reached — no retake allowed</span>`}
      </div>
    </div>
    ${reviewHtml}
  </div>`;
}

// Certificate Modal
function openCertificateModal() {
  if (!currentResultForCert || !currentResultForCert.passed) return;

  const user = studentSession;
  document.getElementById('cert-user-name').textContent = user.name;
  document.getElementById('cert-quiz-title').textContent = currentResultForCert.quizTitle;
  document.getElementById('cert-score-badge').textContent = `${Math.round(currentResultForCert.percentage)}% Passed (${currentResultForCert.score}/${currentResultForCert.totalMarks} Marks)`;
  document.getElementById('cert-issue-date').textContent = `Issued on: ${new Date(currentResultForCert.submittedAt).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' })}`;

  document.getElementById('certificate-modal').classList.remove('hidden');
}

// PDF Certificate Download
document.getElementById('btn-download-pdf-cert')?.addEventListener('click', () => {
  if (!window.jspdf) return toast('PDF Library loading... Try again in a moment.', 'warning');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const name   = studentSession ? studentSession.name : 'Student';
  const title  = currentResultForCert ? currentResultForCert.quizTitle : 'Quiz Examination';
  const score  = currentResultForCert ? `${Math.round(currentResultForCert.percentage)}% (${currentResultForCert.score}/${currentResultForCert.totalMarks})` : 'PASSED';
  const date   = new Date().toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' });

  doc.setFillColor(15, 15, 30);
  doc.rect(0, 0, 297, 210, 'F');

  doc.setLineWidth(2);
  doc.setDrawColor(108, 99, 255);
  doc.rect(10, 10, 277, 190);
  doc.setDrawColor(0, 210, 255);
  doc.rect(12, 12, 273, 186);

  doc.setTextColor(168, 85, 247);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text('CERTIFICATE OF ACHIEVEMENT', 148.5, 45, { align: 'center' });

  doc.setTextColor(150, 150, 190);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('THIS IS PROUDLY PRESENTED TO', 148.5, 62, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.text(name.toUpperCase(), 148.5, 85, { align: 'center' });

  doc.setTextColor(180, 180, 210);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('for successfully completing the official assessment in', 148.5, 105, { align: 'center' });

  doc.setTextColor(0, 210, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(title, 148.5, 125, { align: 'center' });

  doc.setTextColor(0, 230, 118);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Final Score: ${score}`, 148.5, 145, { align: 'center' });

  doc.setTextColor(100, 100, 140);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Issue Date: ${date}   |   QuizPortal Verification Code: OQP-${Math.random().toString(36).slice(2, 9).toUpperCase()}`, 148.5, 175, { align: 'center' });

  doc.save(`${name.replace(/\s+/g, '_')}_Certificate_${Date.now()}.pdf`);
  toast('Certificate downloaded as PDF! 📜🎉', 'success');
});

// ════════════════════════════════════════════════════════════
// MY RESULTS PANEL
// ════════════════════════════════════════════════════════════
let myResults = [];

async function renderMyResults() {
  const el = document.getElementById('my-results-container');
  if (!el) return;

  el.innerHTML = `<div class="empty-state"><h4>⏳ Loading Your Results...</h4></div>`;
  myResults = await API.Results.getMyResults();

  if (myResults.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><h4>No Results Yet</h4><p>Attempt a quiz to see your results here.</p></div>`;
    return;
  }

  el.innerHTML = `<div class="results-history-list">` +
    myResults.map((r, i) => {
      const date   = new Date(r.submittedAt).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const pct    = Math.round(r.percentage || 0);
      const delay  = Math.min(i * 60, 480);
      return `
      <div class="glass-card result-history-card animate-stagger" style="--d:${delay}ms;">
        <div class="rhc-score" style="${r.passed ? '' : 'background:var(--error-bg);color:var(--error);border:1px solid rgba(255,82,82,0.3);'}">${pct}%</div>
        <div class="rhc-info">
          <div class="rhc-title">${r.quizTitle || 'Unknown Quiz'}</div>
          <div class="rhc-meta">📅 ${date} &nbsp;|&nbsp; ⏱ ${r.timeTaken || '-'}</div>
        </div>
        <div class="rhc-stats">
          <div class="rhc-stat">
            <div class="rhc-stat-val" style="color:var(--accent-start);">${r.score}<span style="font-size:0.7rem;color:var(--text-muted);">/${r.totalMarks}</span></div>
            <div class="rhc-stat-lbl">Score</div>
          </div>
          <div class="rhc-stat">
            <div class="rhc-stat-val" style="color:var(--success);">${r.correct||0}</div>
            <div class="rhc-stat-lbl">Correct</div>
          </div>
          <div class="rhc-stat">
            <div class="rhc-stat-val" style="color:var(--error);">${r.wrong||0}</div>
            <div class="rhc-stat-lbl">Wrong</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <span class="badge ${r.passed ? 'badge-success' : 'badge-error'}">${r.passed ? '✅ PASSED' : '❌ FAILED'}</span>
          <button class="btn btn-sm btn-secondary" onclick="openResultDetail(${i})" style="padding:6px 12px;font-size:0.78rem;">📋 View Full Breakdown</button>
        </div>
      </div>`;
    }).join('') + `</div>`;
}

async function openResultDetail(index) {
  const r = myResults[index];
  if (!r) return;
  toast('Loading full breakdown...', 'info');

  const det = await API.Results.getById(r.id);
  if (!det || !det.ok) {
    return toast(det?.msg || 'Failed to load breakdown.', 'error');
  }

  // Also mark this as current for certificate use (needs retake context though)
  currentResultForCert = det.result;

  renderResult(det.result, det.questions || []);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
