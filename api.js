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
      this.set('questions', [
        {
          id: 1,
          quiz_id: 1,
          quizId: 1,
          question_text: 'What will be the output of the following JavaScript code?',
          questionText: 'What will be the output of the following JavaScript code?',
          code_snippet: 'console.log(typeof NaN);',
          codeSnippet: 'console.log(typeof NaN);',
          type: 'mcq',
          options: ['number', 'NaN', 'undefined', 'object'],
          option_a: 'number',
          option_b: 'NaN',
          option_c: 'undefined',
          option_d: 'object',
          correct_option: 'A',
          correctOption: 'A',
          correctAnswer: 'number',
          explanation: 'In JavaScript, NaN (Not-a-Number) is technically a numeric type, so typeof NaN returns "number".',
          points: 1,
          marks: 1
        },
        {
          id: 2,
          quiz_id: 1,
          quizId: 1,
          question_text: 'Which HTTP header helps prevent Cross-Site Scripting (XSS) attacks by controlling allowed resources?',
          questionText: 'Which HTTP header helps prevent Cross-Site Scripting (XSS) attacks by controlling allowed resources?',
          code_snippet: null,
          codeSnippet: null,
          type: 'mcq',
          options: ['Access-Control-Allow-Origin', 'Content-Security-Policy', 'X-Frame-Options', 'Strict-Transport-Security'],
          option_a: 'Access-Control-Allow-Origin',
          option_b: 'Content-Security-Policy',
          option_c: 'X-Frame-Options',
          option_d: 'Strict-Transport-Security',
          correct_option: 'B',
          correctOption: 'B',
          correctAnswer: 'Content-Security-Policy',
          explanation: 'Content-Security-Policy (CSP) restricts sources from which resources can be loaded.',
          points: 1,
          marks: 1
        },
        {
          id: 3,
          quiz_id: 1,
          quizId: 1,
          question_text: 'What is the result of 0.1 + 0.2 === 0.3 in JavaScript?',
          questionText: 'What is the result of 0.1 + 0.2 === 0.3 in JavaScript?',
          code_snippet: 'console.log(0.1 + 0.2 === 0.3);',
          codeSnippet: 'console.log(0.1 + 0.2 === 0.3);',
          type: 'mcq',
          options: ['true', 'false', 'TypeError', 'undefined'],
          option_a: 'true',
          option_b: 'false',
          option_c: 'TypeError',
          option_d: 'undefined',
          correct_option: 'B',
          correctOption: 'B',
          correctAnswer: 'false',
          explanation: 'Due to IEEE 754 floating-point arithmetic representation, 0.1 + 0.2 equals 0.30000000000000004.',
          points: 1,
          marks: 1
        }
      ]);
    }
    if (!localStorage.getItem('oqp_db_results')) {
      this.set('results', []);
    }
  }
};

LocalStore.initSeed();

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
      const now = new Date();
      const list = quizzes.map(q => {
        let scheduleStatus = 'ACTIVE';
        if (q.start_time && new Date(q.start_time) > now) scheduleStatus = 'UPCOMING';
        else if (q.end_time && new Date(q.end_time) < now) scheduleStatus = 'EXPIRED';
        const qCount = questions.filter(qs => qs.quiz_id === q.id || qs.quizId === q.id).length;
        const qMarks = questions.filter(qs => qs.quiz_id === q.id || qs.quizId === q.id).reduce((s,q) => s + (q.marks || q.points || 1), 0);
        const maxAt = Number(q.maxAttempts || q.max_attempts) || 0;
        const myAt = results.filter(r => r.quizId === q.id).length;
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
      const newQ = {
        id: Date.now(),
        quiz_id: body.quiz_id || body.quizId,
        quizId: body.quiz_id || body.quizId,
        question_text: body.question_text || body.questionText,
        questionText: body.question_text || body.questionText,
        code_snippet: body.code_snippet || body.codeSnippet || null,
        codeSnippet: body.code_snippet || body.codeSnippet || null,
        option_a: body.option_a,
        option_b: body.option_b,
        option_c: body.option_c,
        option_d: body.option_d,
        correct_option: body.correct_option || body.correctOption,
        correctOption: body.correct_option || body.correctOption,
        explanation: body.explanation || '',
        points: body.points || body.marks || 1
      };
      questions.push(newQ);
      LocalStore.set('questions', questions);
      return { ok: true, msg: 'Question created!', questionId: newQ.id };
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
      return finalQuizzes;
    },

    async getCategories() {
      const data = await API.request('/quizzes/categories');
      return data.ok ? data.categories : [];
    },

    async getSession(quizId) {
      return await API.request(`/quizzes/${quizId}/session`);
    },

    async submit(quizId, payload) {
      return await API.request(`/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  },

  // ── Result Endpoints ──────────────────────────────────────
  Results: {
    async getMyResults() {
      const data = await API.request('/results/my');
      return data.ok ? data.results : [];
    },

    async getAllResults() {
      const data = await API.request('/results/all');
      return data.ok ? data.results : [];
    },

    async getById(resultId) {
      const data = await API.request(`/results/${resultId}`);
      return data;
    },

    async getLeaderboard(quizId) {
      const data = await API.request(`/results/leaderboard/${quizId}`);
      return data.ok ? data.leaderboard : [];
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
      return data.ok ? data.questions : [];
    },

    async getAllQuestions() {
      const data = await API.request('/questions/all');
      return data.ok ? data.questions : [];
    },

    async createQuestion(questionData) {
      return await API.request('/questions', {
        method: 'POST',
        body: JSON.stringify(questionData),
      });
    },

    async updateQuestion(qId, questionData) {
      return await API.request(`/questions/${qId}`, {
        method: 'PUT',
        body: JSON.stringify(questionData),
      });
    },

    async deleteQuestion(qId) {
      return await API.request(`/questions/${qId}`, {
        method: 'DELETE',
      });
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
      const localUsers = LocalStore.get('users', []);
      const customUsers = LocalSync.getCustomUsers();
      const deletedUserIds = LocalSync.getDeletedUserIds();

      const userMap = new Map();
      serverUsers.forEach(u => userMap.set(String(u.id), u));
      localUsers.forEach(u => { if (!userMap.has(String(u.id))) userMap.set(String(u.id), u); });
      customUsers.forEach(u => userMap.set(String(u.id), { ...userMap.get(String(u.id)), ...u }));

      return Array.from(userMap.values()).filter(u => !deletedUserIds.includes(String(u.id)));
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
