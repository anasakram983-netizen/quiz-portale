const express = require('express');
const { queryAll, queryOne, runSql, genId, saveDatabase } = require('../database');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

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

router.get('/', verifyToken, (req, res) => {
  const quizzes = queryAll(`
    SELECT q.*, u.name as creatorName,
           (SELECT COUNT(*) FROM questions qs WHERE qs.quizId = q.id) as questionCount,
           (SELECT COALESCE(SUM(qs.marks),0) FROM questions qs WHERE qs.quizId = q.id) as computedTotalMarks,
           (SELECT COUNT(*) FROM results r WHERE r.quizId = q.id AND r.userId = ?) as myAttempts
    FROM quizzes q
    LEFT JOIN users u ON q.createdBy = u.id
    ORDER BY q.createdAt DESC
  `, [req.user.id]);

  const now = new Date();
  const formattedQuizzes = quizzes.map(q => {
    const subject = q.category || q.subject || 'General';
    return {
      ...q,
      subject,
      category: subject,
      duration_minutes: q.durationMinutes,
      passing_score: q.passingMarks,
      negative_marking: q.negativeMarks || 0,
      question_count: q.questionCount,
      questionCount: q.questionCount,
      // Dynamically computed total marks from questions
      totalMarks: q.computedTotalMarks || q.totalMarks || 0,
      creator_name: q.creatorName,
      maxAttempts: Number(q.maxAttempts) || 0,
      myAttempts: Number(q.myAttempts) || 0,
      canAttempt: Number(q.maxAttempts) <= 0 || (Number(q.myAttempts) || 0) < Number(q.maxAttempts),
      scheduleStatus: 'ACTIVE'
    };
  });

  res.json({ ok: true, quizzes: formattedQuizzes });
});

router.get('/categories', verifyToken, (req, res) => {
  const rows = queryAll('SELECT DISTINCT category, subject FROM quizzes WHERE (category IS NOT NULL AND category != "") OR (subject IS NOT NULL AND subject != "")');
  const cats = new Set(['General']);
  rows.forEach(r => {
    if (r.category && r.category.trim()) cats.add(r.category.trim());
    if (r.subject && r.subject.trim()) cats.add(r.subject.trim());
  });
  res.json({ ok: true, categories: Array.from(cats) });
});

router.get('/:id/session', verifyToken, (req, res) => {
  const quiz = queryOne('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) {
    return res.status(404).json({ ok: false, msg: 'Quiz not found.' });
  }

  const attemptCount = queryOne('SELECT COUNT(*) as count FROM results WHERE quizId = ? AND userId = ?', [quiz.id, req.user.id]);
  const rawMax = Number(quiz.maxAttempts);
  const maxAttempts = (rawMax <= 0 || Number.isNaN(rawMax)) ? 999999 : rawMax;
  if (attemptCount && attemptCount.count >= maxAttempts) {
    return res.status(403).json({ ok: false, msg: `You have already used all ${maxAttempts} attempt(s) for this quiz.` });
  }

  let questions = queryAll(`
    SELECT id, quizId, type, questionText, code_snippet, image_url, options, marks, explanation
    FROM questions
    WHERE quizId = ?
    ORDER BY id ASC
  `, [quiz.id]);

  if (questions.length === 0) {
    return res.status(400).json({ ok: false, msg: 'This quiz has no questions available.' });
  }

  if (quiz.randomize) {
    questions = shuffle(questions);
  }

  const subject = quiz.category || quiz.subject || 'General';
  const sessionQuestions = questions.map(q => {
    const opts = parseOptions(q.options);
    return {
      id: q.id,
      quizId: q.quizId,
      type: q.type || 'mcq',
      questionText: q.questionText,
      codeSnippet: q.code_snippet,
      code_snippet: q.code_snippet,
      imageUrl: q.image_url,
      options: quiz.randomize ? shuffle(opts) : opts,
      marks: Number(q.marks) || 1,
      points: Number(q.marks) || 1
    };
  });

  res.json({
    ok: true,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      emoji: quiz.emoji,
      category: subject,
      subject,
      duration_minutes: quiz.durationMinutes,
      durationMinutes: quiz.durationMinutes,
      passing_score: quiz.passingMarks,
      passingMarks: quiz.passingMarks,
      negative_marking: quiz.negativeMarks || 0,
      negativeMarks: quiz.negativeMarks || 0,
      maxAttempts,
      randomize: !!quiz.randomize,
      total_questions: questions.length,
      totalQuestions: questions.length
    },
    questions: sessionQuestions
  });
});

