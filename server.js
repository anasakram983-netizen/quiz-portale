require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'quizportal_super_secret_jwt_key_2026_prod!';
const DB_PATH = process.env.DB_PATH ||
  (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? '/tmp/quizportal.db'
    : path.join(__dirname, 'quizportal.db'));

let db = null;
let useMemDb = false;
let memStore = {
  users: [],
  quizzes: [],
  questions: [],
  results: []
};

async function initMemStore() {
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminHashed = await bcrypt.hash(adminPass, 10);
  const studentHashed = await bcrypt.hash('student123', 10);
  const now = new Date().toISOString();

  memStore = {
    users: [
      { id: 'admin001', name: 'Portal Admin', email: 'admin@quiz.com', password: adminHashed, rawPassword: adminPass, role: 'admin', createdAt: now },
      { id: 'student001', name: 'Ali Student', email: 'ali@student.com', password: studentHashed, rawPassword: 'student123', role: 'student', createdAt: now }
    ],
    quizzes: [
      { id: 'quiz001', title: 'JavaScript & Web Security Fundamentals', subject: 'Web Development', category: 'Web Development', durationMinutes: 10, passingMarks: 60, negativeMarks: 0.25, maxAttempts: 0, randomize: 0, createdBy: 'admin001', emoji: '💻', description: 'Test core JS, Async, & Web Security concepts.', createdAt: now }
    ],
    questions: [
      { id: 'q1', quizId: 'quiz001', type: 'mcq', questionText: 'What will be the output of typeof NaN in JavaScript?', options: JSON.stringify(['number', 'NaN', 'undefined', 'object']), correctOption: 'A', marks: 1, explanation: 'NaN is numeric type in JS.', code_snippet: null },
      { id: 'q2', quizId: 'quiz001', type: 'mcq', questionText: 'Which HTTP header helps prevent Cross-Site Scripting (XSS)?', options: JSON.stringify(['Access-Control-Allow-Origin', 'Content-Security-Policy', 'X-Frame-Options', 'Strict-Transport-Security']), correctOption: 'B', marks: 1, explanation: 'Content-Security-Policy restricts script sources.', code_snippet: null },
      { id: 'q3', quizId: 'quiz001', type: 'mcq', questionText: 'What is the result of 0.1 + 0.2 === 0.3 in JavaScript?', options: JSON.stringify(['true', 'false', 'TypeError', 'undefined']), correctOption: 'B', marks: 1, explanation: 'Floating point precision results in 0.30000000000000004.', code_snippet: 'console.log(0.1 + 0.2 === 0.3);' }
    ],
    results: []
  };
}

