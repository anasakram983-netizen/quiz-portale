const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH ||
  (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? '/tmp/quizportal.db'
    : path.join(__dirname, '..', 'quizportal.db'));

let db = null;

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function initDatabase() {
  let wasmFile = null;
  try {
    const wasmDir = path.dirname(require.resolve('sql.js'));
    wasmFile = path.join(wasmDir, 'sql-wasm.wasm');
  } catch (e) {}

  const SQL = await initSqlJs(
    wasmFile && fs.existsSync(wasmFile)
      ? { locateFile: () => wasmFile }
      : {}
  );

  if (!fs.existsSync(DB_PATH)) {
    const seedDbPath = path.join(__dirname, '..', 'quizportal.db');
    if (fs.existsSync(seedDbPath)) {
      try {
        fs.copyFileSync(seedDbPath, DB_PATH);
      } catch (e) {}
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

  try {
    const certCols = db.exec("PRAGMA table_info(certificates)");
    if (certCols.length && certCols[0].values) {
      const idCol = certCols[0].values.find(c => c[1] === 'id');
      if (idCol && String(idCol[2]).toUpperCase().includes('INT')) {
        db.run("DROP TABLE certificates;");
      }
    }
  } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      certificate_code TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL,
      result_id TEXT NOT NULL,
      issue_date TEXT DEFAULT (datetime('now'))
    );
  `);

  const addColumnSafe = (table, colDef) => {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
    } catch (e) {}
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
  addColumnSafe('quizzes', 'createdAt TEXT DEFAULT (datetime(\'now\'))');
  addColumnSafe('questions', 'type TEXT NOT NULL DEFAULT \'mcq\'');
  addColumnSafe('questions', 'options TEXT DEFAULT \'[]\'');
  addColumnSafe('questions', 'marks REAL NOT NULL DEFAULT 1');
  addColumnSafe('questions', 'code_snippet TEXT');
  addColumnSafe('questions', 'image_url TEXT');
  addColumnSafe('results', 'quizTitle TEXT');
  addColumnSafe('results', 'answers TEXT DEFAULT \'{}\'');
  addColumnSafe('results', 'totalMarks REAL NOT NULL DEFAULT 0');
  addColumnSafe('results', 'correct INTEGER NOT NULL DEFAULT 0');
  addColumnSafe('results', 'wrong INTEGER NOT NULL DEFAULT 0');
  addColumnSafe('results', 'skipped INTEGER NOT NULL DEFAULT 0');
  addColumnSafe('results', 'timeTaken TEXT DEFAULT \'00:00:00\'');
  addColumnSafe('results', 'antiCheatStrikes INTEGER DEFAULT 0');

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
    `, [
      q1Id, quizId, 'mcq',
      'What will be the output of the following JavaScript code?\nconsole.log(typeof NaN);',
      JSON.stringify(['number', 'NaN', 'undefined', 'object']),
      'A', 1,
      'In JavaScript, NaN (Not-a-Number) is technically a numeric type, so typeof NaN returns "number".'
    ]);

    const q2Id = genId('q');
    db.run(`
      INSERT INTO questions (id, quizId, type, questionText, options, correctOption, marks, explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      q2Id, quizId, 'mcq',
      'Which HTTP header helps prevent Cross-Site Scripting (XSS) attacks by controlling allowed resources?',
      JSON.stringify(['Access-Control-Allow-Origin', 'Content-Security-Policy', 'X-Frame-Options', 'Strict-Transport-Security']),
      'B', 1,
      'Content-Security-Policy (CSP) restricts sources from which resources (scripts, styles, images) can be loaded.'
    ]);

    const q3Id = genId('q');
    db.run(`
      INSERT INTO questions (id, quizId, type, questionText, code_snippet, options, correctOption, marks, explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      q3Id, quizId, 'mcq',
      'What is the result of 0.1 + 0.2 === 0.3 in JavaScript?',
      'console.log(0.1 + 0.2 === 0.3);',
      JSON.stringify(['true', 'false', 'TypeError', 'undefined']),
      'B', 1,
      'Due to IEEE 754 floating-point arithmetic representation, 0.1 + 0.2 equals 0.30000000000000004.'
    ]);

    saveDatabase();
  } else {
    saveDatabase();
  }

  return db;
}

function queryAll(sql, params = []) {
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
  db.run(sql, params);
  saveDatabase();
  const lastId = queryOne('SELECT last_insert_rowid() as id');
  const changes = queryOne('SELECT changes() as count');
  return { lastInsertRowid: lastId ? lastId.id : 0, changes: changes ? changes.count : 0 };
}

module.exports = {
  initDatabase,
  queryAll,
  queryOne,
  runSql,
  saveDatabase,
  genId
};