router.post('/:id/submit', verifyToken, (req, res) => {
  const userAnswers = req.body.answers || req.body.userAnswers || {};
  const timeSpentSeconds = Number(req.body.timeSpentSeconds) || 0;
  const antiCheatStrikes = Number(req.body.antiCheatStrikes) || 0;
  const timeTakenStr = req.body.timeTaken || null;

  const quiz = queryOne('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) {
    return res.status(404).json({ ok: false, msg: 'Quiz not found.' });
  }

  const attemptCount = queryOne('SELECT COUNT(*) as count FROM results WHERE quizId = ? AND userId = ?', [quiz.id, req.user.id]);
  const rawMax = Number(quiz.maxAttempts);
  const maxAttempts = (rawMax <= 0 || Number.isNaN(rawMax)) ? 999999 : rawMax;
  if (attemptCount && attemptCount.count >= maxAttempts) {
    return res.status(403).json({ ok: false, msg: `Max ${maxAttempts} attempt(s) reached for this quiz.` });
  }

  const questions = queryAll('SELECT * FROM questions WHERE quizId = ? ORDER BY id ASC', [quiz.id]);
  if (questions.length === 0) {
    return res.status(400).json({ ok: false, msg: 'No questions found for this quiz.' });
  }

  let totalPointsPossible = 0;
  let pointsEarned = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  const negativeMarkPerWrong = Number(quiz.negativeMarks) || 0;
  const detailedAnswers = [];

  for (const q of questions) {
    const pts = Number(q.marks) || 1;
    totalPointsPossible += pts;

    const qType = q.type || 'mcq';
    const opts = parseOptions(q.options);
    const correctOpt = q.correctOption;
    const rawAnswer = userAnswers && userAnswers[q.id] !== undefined ? userAnswers[q.id] : null;
    const userAns = rawAnswer === null || rawAnswer === undefined ? null : String(rawAnswer);

    let isCorrect = false;
    let selectedLabel = 'Unattempted';

    if (userAns === null || userAns === '') {
      skippedCount++;
    } else if (qType === 'mcq') {
      const letterAns = userAns.toUpperCase();
      const idxMap = { A: 0, B: 1, C: 2, D: 3 };
      let userChoiceText = '';
      if (idxMap[letterAns] !== undefined && opts[idxMap[letterAns]] !== undefined) {
        userChoiceText = opts[idxMap[letterAns]];
      } else if (opts.includes(userAns)) {
        userChoiceText = userAns;
      }
      selectedLabel = userChoiceText || userAns;

      const correctIdx = idxMap[correctOpt];
      const correctText = correctIdx !== undefined ? opts[correctIdx] : correctOpt;

      if (letterAns === correctOpt.toUpperCase()) {
        isCorrect = true;
      } else if (correctText && userChoiceText === correctText) {
        isCorrect = true;
      }

      if (isCorrect) { correctCount++; pointsEarned += pts; }
      else { wrongCount++; pointsEarned -= pts * negativeMarkPerWrong; }

    } else if (qType === 'truefalse') {
      const norm = (s) => String(s).trim().toLowerCase().replace(/[^a-z]/g, '');
      selectedLabel = userAns;
      if (norm(userAns) === norm(correctOpt)) {
        isCorrect = true;
        correctCount++;
        pointsEarned += pts;
      } else {
        wrongCount++;
        pointsEarned -= pts * negativeMarkPerWrong;
      }
    } else if (qType === 'fillblank') {
      const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
      selectedLabel = userAns;
      if (norm(userAns) === norm(correctOpt)) {
        isCorrect = true;
        correctCount++;
        pointsEarned += pts;
      } else {
        wrongCount++;
        pointsEarned -= pts * negativeMarkPerWrong;
      }
    } else {
      skippedCount++;
    }

    detailedAnswers.push({
      questionId: q.id,
      questionText: q.questionText,
      codeSnippet: q.code_snippet,
      type: qType,
      selectedOption: selectedLabel,
      correctOption: correctOpt,
      options: opts,
      isCorrect,
      explanation: q.explanation || '',
      marks: pts
    });
  }

  if (pointsEarned < 0) pointsEarned = 0;
  const percentage = totalPointsPossible > 0 ? Math.round((pointsEarned / totalPointsPossible) * 100 * 10) / 10 : 0;
  const passed = percentage >= Number(quiz.passingMarks || 60);
  const status = passed ? 'PASSED' : 'FAILED';

  const resultId = genId('result');
  let timeTaken = timeTakenStr;
  if (!timeTaken) {
    const h = Math.floor(timeSpentSeconds / 3600);
    const m = Math.floor((timeSpentSeconds % 3600) / 60);
    const s = timeSpentSeconds % 60;
    timeTaken = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  runSql(`
    INSERT INTO results (id, userId, quizId, quizTitle, answers, score, totalMarks, percentage, passed, correct, wrong, skipped, submittedAt, timeTaken, antiCheatStrikes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `, [
    resultId,
    req.user.id,
    quiz.id,
    quiz.title,
    JSON.stringify(userAnswers || {}),
    Math.round(pointsEarned),
    totalPointsPossible,
    percentage,
    passed ? 1 : 0,
    correctCount,
    wrongCount,
    skippedCount,
    timeTaken,
    antiCheatStrikes
  ]);

  let certificateCode = null;
  if (passed) {
    certificateCode = `CERT-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const certId = genId('cert');
    runSql(`
      INSERT INTO certificates (id, certificate_code, user_id, quiz_id, result_id, issue_date)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [certId, certificateCode, req.user.id, quiz.id, resultId]);
  }
  saveDatabase();

  res.json({
    ok: true,
    resultId,
    score: Math.round(pointsEarned),
    totalPointsPossible,
    totalMarks: totalPointsPossible,
    correctCount,
    correct: correctCount,
    wrongCount,
    wrong: wrongCount,
    unattemptedCount: skippedCount,
    skipped: skippedCount,
    percentage,
    status,
    passed,
    passingScore: quiz.passingMarks,
    passingMarks: quiz.passingMarks,
    quizTitle: quiz.title,
    certificateCode,
    detailedAnswers
  });
});