function saveDatabase() {
  if (useMemDb) return;
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {}
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function initDatabase() {
  if (db || useMemDb) return db;

  try {
    let wasmBinary = null;
    const possibleWasmPaths = [
      path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm'),
      path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      '/var/task/node_modules/sql.js/dist/sql-wasm.wasm'
    ];

    for (const p of possibleWasmPaths) {
      if (fs.existsSync(p)) {
        try {
          wasmBinary = fs.readFileSync(p);
          break;
        } catch (e) {}
      }
    }

    const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : {});

    if (!fs.existsSync(DB_PATH)) {
      const seedDbPath = path.join(__dirname, 'quizportal.db');
      if (fs.existsSync(seedDbPath) && seedDbPath !== DB_PATH) {
        try { fs.copyFileSync(seedDbPath, DB_PATH); } catch (e) {}
      }
    }

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON;');

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        rawPassword TEXT,
        role TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now'))
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subject TEXT DEFAULT 'General',
        category TEXT DEFAULT 'General',
        durationMinutes INTEGER NOT NULL DEFAULT 15,
        totalMarks REAL DEFAULT 0,
        passingMarks REAL NOT NULL DEFAULT 60,
        negativeMarks REAL DEFAULT 0,
        maxAttempts INTEGER NOT NULL DEFAULT 1,
        randomize INTEGER NOT NULL DEFAULT 0,
        createdBy TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        emoji TEXT DEFAULT '📝',
        description TEXT
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        quizId TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'mcq',
        questionText TEXT NOT NULL,
        options TEXT DEFAULT '[]',
        correctOption TEXT NOT NULL,
        marks REAL NOT NULL DEFAULT 1,
        explanation TEXT,
        code_snippet TEXT,
        image_url TEXT
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        quizId TEXT NOT NULL,
        quizTitle TEXT,
        answers TEXT DEFAULT '{}',
        score REAL NOT NULL DEFAULT 0,
        totalMarks REAL NOT NULL DEFAULT 0,
        percentage REAL NOT NULL DEFAULT 0,
        passed INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        wrong INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        submittedAt TEXT DEFAULT (datetime('now')),
        timeTaken TEXT DEFAULT '00:00:00',
        antiCheatStrikes INTEGER DEFAULT 0
      );
    `);

    const addColumnSafe = (table, colDef) => {
      try { db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef};`); } catch (e) {}
    };

    addColumnSafe('users', 'rawPassword TEXT');
    addColumnSafe('users', 'createdAt TEXT DEFAULT (datetime(\'now\'))');
    addColumnSafe('quizzes', 'subject TEXT DEFAULT \'General\'');
    addColumnSafe('quizzes', 'totalMarks REAL DEFAULT 0');
    addColumnSafe('quizzes', 'negativeMarks REAL DEFAULT 0');
    addColumnSafe('quizzes', 'maxAttempts INTEGER NOT NULL DEFAULT 1');
    addColumnSafe('quizzes', 'randomize INTEGER NOT NULL DEFAULT 0');
    addColumnSafe('quizzes', 'emoji TEXT DEFAULT \'📝\'');
    addColumnSafe('quizzes', 'description TEXT');

    const usersStmt = db.prepare('SELECT COUNT(*) as count FROM users');
    let userCount = 0;
    if (usersStmt.step()) {
      userCount = usersStmt.getAsObject().count;
    }
    usersStmt.free();

    if (userCount === 0) {
      const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
      const adminHashed = await bcrypt.hash(adminPass, 10);
      const studentHashed = await bcrypt.hash('student123', 10);
      const adminId = genId('user');
      const studentId = genId('user');

      db.run('INSERT INTO users (id, name, email, password, rawPassword, role) VALUES (?, ?, ?, ?, ?, ?)', [
        adminId, 'Portal Admin', 'admin@quiz.com', adminHashed, adminPass, 'admin'
      ]);

      db.run('INSERT INTO users (id, name, email, password, rawPassword, role) VALUES (?, ?, ?, ?, ?, ?)', [
        studentId, 'Ali Student', 'ali@student.com', studentHashed, 'student123', 'student'
      ]);

      const quizId = genId('quiz');
      db.run(`
        INSERT INTO quizzes (id, title, subject, category, durationMinutes, passingMarks, negativeMarks, maxAttempts, randomize, createdBy, emoji, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [quizId, 'JavaScript & Web Security Fundamentals', 'Web Development', 'Web Development', 10, 60, 0.25, 1, 0, adminId, '💻', 'Test your core JavaScript, Async, and Web Security concepts.']);

      const q1Id = genId('q');
      db.run(`
        INSERT INTO questions (id, quizId, type, questionText, options, correctOption, marks, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [q1Id, quizId, 'mcq', 'What will be the output of typeof NaN in JavaScript?', JSON.stringify(['number', 'NaN', 'undefined', 'object']), 'A', 1, 'In JavaScript, NaN is numeric type.']);

      const q2Id = genId('q');
      db.run(`
        INSERT INTO questions (id, quizId, type, questionText, options, correctOption, marks, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [q2Id, quizId, 'mcq', 'Which HTTP header helps prevent Cross-Site Scripting (XSS)?', JSON.stringify(['Access-Control-Allow-Origin', 'Content-Security-Policy', 'X-Frame-Options', 'Strict-Transport-Security']), 'B', 1, 'Content-Security-Policy restricts script sources.']);

      saveDatabase();
    }

    return db;
  } catch (err) {
    console.warn('[WASM Init Failed - Using Pure JS Fallback Engine]', err.message);
    useMemDb = true;
    await initMemStore();
    return null;
  }
}

function queryAll(sql, params = []) {
  if (useMemDb) {
    return queryAllMem(sql, params);
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runSql(sql, params = []) {
  if (useMemDb) {
    return runSqlMem(sql, params);
  }
  db.run(sql, params);
  saveDatabase();
  const lastId = queryOne('SELECT last_insert_rowid() as id');
  const changes = queryOne('SELECT changes() as count');
  return { lastInsertRowid: lastId ? lastId.id : 0, changes: changes ? changes.count : 0 };
}

// ── Pure JS Memory Store Query Evaluator ──
function queryAllMem(sql, params = []) {
  const cleanSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  if (cleanSql.includes('from users')) {
    let list = [...memStore.users];
    if (cleanSql.includes('lower(email) = lower(?)')) {
      const email = String(params[0] || '').trim().toLowerCase();
      list = list.filter(u => u.email.toLowerCase() === email);
    } else if (cleanSql.includes('where id = ?')) {
      list = list.filter(u => u.id === params[0]);
    }
    return list.map(u => ({
      ...u,
      quizzesAttempted: memStore.results.filter(r => r.userId === u.id).length
    }));
  }

  if (cleanSql.includes('from quizzes')) {
    let list = [...memStore.quizzes];
    if (cleanSql.includes('where id = ?')) {
      list = list.filter(q => q.id === params[0]);
    }
    const userId = params[params.length - 1];
    return list.map(q => ({
      ...q,
      creatorName: 'Portal Admin',
      questionCount: memStore.questions.filter(qs => qs.quizId === q.id).length,
      computedTotalMarks: memStore.questions.filter(qs => qs.quizId === q.id).reduce((sum, item) => sum + (Number(item.marks) || 1), 0),
      myAttempts: memStore.results.filter(r => r.quizId === q.id && r.userId === userId).length
    }));
  }

  if (cleanSql.includes('from questions')) {
    let list = [...memStore.questions];
    if (cleanSql.includes('where quizid = ?')) {
      list = list.filter(q => q.quizId === params[0]);
    } else if (cleanSql.includes('where id = ?')) {
      list = list.filter(q => q.id === params[0]);
    }
    return list.map(q => {
      const quiz = memStore.quizzes.find(qz => qz.id === q.quizId);
      return { ...q, quiz_title: quiz ? quiz.title : 'Quiz' };
    });
  }

  if (cleanSql.includes('from results')) {
    let list = [...memStore.results];
    if (cleanSql.includes('where r.userid = ?') || cleanSql.includes('where userid = ?')) {
      list = list.filter(r => r.userId === params[0]);
    } else if (cleanSql.includes('where r.quizid = ?') || cleanSql.includes('where quizid = ?')) {
      list = list.filter(r => r.quizId === params[0]);
    } else if (cleanSql.includes('where r.id = ?') || cleanSql.includes('where id = ?')) {
      list = list.filter(r => r.id === params[0]);
    }
    return list.map(r => {
      const user = memStore.users.find(u => u.id === r.userId);
      const quiz = memStore.quizzes.find(qz => qz.id === r.quizId);
      return {
        ...r,
        student_name: user ? user.name : 'Student',
        student_email: user ? user.email : '',
        quiz_title: quiz ? quiz.title : (r.quizTitle || 'Quiz')
      };
    });
  }

  return [];
}

function runSqlMem(sql, params = []) {
  const cleanSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  if (cleanSql.startsWith('insert into users')) {
    const newUser = {
      id: params[0],
      name: params[1],
      email: params[2],
      password: params[3],
      rawPassword: params[4],
      role: params[5],
      createdAt: params[6] || new Date().toISOString()
    };
    memStore.users.push(newUser);
    return { lastInsertRowid: 1, changes: 1 };
  }

  if (cleanSql.startsWith('insert into quizzes')) {
    const newQuiz = {
      id: params[0],
      title: params[1],
      subject: params[2],
      category: params[3],
      durationMinutes: params[4],
      totalMarks: params[5],
      passingMarks: params[6],
      negativeMarks: params[7],
      maxAttempts: params[8],
      randomize: params[9],
      createdBy: params[10],
      createdAt: params[11] || new Date().toISOString(),
      emoji: params[12] || '📝',
      description: params[13] || ''
    };
    memStore.quizzes.push(newQuiz);
    return { lastInsertRowid: 1, changes: 1 };
  }

  if (cleanSql.startsWith('insert into questions')) {
    const newQ = {
      id: params[0],
      quizId: params[1],
      type: params[2],
      questionText: params[3],
      options: params[4],
      correctOption: params[5],
      marks: params[6],
      explanation: params[7],
      code_snippet: params[8]
    };
    memStore.questions.push(newQ);
    return { lastInsertRowid: 1, changes: 1 };
  }

  if (cleanSql.startsWith('insert into results')) {
    const newRes = {
      id: params[0],
      userId: params[1],
      quizId: params[2],
      quizTitle: params[3],
      answers: params[4],
      score: params[5],
      totalMarks: params[6],
      percentage: params[7],
      passed: params[8],
      correct: params[9],
      wrong: params[10],
      skipped: params[11],
      submittedAt: new Date().toISOString(),
      timeTaken: params[13] || '00:00'
    };
    memStore.results.push(newRes);
    return { lastInsertRowid: 1, changes: 1 };
  }

  if (cleanSql.startsWith('update users')) {
    const idx = memStore.users.findIndex(u => u.id === params[2]);
    if (idx >= 0) {
      memStore.users[idx].password = params[0];
      memStore.users[idx].rawPassword = params[1];
      return { lastInsertRowid: 0, changes: 1 };
    }
  }

  if (cleanSql.startsWith('delete from quizzes')) {
    const initialLen = memStore.quizzes.length;
    memStore.quizzes = memStore.quizzes.filter(q => q.id !== params[0]);
    return { lastInsertRowid: 0, changes: initialLen - memStore.quizzes.length };
  }

  if (cleanSql.startsWith('delete from questions')) {
    memStore.questions = memStore.questions.filter(q => q.id !== params[0] && q.quizId !== params[0]);
    return { lastInsertRowid: 0, changes: 1 };
  }

  return { lastInsertRowid: 0, changes: 0 };
}

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, msg: 'Authentication token missing or invalid format.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ ok: false, msg: 'User account no longer exists.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, msg: 'Invalid or expired session token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ ok: false, msg: `Access denied. Requires ${role} role permissions.` });
    }
    next();
  };
}

function parseOptions(options) {
  if (!options) return [];
  try {
    const arr = typeof options === 'string' ? JSON.parse(options) : options;
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const app = express();

let dbInitPromise = null;
app.use(async (req, res, next) => {
  try {
    if (!dbInitPromise) {
      dbInitPromise = initDatabase();
    }
    await dbInitPromise;
  } catch (err) {
    console.error('Database init error:', err);
  }
  next();
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));

app.get('/js/:file', (req, res) => {
  const filePath = path.join(__dirname, 'js', req.params.file);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.sendFile(filePath);
  }
  res.status(404).send('JS File Not Found');
});

app.get('/css/:file', (req, res) => {
  const filePath = path.join(__dirname, 'css', req.params.file);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    return res.sendFile(filePath);
  }
  res.status(404).send('CSS File Not Found');
});

app.use(express.static(path.join(__dirname)));

// ── Auth Endpoints ──
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, msg: 'Email and password required.' });
  const user = queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ ok: false, msg: 'Invalid email or password.' });
  }
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ ok: true, msg: 'Login successful!', token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ ok: false, msg: 'All fields required.' });
  const userRole = role === 'admin' ? 'admin' : 'student';
  if (queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()])) {
    return res.status(400).json({ ok: false, msg: 'Account already exists with this email.' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = genId('user');
  runSql('INSERT INTO users (id, name, email, password, rawPassword, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))', [
    userId, name.trim(), email.trim().toLowerCase(), hashedPassword, password, userRole
  ]);
  const token = jwt.sign({ id: userId, name: name.trim(), email: email.trim().toLowerCase(), role: userRole }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ ok: true, msg: 'Registered!', token, user: { id: userId, name: name.trim(), email: email.trim().toLowerCase(), role: userRole } });
});

app.get('/api/auth/me', verifyToken, (req, res) => res.json({ ok: true, user: req.user }));

app.post('/api/auth/users', verifyToken, requireRole('admin'), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ ok: false, msg: 'Name, email, and password required.' });
  if (queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()])) {
    return res.status(400).json({ ok: false, msg: 'Account already exists.' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = genId('user');
  runSql('INSERT INTO users (id, name, email, password, rawPassword, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))', [
    userId, name.trim(), email.trim().toLowerCase(), hashedPassword, password, 'student'
  ]);
  res.json({ ok: true, msg: 'Student account created!', userId });
});

app.get('/api/auth/users', verifyToken, requireRole('admin'), (req, res) => {
  const users = queryAll(`SELECT u.*, (SELECT COUNT(*) FROM results r WHERE r.userId = u.id) as quizzesAttempted FROM users u ORDER BY u.createdAt DESC`);
  res.json({ ok: true, users: users.map(u => ({ ...u, quizzesAttempted: u.quizzesAttempted || 0, quizAttempts: u.quizzesAttempted || 0, registeredOn: u.createdAt, password: u.rawPassword || u.password })) });
});

app.put('/api/auth/users/:id/password', verifyToken, requireRole('admin'), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ ok: false, msg: 'New password required.' });
  const hashed = await bcrypt.hash(newPassword, 10);
  runSql('UPDATE users SET password = ?, rawPassword = ? WHERE id = ?', [hashed, newPassword, req.params.id]);
  res.json({ ok: true, msg: 'Password updated!' });
});

// ── Quiz Endpoints ──
app.get('/api/quizzes', verifyToken, (req, res) => {
  const quizzes = queryAll(`
    SELECT q.*, u.name as creatorName,
           (SELECT COUNT(*) FROM questions qs WHERE qs.quizId = q.id) as questionCount,
           (SELECT COALESCE(SUM(qs.marks),0) FROM questions qs WHERE qs.quizId = q.id) as computedTotalMarks,
           (SELECT COUNT(*) FROM results r WHERE r.quizId = q.id AND r.userId = ?) as myAttempts
    FROM quizzes q LEFT JOIN users u ON q.createdBy = u.id ORDER BY q.createdAt DESC
  `, [req.user.id]);
  res.json({ ok: true, quizzes: quizzes.map(q => ({
    ...q, subject: q.category || q.subject || 'General', category: q.category || q.subject || 'General',
    duration_minutes: q.durationMinutes, passing_score: q.passingMarks, negative_marking: q.negativeMarks || 0,
    question_count: q.questionCount, questionCount: q.questionCount, totalMarks: q.computedTotalMarks || q.totalMarks || 0,
    creator_name: q.creatorName, maxAttempts: Number(q.maxAttempts) || 0, myAttempts: Number(q.myAttempts) || 0,
    canAttempt: Number(q.maxAttempts) <= 0 || (Number(q.myAttempts) || 0) < Number(q.maxAttempts), scheduleStatus: 'ACTIVE'
  })) });
});

app.get('/api/quizzes/categories', verifyToken, (req, res) => {
  const rows = queryAll('SELECT DISTINCT category, subject FROM quizzes');
  const cats = new Set(['General']);
  rows.forEach(r => { if (r.category) cats.add(r.category.trim()); if (r.subject) cats.add(r.subject.trim()); });
  res.json({ ok: true, categories: Array.from(cats) });
});

app.get('/api/quizzes/:id/session', verifyToken, (req, res) => {
  const quiz = queryOne('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) return res.status(404).json({ ok: false, msg: 'Quiz not found.' });
  let questions = queryAll('SELECT id, quizId, type, questionText, code_snippet, image_url, options, marks, explanation FROM questions WHERE quizId = ? ORDER BY id ASC', [quiz.id]);
  if (!questions.length) return res.status(400).json({ ok: false, msg: 'Quiz has no questions.' });
  if (quiz.randomize) questions = shuffle(questions);
  res.json({
    ok: true,
    quiz: { id: quiz.id, title: quiz.title, description: quiz.description, emoji: quiz.emoji, category: quiz.category || quiz.subject, duration_minutes: quiz.durationMinutes, passing_score: quiz.passingMarks, negative_marking: quiz.negativeMarks || 0, maxAttempts: Number(quiz.maxAttempts) || 0, randomize: !!quiz.randomize, total_questions: questions.length },
    questions: questions.map(q => ({ id: q.id, quizId: q.quizId, type: q.type || 'mcq', questionText: q.questionText, codeSnippet: q.code_snippet, code_snippet: q.code_snippet, options: quiz.randomize ? shuffle(parseOptions(q.options)) : parseOptions(q.options), marks: Number(q.marks) || 1, points: Number(q.marks) || 1 }))
  });
});

app.post('/api/quizzes/:id/submit', verifyToken, (req, res) => {
  const userAnswers = req.body.answers || req.body.userAnswers || {};
  const timeTakenStr = req.body.timeTaken || '00:00';
  const quiz = queryOne('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) return res.status(404).json({ ok: false, msg: 'Quiz not found.' });
  const questions = queryAll('SELECT * FROM questions WHERE quizId = ? ORDER BY id ASC', [quiz.id]);
  let totalPoints = 0, pointsEarned = 0, correct = 0, wrong = 0, skipped = 0;
  const neg = Number(quiz.negativeMarks) || 0;
  const detailed = [];

  for (const q of questions) {
    const pts = Number(q.marks) || 1;
    totalPoints += pts;
    const ans = userAnswers[q.id] !== undefined ? userAnswers[q.id] : null;
    let isCorrect = false;
    if (ans === null || ans === '') skipped++;
    else if (q.type === 'fillblank') {
      isCorrect = String(ans).trim().toLowerCase() === String(q.correctOption).trim().toLowerCase();
    } else {
      const opts = parseOptions(q.options);
      const letterMap = { A: 0, B: 1, C: 2, D: 3 };
      const correctText = letterMap[q.correctOption] !== undefined ? opts[letterMap[q.correctOption]] : q.correctOption;
      isCorrect = String(ans).toUpperCase() === String(q.correctOption).toUpperCase() || String(ans) === String(correctText);
    }
    if (ans !== null && ans !== '') {
      if (isCorrect) { correct++; pointsEarned += pts; }
      else { wrong++; pointsEarned -= pts * neg; }
    }
    detailed.push({ id: q.id, questionText: q.questionText, codeSnippet: q.code_snippet, type: q.type || 'mcq', options: parseOptions(q.options), correctAnswer: q.correctOption, explanation: q.explanation || '', marks: pts });
  }

  if (pointsEarned < 0) pointsEarned = 0;
  const percentage = totalPoints > 0 ? Math.round((pointsEarned / totalPoints) * 100 * 10) / 10 : 0;
  const passed = percentage >= Number(quiz.passingMarks || 60);
  const resultId = genId('result');
  runSql(`INSERT INTO results (id, userId, quizId, quizTitle, answers, score, totalMarks, percentage, passed, correct, wrong, skipped, submittedAt, timeTaken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`, [
    resultId, req.user.id, quiz.id, quiz.title, JSON.stringify(userAnswers), Math.round(pointsEarned), totalPoints, percentage, passed ? 1 : 0, correct, wrong, skipped, timeTakenStr
  ]);
  res.json({ ok: true, resultId, score: Math.round(pointsEarned), totalMarks: totalPoints, correct, wrong, skipped, percentage, passed, quizTitle: quiz.title, result: { id: resultId, userId: req.user.id, quizId: quiz.id, quizTitle: quiz.title, score: Math.round(pointsEarned), totalMarks: totalPoints, percentage, passed: !!passed, correct, wrong, skipped, timeTaken: timeTakenStr, submittedAt: new Date().toISOString() }, questions: detailed });
});

app.post('/api/quizzes', verifyToken, requireRole('admin'), (req, res) => {
  const { title, subject, category, durationMinutes, passingMarks, negativeMarks, maxAttempts, randomize, emoji, description } = req.body;
  if (!title) return res.status(400).json({ ok: false, msg: 'Quiz title required.' });
  const quizId = genId('quiz');
  runSql(`INSERT INTO quizzes (id, title, subject, category, durationMinutes, passingMarks, negativeMarks, maxAttempts, randomize, createdBy, emoji, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`, [
    quizId, title.trim(), category || subject || 'General', category || subject || 'General', parseInt(durationMinutes) || 15, parseFloat(passingMarks) || 60, parseFloat(negativeMarks) || 0, parseInt(maxAttempts) || 0, randomize ? 1 : 0, req.user.id, emoji || '📝', description || ''
  ]);
  res.json({ ok: true, msg: 'Quiz created!', quizId, id: quizId });
});

app.put('/api/quizzes/:id', verifyToken, requireRole('admin'), (req, res) => {
  const { title, subject, category, durationMinutes, passingMarks, negativeMarks, maxAttempts, randomize, emoji, description } = req.body;
  runSql(`UPDATE quizzes SET title = ?, subject = ?, category = ?, durationMinutes = ?, passingMarks = ?, negativeMarks = ?, maxAttempts = ?, randomize = ?, emoji = ?, description = ? WHERE id = ?`, [
    title.trim(), category || subject || 'General', category || subject || 'General', parseInt(durationMinutes) || 15, parseFloat(passingMarks) || 60, parseFloat(negativeMarks) || 0, parseInt(maxAttempts) || 0, randomize ? 1 : 0, emoji || '📝', description || '', req.params.id
  ]);
  res.json({ ok: true, msg: 'Quiz updated!' });
});

app.delete('/api/quizzes/:id', verifyToken, requireRole('admin'), (req, res) => {
  runSql('DELETE FROM questions WHERE quizId = ?', [req.params.id]);
  runSql('DELETE FROM results WHERE quizId = ?', [req.params.id]);
  runSql('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
  res.json({ ok: true, msg: 'Quiz deleted!' });
});

// ── Question Endpoints ──
app.get('/api/questions/quiz/:quizId', verifyToken, requireRole('admin'), (req, res) => {
  const questions = queryAll('SELECT * FROM questions WHERE quizId = ? ORDER BY id ASC', [req.params.quizId]);
  res.json({ ok: true, questions: questions.map(q => ({ ...q, options: parseOptions(q.options), marks: Number(q.marks) || 1 })) });
});

app.get('/api/questions/all', verifyToken, requireRole('admin'), (req, res) => {
  const questions = queryAll('SELECT q.*, qz.title as quiz_title FROM questions q LEFT JOIN quizzes qz ON q.quizId = qz.id ORDER BY q.rowid DESC LIMIT 500');
  res.json({ ok: true, questions: questions.map(q => ({ ...q, quizTitle: q.quiz_title, options: parseOptions(q.options), marks: Number(q.marks) || 1 })) });
});

app.post('/api/questions', verifyToken, requireRole('admin'), (req, res) => {
  const { quizId, type, questionText, options, correctOption, marks, explanation, codeSnippet } = req.body;
  if (!quizId || !questionText) return res.status(400).json({ ok: false, msg: 'Quiz ID and Question text required.' });
  const qId = genId('q');
  runSql(`INSERT INTO questions (id, quizId, type, questionText, options, correctOption, marks, explanation, code_snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    qId, quizId, type || 'mcq', questionText.trim(), JSON.stringify(options || []), String(correctOption || '').trim(), Number(marks) || 1, explanation || '', codeSnippet || null
  ]);
  res.json({ ok: true, msg: 'Question created!', questionId: qId, id: qId });
});

app.delete('/api/questions/:id', verifyToken, requireRole('admin'), (req, res) => {
  runSql('DELETE FROM questions WHERE id = ?', [req.params.id]);
  res.json({ ok: true, msg: 'Question deleted!' });
});

// ── Results Endpoints ──
app.get('/api/results/my', verifyToken, (req, res) => {
  const results = queryAll(`SELECT r.*, q.title as quiz_title FROM results r LEFT JOIN quizzes q ON r.quizId = q.id WHERE r.userId = ? ORDER BY r.submittedAt DESC`, [req.user.id]);
  res.json({ ok: true, results: results.map(r => ({ ...r, quizTitle: r.quiz_title || r.quizTitle, passed: !!r.passed, score: Number(r.score) || 0, totalMarks: Number(r.totalMarks) || 0, percentage: Number(r.percentage) || 0 })) });
});

app.get('/api/results/all', verifyToken, requireRole('admin'), (req, res) => {
  const results = queryAll(`SELECT r.*, u.name as student_name, u.email as student_email, q.title as quiz_title FROM results r JOIN users u ON r.userId = u.id LEFT JOIN quizzes q ON r.quizId = q.id ORDER BY r.submittedAt DESC LIMIT 500`);
  res.json({ ok: true, results: results.map(r => ({ ...r, studentName: r.student_name, userName: r.student_name, studentEmail: r.student_email, userEmail: r.student_email, quizTitle: r.quiz_title || r.quizTitle, passed: !!r.passed, score: Number(r.score) || 0, totalMarks: Number(r.totalMarks) || 0, percentage: Number(r.percentage) || 0 })) });
});

app.get('/api/results/:id', verifyToken, (req, res) => {
  const result = queryOne(`SELECT r.*, q.title as quiz_title, u.name as student_name FROM results r LEFT JOIN quizzes q ON r.quizId = q.id LEFT JOIN users u ON r.userId = u.id WHERE r.id = ?`, [req.params.id]);
  if (!result) return res.status(404).json({ ok: false, msg: 'Result not found.' });
  let detailedAnswers = [];
  try { detailedAnswers = JSON.parse(result.answers || '[]'); } catch(e){}
  const questions = queryAll('SELECT * FROM questions WHERE quizId = ? ORDER BY id ASC', [result.quizId]);
  res.json({ ok: true, result: { ...result, quizTitle: result.quiz_title || result.quizTitle, studentName: result.student_name, passed: !!result.passed, score: Number(result.score) || 0, totalMarks: Number(result.totalMarks) || 0, percentage: Number(result.percentage) || 0, answers: detailedAnswers }, questions: questions.map(q => ({ ...q, options: parseOptions(q.options), correctAnswer: q.correctOption })) });
});

// Health check & root fallback
app.get('/api/health', (req, res) => res.json({ ok: true, message: 'QuizPortal API Online! 🚀' }));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/student.html', (req, res) => res.sendFile(path.join(__dirname, 'student.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

async function startServer() {
  try {
    await initDatabase();
    if (require.main === module) {
      app.listen(PORT, () => console.log(`🎯 QuizPortal API running on http://localhost:${PORT}`));
    }
  } catch (err) {
    console.error('Server error:', err);
  }
}

startServer();

module.exports = app;
