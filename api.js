/* ============================================================
   API.JS — REST API Client & Offline Hybrid Fallback Manager
   Online Quiz Portal
   ============================================================ */

const API_BASE = (() => {
  if (typeof window === 'undefined') return 'http://localhost:5000/api';
  if (window.location.protocol === 'file:') {
    return 'http://localhost:5000/api';
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (window.location.port && window.location.port !== '5000') {
      return 'http://localhost:5000/api';
    }
  }
  return `${window.location.origin}/api`;
})();

// ── Persistent State Synchronizer ───────────────────────────
const LocalSync = {
  getDeletedQuizIds() {
    try { return JSON.parse(localStorage.getItem('oqp_deleted_quizzes') || '[]'); } catch(e) { return []; }
  },
  addDeletedQuizId(id) {
    const list = this.getDeletedQuizIds();
    if (!list.includes(String(id))) {
      list.push(String(id));
      localStorage.setItem('oqp_deleted_quizzes', JSON.stringify(list));
    }
  },
  getCustomQuizzes() {
    try { return JSON.parse(localStorage.getItem('oqp_custom_quizzes') || '[]'); } catch(e) { return []; }
  },
  addCustomQuiz(quiz) {
    const list = this.getCustomQuizzes().filter(q => String(q.id) !== String(quiz.id));
    list.push(quiz);
    localStorage.setItem('oqp_custom_quizzes', JSON.stringify(list));
  },
  getDeletedUserIds() {
    try { return JSON.parse(localStorage.getItem('oqp_deleted_users') || '[]'); } catch(e) { return []; }
  },
  addDeletedUserId(id) {
    const list = this.getDeletedUserIds();
    if (!list.includes(String(id))) {
      list.push(String(id));
      localStorage.setItem('oqp_deleted_users', JSON.stringify(list));
    }
  },
  getCustomUsers() {
    try { return JSON.parse(localStorage.getItem('oqp_custom_users') || '[]'); } catch(e) { return []; }
  },
  addCustomUser(user) {
    const list = this.getCustomUsers().filter(u => String(u.id) !== String(user.id));
    list.push(user);
    localStorage.setItem('oqp_custom_users', JSON.stringify(list));
  },
  getCustomQuestions() {
    try { return JSON.parse(localStorage.getItem('oqp_custom_questions') || '[]'); } catch(e) { return []; }
  },
  addCustomQuestion(q) {
    const list = this.getCustomQuestions().filter(item => String(item.id) !== String(q.id));
    list.push(q);
    localStorage.setItem('oqp_custom_questions', JSON.stringify(list));
  },
  getDeletedQuestionIds() {
    try { return JSON.parse(localStorage.getItem('oqp_deleted_questions') || '[]'); } catch(e) { return []; }
  },
  addDeletedQuestionId(id) {
    const list = this.getDeletedQuestionIds();
    if (!list.includes(String(id))) {
      list.push(String(id));
      localStorage.setItem('oqp_deleted_questions', JSON.stringify(list));
    }
  },
  getCustomResults() {
    try { return JSON.parse(localStorage.getItem('oqp_custom_results') || '[]'); } catch(e) { return []; }
  },
  addCustomResult(result) {
    const list = this.getCustomResults().filter(r => String(r.id) !== String(result.id));
    list.unshift(result);
    localStorage.setItem('oqp_custom_results', JSON.stringify(list));
  }
};

// ── Offline Local Storage Database Seeder ───────────────────────
const LocalStore = {
  get(key, defaultVal) {
    try {
      const data = localStorage.getItem('oqp_db_' + key);
      return data ? JSON.parse(data) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('oqp_db_' + key, JSON.stringify(val));
    } catch (e) {}
  },
  initSeed() {
    if (!localStorage.getItem('oqp_db_users')) {
      this.set('users', [
        { id: 1, name: 'Portal Admin', email: 'admin@quiz.com', password: 'admin123', role: 'admin', createdAt: new Date().toISOString() },
        { id: 2, name: 'Ali Student', email: 'ali@student.com', password: 'student123', role: 'student', createdAt: new Date().toISOString() }
      ]);
    }
    if (!localStorage.getItem('oqp_db_quizzes')) {
      this.set('quizzes', [
        {
          id: 1,
          title: 'JavaScript & Web Security Fundamentals',
          description: 'Test your core JavaScript, Async, and Web Security concepts.',
          category: 'Web Development',
          subject: 'Web Development',
          emoji: '💻',
          duration_minutes: 10,
          durationMinutes: 10,
          passing_score: 60,
          passingMarks: 60,
          negative_marking: 0.25,
          negativeMarks: 0.25,
          start_time: null,
          end_time: null,
          created_by: 1
        }
      ]);
    }
    if (!localStorage.getItem('oqp_db_questions')) {
      this.set('questions', []);
    }
    if (!localStorage.getItem('oqp_db_results')) {
      this.set('results', []);
    }
  }
};