router.post('/', verifyToken, requireRole('admin'), (req, res) => {
  const {
    title, description, category, subject, emoji,
    duration_minutes, durationMinutes,
    passing_score, passingMarks,
    negative_marking, negativeMarks,
    start_time, startTime,
    end_time, endTime,
    totalMarks, maxAttempts, randomize
  } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ ok: false, msg: 'Quiz title is required.' });
  }

  const cat = category || subject || 'General';
  const dur = parseInt(duration_minutes || durationMinutes) || 15;
  const pass = parseFloat(passing_score !== undefined ? passing_score : (passingMarks !== undefined ? passingMarks : 60)) || 0;
  const neg = parseFloat(negative_marking !== undefined ? negative_marking : (negativeMarks !== undefined ? negativeMarks : 0)) || 0;
  const total = parseFloat(totalMarks) || 0;
  // Fix: allow maxAttempts=0 (unlimited), minimum 1 only when a positive value given
  const maxAt = Number.isFinite(Number(maxAttempts)) ? Math.max(0, parseInt(maxAttempts)) : 0;
  const rand = randomize ? 1 : 0;
  const em = emoji && String(emoji).trim() ? String(emoji).trim() : '📝';
  const desc = description || '';

  const quizId = genId('quiz');
  const createdAt = new Date().toISOString();

  runSql(`
    INSERT INTO quizzes (id, title, subject, category, durationMinutes, totalMarks, passingMarks, negativeMarks, maxAttempts, randomize, createdBy, createdAt, emoji, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    quizId,
    String(title).trim(),
    cat,
    cat,
    dur,
    total,
    pass,
    neg,
    maxAt,
    rand,
    req.user.id,
    createdAt,
    em,
    desc
  ]);
  saveDatabase();

  res.json({ ok: true, msg: 'Quiz created successfully!', quizId, id: quizId });
});

router.put('/:id', verifyToken, requireRole('admin'), (req, res) => {
  const existing = queryOne('SELECT id FROM quizzes WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ ok: false, msg: 'Quiz not found.' });
  }

  const {
    title, description, category, subject, emoji,
    duration_minutes, durationMinutes,
    passing_score, passingMarks,
    negative_marking, negativeMarks,
    maxAttempts, randomize
  } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ ok: false, msg: 'Quiz title is required.' });
  }

  const cat = category || subject || existing.category || existing.subject || 'General';
  const dur = parseInt(duration_minutes || durationMinutes) || existing.durationMinutes || 15;
  const pass = parseFloat(passing_score !== undefined ? passing_score : (passingMarks !== undefined ? passingMarks : existing.passingMarks)) || 0;
  const neg = parseFloat(negative_marking !== undefined ? negative_marking : (negativeMarks !== undefined ? negativeMarks : existing.negativeMarks)) || 0;
  // Fix: allow maxAttempts=0 (unlimited)
  const maxAt = Number.isFinite(Number(maxAttempts)) ? Math.max(0, parseInt(maxAttempts)) : (Number(existing.maxAttempts) || 0);
  const rand = randomize !== undefined ? (randomize ? 1 : 0) : (existing.randomize ? 1 : 0);
  const em = emoji !== undefined ? (String(emoji).trim() || '📝') : (existing.emoji || '📝');
  const desc = description !== undefined ? String(description || '') : (existing.description || '');

  runSql(`
    UPDATE quizzes
    SET title = ?, subject = ?, category = ?, durationMinutes = ?, passingMarks = ?, negativeMarks = ?, maxAttempts = ?, randomize = ?, emoji = ?, description = ?
    WHERE id = ?
  `, [
    String(title).trim(),
    cat,
    cat,
    dur,
    pass,
    neg,
    maxAt,
    rand,
    em,
    desc,
    req.params.id
  ]);
  saveDatabase();

  res.json({ ok: true, msg: 'Quiz updated successfully!' });
});

router.delete('/:id', verifyToken, requireRole('admin'), (req, res) => {
  // First delete all questions belonging to this quiz (cascade)
  runSql('DELETE FROM questions WHERE quizId = ?', [req.params.id]);
  // Also delete related results and certificates
  const resultIds = queryAll('SELECT id FROM results WHERE quizId = ?', [req.params.id]);
  resultIds.forEach(r => runSql('DELETE FROM certificates WHERE result_id = ?', [r.id]));
  runSql('DELETE FROM results WHERE quizId = ?', [req.params.id]);

  const result = runSql('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
  if (result.changes === 0) {
    return res.status(404).json({ ok: false, msg: 'Quiz not found.' });
  }
  saveDatabase();

  res.json({ ok: true, msg: 'Quiz deleted successfully!' });
});

module.exports = router;