LocalStore.initSeed();

// ── One-time cleanup: remove stale demo seed questions from old versions ──
(function cleanupStaleData() {
  try {
    const ver = localStorage.getItem('oqp_data_version');
    if (ver !== '2') {
      // Clear old questions that were auto-seeded (ids 1,2,3 belonged to demo quiz)
      const qs = LocalStore.get('questions', []);
      const cleaned = qs.filter(q => {
        const id = String(q.id);
        return id !== '1' && id !== '2' && id !== '3';
      });
      LocalStore.set('questions', cleaned);

      // Also clean LocalSync custom questions of stale demo ids
      try {
        const cq = JSON.parse(localStorage.getItem('oqp_custom_questions') || '[]');
        const cleanedCq = cq.filter(q => {
          const id = String(q.id);
          return id !== '1' && id !== '2' && id !== '3';
        });
        localStorage.setItem('oqp_custom_questions', JSON.stringify(cleanedCq));
      } catch(e) {}

      localStorage.setItem('oqp_data_version', '2');
    }
  } catch(e) {}
})();

const API = {
  // ── Token Storage ─────────────────────────────────────────
  TOKEN_KEY: 'oqp_jwt_token',

  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY) || localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token, remember = true) {
    if (remember) {
      localStorage.setItem(this.TOKEN_KEY, token);
    }
    sessionStorage.setItem(this.TOKEN_KEY, token);
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem('oqp_active_user');
  },

  // ── Fetch Wrapper with Offline Fallback ───────────────────
  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (token && token.startsWith('mock-jwt-')) {
      return this.handleOfflineRequest(endpoint, options);
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await res.json().catch(() => ({ ok: false, msg: 'Invalid JSON response from server.' }));
      if (res.ok && data && (data.ok || data.quizzes || data.user || data.token)) {
        return data;
      }
      if (data && data.ok) return data;
      return this.handleOfflineRequest(endpoint, options);
    } catch (err) {
      return this.handleOfflineRequest(endpoint, options);
    }
  },

  // ── Offline Local Storage Fallback Handler ────────────────
  handleOfflineRequest(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    let body = {};
    try { if (options.body) body = JSON.parse(options.body); } catch(e){}

    const users = LocalStore.get('users', []);
    const quizzes = LocalStore.get('quizzes', []);
    const questions = LocalStore.get('questions', []);
    const results = LocalStore.get('results', []);

    const getActiveUser = () => {
      try {
        const u = localStorage.getItem('oqp_active_user');
        return u ? JSON.parse(u) : null;
      } catch(e) { return null; }
    };

    // Auth Routes
    if (endpoint === '/auth/login' && method === 'POST') {
      const user = users.find(u => u.email.toLowerCase() === (body.email || '').toLowerCase().trim());
      if (!user || user.password !== body.password) {
        return { ok: false, msg: 'Invalid email or password.' };
      }
      const token = `mock-jwt-${user.id}-${Date.now()}`;
      localStorage.setItem('oqp_active_user', JSON.stringify(user));
      this.setToken(token);
      return { ok: true, msg: 'Login successful!', token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }

    if (endpoint === '/auth/register' && method === 'POST') {
      const existing = users.find(u => u.email.toLowerCase() === (body.email || '').toLowerCase().trim());
      if (existing) return { ok: false, msg: 'An account with this email already exists.' };
      const newUser = {
        id: Date.now(),
        name: body.name,
        email: body.email.toLowerCase().trim(),
        password: body.password,
        role: body.role === 'admin' ? 'admin' : 'student',
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      LocalStore.set('users', users);
      localStorage.setItem('oqp_active_user', JSON.stringify(newUser));
      const token = `mock-jwt-${newUser.id}-${Date.now()}`;
      this.setToken(token);
      return { ok: true, msg: 'Registration successful!', token, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } };
    }

    if (endpoint === '/auth/me' && method === 'GET') {
      const user = getActiveUser();
      return user ? { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } } : { ok: false, msg: 'Not logged in.' };
    }

    if (endpoint === '/auth/users' && method === 'GET') {
      return { ok: true, users: users.map(u => ({
        ...u,
        password: u.password,
        rawPassword: u.password,
        quizAttempts: results.filter(r => r.userId === u.id).length,
        quizzesAttempted: results.filter(r => r.userId === u.id).length
      })) };
    }

    if (endpoint === '/auth/users' && method === 'POST') {
      const existing = users.find(u => u.email.toLowerCase() === (body.email || '').toLowerCase().trim());
      if (existing) return { ok: false, msg: 'An account with this email already exists.' };
      const newUser = {
        id: Date.now(),
        name: body.name,
        email: body.email.toLowerCase().trim(),
        password: body.password,
        role: 'student',
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      LocalStore.set('users', users);
      return { ok: true, msg: 'Student account created successfully!', userId: newUser.id };
    }

    // Quiz Routes
    if (endpoint === '/quizzes' && method === 'GET') {
      // Merge LocalSync custom questions for accurate counts
      const allQuestions = (() => {
        const customQs = LocalSync.getCustomQuestions();
        const deletedQIds = LocalSync.getDeletedQuestionIds();
        const qMap = new Map();
        questions.forEach(q => qMap.set(String(q.id), q));
        customQs.forEach(q => qMap.set(String(q.id), { ...qMap.get(String(q.id)), ...q }));
        return Array.from(qMap.values()).filter(q => !deletedQIds.includes(String(q.id)));
      })();

      const now = new Date();
      const list = quizzes.map(q => {
        let scheduleStatus = 'ACTIVE';
        if (q.start_time && new Date(q.start_time) > now) scheduleStatus = 'UPCOMING';
        else if (q.end_time && new Date(q.end_time) < now) scheduleStatus = 'EXPIRED';
        const qCount = allQuestions.filter(qs => String(qs.quiz_id || qs.quizId) === String(q.id)).length;
        const qMarks = allQuestions.filter(qs => String(qs.quiz_id || qs.quizId) === String(q.id)).reduce((s, qs) => s + (qs.marks || qs.points || 1), 0);
        const maxAt = Number(q.maxAttempts || q.max_attempts) || 0;
        const myAt = results.filter(r => String(r.quizId) === String(q.id)).length;
        return {
          ...q,
          category: q.category || q.subject || 'General',
          subject: q.category || q.subject || 'General',
          durationMinutes: q.duration_minutes || q.durationMinutes || 10,
          passingMarks: q.passing_score || q.passingMarks || 60,
          negativeMarks: q.negative_marking || q.negativeMarks || 0,
          question_count: qCount,
          questionCount: qCount,
          totalMarks: qMarks,
          maxAttempts: maxAt,
          myAttempts: myAt,
          canAttempt: maxAt <= 0 || myAt < maxAt,
          scheduleStatus
        };
      });
      return { ok: true, quizzes: list };
    }

    if (endpoint === '/quizzes' && method === 'POST') {
      const newQuiz = {
        id: Date.now(),
        title: body.title,
        description: body.description || body.emoji || '',
        category: body.category || body.subject || 'General',
        subject: body.category || body.subject || 'General',
        emoji: body.emoji || '📝',
        duration_minutes: parseInt(body.duration_minutes || body.durationMinutes) || 10,
        durationMinutes: parseInt(body.duration_minutes || body.durationMinutes) || 10,
        passing_score: parseFloat(body.passing_score !== undefined ? body.passing_score : body.passingMarks) || 60,
        passingMarks: parseFloat(body.passing_score !== undefined ? body.passing_score : body.passingMarks) || 60,
        negative_marking: parseFloat(body.negative_marking !== undefined ? body.negative_marking : body.negativeMarks) || 0,
        negativeMarks: parseFloat(body.negative_marking !== undefined ? body.negative_marking : body.negativeMarks) || 0,
        // Fix: allow 0 for unlimited
        maxAttempts: body.maxAttempts !== undefined ? Math.max(0, parseInt(body.maxAttempts) || 0) : 0,
        randomize: !!body.randomize,
        start_time: body.start_time || body.startTime || null,
        end_time: body.end_time || body.endTime || null,
        created_at: new Date().toISOString()
      };
      quizzes.unshift(newQuiz);
      LocalStore.set('quizzes', quizzes);
      return { ok: true, msg: 'Quiz created successfully!', quizId: newQuiz.id };
    }

    if (endpoint.startsWith('/quizzes/') && method === 'PUT') {
      const rawQuizId = String(endpoint.split('/')[2]);
      const idx = quizzes.findIndex(q => String(q.id) === String(rawQuizId));
      if (idx !== -1) {
        quizzes[idx] = {
          ...quizzes[idx],
          title: body.title || quizzes[idx].title,
          category: body.category || body.subject || quizzes[idx].category,
          subject: body.category || body.subject || quizzes[idx].subject,
          duration_minutes: body.duration_minutes || body.durationMinutes || quizzes[idx].duration_minutes,
          durationMinutes: body.duration_minutes || body.durationMinutes || quizzes[idx].durationMinutes,
          passing_score: body.passing_score !== undefined ? body.passing_score : body.passingMarks,
          passingMarks: body.passing_score !== undefined ? body.passing_score : body.passingMarks,
          negative_marking: body.negative_marking !== undefined ? body.negative_marking : body.negativeMarks,
          negativeMarks: body.negative_marking !== undefined ? body.negative_marking : body.negativeMarks,
          start_time: body.start_time || body.startTime || quizzes[idx].start_time,
          end_time: body.end_time || body.endTime || quizzes[idx].end_time,
        };
        LocalStore.set('quizzes', quizzes);
        LocalSync.addCustomQuiz(quizzes[idx]);
        return { ok: true, msg: 'Quiz updated successfully!' };
      }
      return { ok: false, msg: 'Quiz not found.' };
    }

    if (endpoint.startsWith('/quizzes/') && method === 'DELETE') {
      const rawQuizId = String(endpoint.split('/')[2]);
      const filtered = quizzes.filter(q => String(q.id) !== String(rawQuizId));
      LocalStore.set('quizzes', filtered);
      LocalSync.addDeletedQuizId(rawQuizId);
      return { ok: true, msg: 'Quiz deleted successfully!' };
    }

    if (endpoint === '/quizzes/categories' && method === 'GET') {
      const cats = Array.from(new Set(quizzes.map(q => q.category || q.subject || 'General')));
      if (!cats.includes('General')) cats.unshift('General');
      return { ok: true, categories: cats };
    }

    if (endpoint.includes('/quizzes/') && endpoint.includes('/session') && method === 'GET') {
      const rawQuizId = String(endpoint.split('/')[2]);
      const quiz = quizzes.find(q => String(q.id) === String(rawQuizId));
      if (!quiz) return { ok: false, msg: 'Quiz not found.' };
      const qList = questions.filter(q => String(q.quiz_id || q.quizId) === String(rawQuizId)).map(q => ({
        id: q.id,
        quizId: quiz.id,
        questionText: q.question_text || q.questionText,
        codeSnippet: q.code_snippet || q.codeSnippet,
        type: q.type || 'mcq',
        options: q.options || [q.option_a, q.option_b, q.option_c, q.option_d],
        points: q.points || q.marks || 1
      }));
      return {
        ok: true,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          category: quiz.category || quiz.subject,
          duration_minutes: quiz.duration_minutes || quiz.durationMinutes || 10,
          passing_score: quiz.passing_score || quiz.passingMarks || 60,
          negative_marking: quiz.negative_marking || quiz.negativeMarks || 0,
          total_questions: qList.length
        },
        questions: qList
      };
    }

    if (endpoint.includes('/quizzes/') && endpoint.includes('/submit') && method === 'POST') {
      const rawQuizId = String(endpoint.split('/')[2]);
      const quiz = quizzes.find(q => String(q.id) === String(rawQuizId));
      const user = getActiveUser() || { id: 2, name: 'Ali Student', email: 'ali@student.com' };
      const qList = questions.filter(q => String(q.quiz_id || q.quizId) === String(rawQuizId));

      let totalMarks = 0;
      let earned = 0;
      let correct = 0;
      let wrong = 0;
      let skipped = 0;
      const neg = quiz?.negative_marking || quiz?.negativeMarks || 0;
      const userAnswers = body.answers || body.userAnswers || {};

      const detailed = qList.map((q, idx) => {
        const pts = q.points || q.marks || 1;
        totalMarks += pts;
        const given = userAnswers[q.id] !== undefined ? userAnswers[q.id] : userAnswers[idx];

        let isCorrect = false;
        let isSkipped = given === undefined || given === null || given === '';

        if (!isSkipped) {
          const correctOptLetter = q.correct_option || q.correctOption;
          const correctAnsText = q.correctAnswer || (correctOptLetter === 'A' ? q.option_a : correctOptLetter === 'B' ? q.option_b : correctOptLetter === 'C' ? q.option_c : q.option_d);

          if (q.type === 'fillblank') {
            isCorrect = String(given).trim().toLowerCase() === String(correctAnsText).trim().toLowerCase();
          } else {
            isCorrect = String(given).toUpperCase() === String(correctOptLetter).toUpperCase() || String(given) === String(correctAnsText);
          }
        }

        if (isSkipped) skipped++;
        else if (isCorrect) { correct++; earned += pts; }
        else { wrong++; earned -= (pts * neg); }

        return {
          id: q.id,
          questionText: q.question_text || q.questionText,
          codeSnippet: q.code_snippet || q.codeSnippet,
          type: q.type || 'mcq',
          options: q.options || [q.option_a, q.option_b, q.option_c, q.option_d],
          correctAnswer: q.correctAnswer || q.option_a,
          correctOption: q.correct_option || q.correctOption || 'A',
          explanation: q.explanation || '',
          marks: pts
        };
      });

      if (earned < 0) earned = 0;
      const percentage = totalMarks > 0 ? Math.round((earned / totalMarks) * 100 * 10) / 10 : 0;
      const passingScore = quiz?.passing_score || quiz?.passingMarks || 60;
      const passed = percentage >= passingScore;

      const newResult = {
        id: Date.now(),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        quizId: quizId,
        quizTitle: quiz ? quiz.title : 'Quiz Assessment',
        score: Math.round(earned),
        totalMarks,
        total_questions: qList.length,
        percentage,
        passed,
        correct,
        wrong,
        skipped,
        status: passed ? 'PASSED' : 'FAILED',
        timeTaken: body.timeTaken || '05:00',
        submittedAt: new Date().toISOString(),
        answers: userAnswers
      };

      results.unshift(newResult);
      LocalStore.set('results', results);

      return {
        ok: true,
        result: newResult,
        questions: detailed
      };
    }

    // Questions Routes
    if (endpoint === '/questions' && method === 'POST') {
      const opts = body.options || [];
      const newQ = {
        id: `q_${Date.now()}`,
        quiz_id: body.quiz_id || body.quizId,
        quizId: body.quiz_id || body.quizId,
        question_text: body.question_text || body.questionText,
        questionText: body.question_text || body.questionText,
        code_snippet: body.code_snippet || body.codeSnippet || null,
        codeSnippet: body.code_snippet || body.codeSnippet || null,
        type: body.type || 'mcq',
        options: opts,
        option_a: opts[0] || body.option_a || '',
        option_b: opts[1] || body.option_b || '',
        option_c: opts[2] || body.option_c || '',
        option_d: opts[3] || body.option_d || '',
        correct_option: body.correct_option || body.correctOption,
        correctOption: body.correct_option || body.correctOption,
        correctAnswer: body.correct_option || body.correctOption,
        explanation: body.explanation || '',
        marks: Number(body.marks || body.points) || 1,
        points: Number(body.marks || body.points) || 1
      };
      questions.push(newQ);
      LocalStore.set('questions', questions);
      LocalSync.addCustomQuestion(newQ);
      return { ok: true, msg: 'Question created!', questionId: newQ.id };
    }

    if (endpoint.startsWith('/questions/') && method === 'DELETE') {
      const qId = String(endpoint.split('/')[2]);
      const filtered = questions.filter(q => String(q.id) !== qId);
      LocalStore.set('questions', filtered);
      LocalSync.addDeletedQuestionId(qId);
      return { ok: true, msg: 'Question deleted.' };
    }

    // Results Routes
    if (endpoint === '/results/my' && method === 'GET') {
      const user = getActiveUser();
      const myRes = user ? results.filter(r => r.userId === user.id) : results;
      return { ok: true, results: myRes };
    }

    if (endpoint === '/results/all' && method === 'GET') {
      return { ok: true, results };
    }

    if (endpoint.startsWith('/results/leaderboard/') && method === 'GET') {
      const quizId = parseInt(endpoint.split('/')[3]);
      const quizRes = results.filter(r => r.quizId === quizId).sort((a,b) => b.percentage - a.percentage).slice(0, 20);
      return { ok: true, leaderboard: quizRes };
    }

    if (endpoint.startsWith('/results/') && method === 'GET') {
      const resId = parseInt(endpoint.split('/')[2]);
      const resItem = results.find(r => r.id === resId) || results[0];
      return { ok: true, result: resItem, questions: questions.filter(q => q.quiz_id === resItem?.quizId || q.quizId === resItem?.quizId) };
    }

    return { ok: true, msg: 'Operation executed.' };
  },

  // ── Theme Manager ─────────────────────────────────────────
  ACCENT_KEY: 'oqp_accent_theme',

  getTheme() {
    return localStorage.getItem('oqp_theme') || 'dark';
  },

  setTheme(theme) {
    localStorage.setItem('oqp_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  },

  getAccent() {
    return localStorage.getItem(this.ACCENT_KEY) || 'purple';
  },

  setAccent(accent) {
    const valid = ['purple', 'blue', 'green', 'orange'];
    if (!valid.includes(accent)) accent = 'purple';
    localStorage.setItem(this.ACCENT_KEY, accent);
    document.documentElement.setAttribute('data-accent', accent);
  },

  applySavedTheme() {
    this.setTheme(this.getTheme());
    this.setAccent(this.getAccent());
  },

  // ── Auth Endpoints ────────────────────────────────────────
  Auth: {
    async register(name, email, password, role) {
      const data = await API.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      if (data.ok && data.token) {
        API.setToken(data.token);
      }
      if (data.ok && data.user) {
        localStorage.setItem('oqp_active_user', JSON.stringify(data.user));
      }
      return data;
    },

    async login(email, password) {
      const data = await API.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (data.ok && data.token) {
        API.setToken(data.token);
      }
      if (data.ok && data.user) {
        localStorage.setItem('oqp_active_user', JSON.stringify(data.user));
      }
      return data;
    },

    async getMe() {
      const token = API.getToken();
      if (token && token.startsWith('mock-jwt-')) {
        try {
          const u = localStorage.getItem('oqp_active_user');
          if (u) return JSON.parse(u);
        } catch(e){}
      }
      if (token) {
        const data = await API.request('/auth/me');
        if (data.ok && data.user) {
          localStorage.setItem('oqp_active_user', JSON.stringify(data.user));
          return data.user;
        }
      }
      try {
        const u = localStorage.getItem('oqp_active_user');
        return u ? JSON.parse(u) : null;
      } catch(e) { return null; }
    },

    async changeMyPassword(currentPassword, newPassword) {
      return await API.request('/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },

    logout() {
      API.clearToken();
      window.location.href = 'index.html';
    },
  },

  // ── Quiz Endpoints ────────────────────────────────────────
  Quiz: {
    async getAll() {
      const data = await API.request('/quizzes');
      let serverQuizzes = data.ok ? data.quizzes : [];
      const localQuizzes = LocalStore.get('quizzes', []);
      const customQuizzes = LocalSync.getCustomQuizzes();
      const deletedIds = LocalSync.getDeletedQuizIds();

      const allMap = new Map();
      serverQuizzes.forEach(q => allMap.set(String(q.id), q));
      localQuizzes.forEach(q => { if (!allMap.has(String(q.id))) allMap.set(String(q.id), q); });
      customQuizzes.forEach(q => allMap.set(String(q.id), { ...allMap.get(String(q.id)), ...q }));

      let finalQuizzes = Array.from(allMap.values()).filter(q => !deletedIds.includes(String(q.id)));

      // Calculate myAttempts & canAttempt dynamically from persistent results
      const user = await API.Auth.getMe();
      const userId = user ? String(user.id) : null;
      const allResults = await API.Results.getAllResults();

      return finalQuizzes.map(q => {
        const myAt = userId ? allResults.filter(r => String(r.quizId) === String(q.id) && String(r.userId) === userId).length : (q.myAttempts || 0);
        const maxAt = Number(q.maxAttempts !== undefined ? q.maxAttempts : (q.max_attempts || 0)) || 0;
        return {
          ...q,
          myAttempts: myAt,
          maxAttempts: maxAt,
          canAttempt: maxAt <= 0 || myAt < maxAt
        };
      });
    },

    async getCategories() {
      const data = await API.request('/quizzes/categories');
      return data.ok ? data.categories : [];
    },

    async getSession(quizId) {
      return await API.request(`/quizzes/${quizId}/session`);
    },

    async submit(quizId, payload) {
      const res = await API.request(`/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res && res.ok && res.result) {
        LocalSync.addCustomResult(res.result);
        const curLocal = LocalStore.get('results', []);
        curLocal.unshift(res.result);
        LocalStore.set('results', curLocal);
      }
      return res;
    },
  },

  // ── Result Endpoints ──────────────────────────────────────
  Results: {
    async getMyResults() {
      const data = await API.request('/results/my');
      let serverResults = data.ok ? data.results : [];
      const user = await API.Auth.getMe();
      const userId = user ? String(user.id) : null;
      const localResults = LocalStore.get('results', []);
      const customResults = LocalSync.getCustomResults();

      const rMap = new Map();
      serverResults.forEach(r => rMap.set(String(r.id), r));
      localResults.forEach(r => { if (!rMap.has(String(r.id))) rMap.set(String(r.id), r); });
      customResults.forEach(r => rMap.set(String(r.id), { ...rMap.get(String(r.id)), ...r }));

      const all = Array.from(rMap.values());
      return userId ? all.filter(r => String(r.userId) === userId) : all;
    },

    async getAllResults() {
      const data = await API.request('/results/all');
      let serverResults = data.ok ? data.results : [];
      const localResults = LocalStore.get('results', []);
      const customResults = LocalSync.getCustomResults();

      const rMap = new Map();
      serverResults.forEach(r => rMap.set(String(r.id), r));
      localResults.forEach(r => { if (!rMap.has(String(r.id))) rMap.set(String(r.id), r); });
      customResults.forEach(r => rMap.set(String(r.id), { ...rMap.get(String(r.id)), ...r }));

      return Array.from(rMap.values());
    },

    async getById(resultId) {
      const data = await API.request(`/results/${resultId}`);
      if (data && data.ok && data.result) return data;
      const allResults = await API.Results.getAllResults();
      const resItem = allResults.find(r => String(r.id) === String(resultId));
      if (resItem) {
        const questions = await API.Admin.getQuestionsForQuiz(resItem.quizId);
        return { ok: true, result: resItem, questions };
      }
      return data;
    },

    async getLeaderboard(quizId) {
      const data = await API.request(`/results/leaderboard/${quizId}`);
      let serverRes = data.ok ? data.leaderboard : [];
      const allResults = await API.Results.getAllResults();
      const localQuizRes = allResults.filter(r => String(r.quizId) === String(quizId));

      const rMap = new Map();
      serverRes.forEach(r => rMap.set(String(r.id), r));
      localQuizRes.forEach(r => rMap.set(String(r.id), { ...rMap.get(String(r.id)), ...r }));

      return Array.from(rMap.values()).sort((a,b) => (b.percentage || 0) - (a.percentage || 0)).slice(0, 20);
    },

    async getAnalyticsOverview() {
      return await API.request('/results/analytics/overview');
    },
  },

  // ── Admin Endpoints ───────────────────────────────────────
  Admin: {
    async createQuiz(quizData) {
      const res = await API.request('/quizzes', {
        method: 'POST',
        body: JSON.stringify(quizData),
      });
      const newId = (res && (res.quizId || res.id)) ? (res.quizId || res.id) : `quiz_${Date.now()}`;
      const newQuiz = {
        id: newId,
        title: quizData.title,
        subject: quizData.category || quizData.subject || 'General',
        category: quizData.category || quizData.subject || 'General',
        durationMinutes: quizData.durationMinutes || 15,
        duration_minutes: quizData.durationMinutes || 15,
        passingMarks: quizData.passingMarks || 60,
        passing_score: quizData.passingMarks || 60,
        negativeMarks: quizData.negativeMarks || 0,
        negative_marking: quizData.negativeMarks || 0,
        maxAttempts: quizData.maxAttempts !== undefined ? quizData.maxAttempts : 1,
        randomize: !!quizData.randomize,
        emoji: quizData.emoji || '📝',
        description: quizData.description || '',
        questionCount: 0,
        question_count: 0,
        totalMarks: 0,
        myAttempts: 0,
        canAttempt: true,
        createdAt: new Date().toISOString()
      };
      LocalSync.addCustomQuiz(newQuiz);
      const curLocal = LocalStore.get('quizzes', []);
      curLocal.push(newQuiz);
      LocalStore.set('quizzes', curLocal);
      return (res && res.ok) ? res : { ok: true, quizId: newId, id: newId };
    },

    async updateQuiz(quizId, quizData) {
      const res = await API.request(`/quizzes/${quizId}`, {
        method: 'PUT',
        body: JSON.stringify(quizData),
      });
      LocalSync.addCustomQuiz({ id: quizId, ...quizData });
      return res;
    },

    async deleteQuiz(quizId) {
      const res = await API.request(`/quizzes/${quizId}`, {
        method: 'DELETE',
      });
      LocalSync.addDeletedQuizId(quizId);
      const curLocal = LocalStore.get('quizzes', []).filter(q => String(q.id) !== String(quizId));
      LocalStore.set('quizzes', curLocal);
      return (res && res.ok) ? res : { ok: true, msg: 'Quiz deleted.' };
    },

    async getQuestionsForQuiz(quizId) {
      const data = await API.request(`/questions/quiz/${quizId}`);
      let serverQuestions = data.ok ? data.questions : [];
      const localQuestions = LocalStore.get('questions', []);
      const customQuestions = LocalSync.getCustomQuestions();
      const deletedQIds = LocalSync.getDeletedQuestionIds();

      const qMap = new Map();
      serverQuestions.forEach(q => qMap.set(String(q.id), q));
      localQuestions.filter(q => String(q.quizId || q.quiz_id) === String(quizId)).forEach(q => { if (!qMap.has(String(q.id))) qMap.set(String(q.id), q); });
      customQuestions.filter(q => String(q.quizId || q.quiz_id) === String(quizId)).forEach(q => qMap.set(String(q.id), { ...qMap.get(String(q.id)), ...q }));

      return Array.from(qMap.values()).filter(q => !deletedQIds.includes(String(q.id)));
    },

    async getAllQuestions() {
      const data = await API.request('/questions/all');
      let serverQuestions = data.ok ? data.questions : [];
      const localQuestions = LocalStore.get('questions', []);
      const customQuestions = LocalSync.getCustomQuestions();
      const deletedQIds = LocalSync.getDeletedQuestionIds();

      const qMap = new Map();
      serverQuestions.forEach(q => qMap.set(String(q.id), q));
      localQuestions.forEach(q => { if (!qMap.has(String(q.id))) qMap.set(String(q.id), q); });
      customQuestions.forEach(q => qMap.set(String(q.id), { ...qMap.get(String(q.id)), ...q }));

      return Array.from(qMap.values()).filter(q => !deletedQIds.includes(String(q.id)));
    },

    async createQuestion(questionData) {
      const res = await API.request('/questions', {
        method: 'POST',
        body: JSON.stringify(questionData),
      });
      const newQId = (res && (res.questionId || res.id)) ? (res.questionId || res.id) : `q_${Date.now()}`;
      const newQ = {
        id: newQId,
        quizId: questionData.quizId,
        quiz_id: questionData.quizId,
        type: questionData.type || 'mcq',
        questionText: questionData.questionText,
        question_text: questionData.questionText,
        codeSnippet: questionData.codeSnippet || null,
        code_snippet: questionData.codeSnippet || null,
        options: questionData.options || [],
        correctOption: questionData.correctOption,
        correct_option: questionData.correctOption,
        correctAnswer: questionData.correctOption,
        marks: Number(questionData.marks) || 1,
        points: Number(questionData.marks) || 1,
        explanation: questionData.explanation || ''
      };
      LocalSync.addCustomQuestion(newQ);
      const curLocal = LocalStore.get('questions', []);
      curLocal.push(newQ);
      LocalStore.set('questions', curLocal);

      // Increment question count in matching quiz in LocalSync and LocalStore
      const quizzes = LocalStore.get('quizzes', []);
      const quizIdx = quizzes.findIndex(q => String(q.id) === String(questionData.quizId));
      if (quizIdx !== -1) {
        quizzes[quizIdx].questionCount = (quizzes[quizIdx].questionCount || 0) + 1;
        quizzes[quizIdx].question_count = quizzes[quizIdx].questionCount;
        quizzes[quizIdx].totalMarks = (quizzes[quizIdx].totalMarks || 0) + (Number(questionData.marks) || 1);
        LocalStore.set('quizzes', quizzes);
        LocalSync.addCustomQuiz(quizzes[quizIdx]);
      }

      return (res && res.ok) ? res : { ok: true, questionId: newQId, id: newQId };
    },

    async updateQuestion(qId, questionData) {
      const res = await API.request(`/questions/${qId}`, {
        method: 'PUT',
        body: JSON.stringify(questionData),
      });
      LocalSync.addCustomQuestion({ id: qId, ...questionData });
      return res;
    },

    async deleteQuestion(qId) {
      const res = await API.request(`/questions/${qId}`, {
        method: 'DELETE',
      });
      LocalSync.addDeletedQuestionId(qId);
      const curLocal = LocalStore.get('questions', []).filter(q => String(q.id) !== String(qId));
      LocalStore.set('questions', curLocal);
      return (res && res.ok) ? res : { ok: true, msg: 'Question deleted.' };
    },

    async importCsvQuestions(quizId, questions) {
      return await API.request('/questions/bulk-csv', {
        method: 'POST',
        body: JSON.stringify({ quizId, questions }),
      });
    },

    async getAllStudents() {
      const data = await API.request('/auth/users');
      let serverUsers = data.ok ? data.users : [];

      // Filter: only students, no admins
      serverUsers = serverUsers.filter(u => u.role !== 'admin');

      const localUsers = LocalStore.get('users', []).filter(u => u.role !== 'admin');
      const customUsers = LocalSync.getCustomUsers().filter(u => u.role !== 'admin');
      const deletedUserIds = LocalSync.getDeletedUserIds();

      const userMap = new Map();
      serverUsers.forEach(u => userMap.set(String(u.id || u._id), u));
      localUsers.forEach(u => { if (!userMap.has(String(u.id || u._id))) userMap.set(String(u.id || u._id), u); });
      customUsers.forEach(u => {
        const key = String(u.id || u._id);
        userMap.set(key, { ...userMap.get(key), ...u });
      });

      const allUsers = Array.from(userMap.values()).filter(u =>
        !deletedUserIds.includes(String(u.id || u._id)) && u.role !== 'admin'
      );

      // Recalculate quizAttempts dynamically from all persistent results
      const allResults = await API.Results.getAllResults();
      return allUsers.map(u => {
        const uid = String(u.id || u._id);
        const uAttempts = allResults.filter(r => String(r.userId) === uid).length;
        return {
          ...u,
          id: uid,
          quizAttempts: uAttempts,
          quizzesAttempted: uAttempts
        };
      });
    },

    async createStudent(name, email, password) {
      const res = await API.request('/auth/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      const newId = (res && res.userId) ? res.userId : `user_${Date.now()}`;
      const newUser = {
        id: newId,
        name,
        email: email.toLowerCase().trim(),
        password,
        rawPassword: password,
        role: 'student',
        quizzesAttempted: 0,
        quizAttempts: 0,
        createdAt: new Date().toISOString()
      };
      LocalSync.addCustomUser(newUser);
      const curLocal = LocalStore.get('users', []);
      curLocal.push(newUser);
      LocalStore.set('users', curLocal);
      return (res && res.ok) ? res : { ok: true, userId: newId };
    },

    async deleteStudent(userId) {
      const res = await API.request(`/auth/users/${userId}`, {
        method: 'DELETE',
      });
      LocalSync.addDeletedUserId(userId);
      const curLocal = LocalStore.get('users', []).filter(u => String(u.id) !== String(userId));
      LocalStore.set('users', curLocal);
      return (res && res.ok) ? res : { ok: true, msg: 'Student account deleted.' };
    },

    async changeStudentPassword(userId, newPassword) {
      return await API.request(`/auth/users/${userId}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword }),
      });
    },
  },
};

// Initialize theme on script load
API.applySavedTheme();
