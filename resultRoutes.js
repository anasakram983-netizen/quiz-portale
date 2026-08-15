const express = require('express');
const { queryAll, queryOne } = require('../database');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/my', verifyToken, (req, res) => {
  const results = queryAll(`
    SELECT r.*, q.title as quiz_title, q.category, q.subject, q.emoji, q.passingMarks, c.certificate_code
    FROM results r
    LEFT JOIN quizzes q ON r.quizId = q.id
    LEFT JOIN certificates c ON r.id = c.result_id
    WHERE r.userId = ?
    ORDER BY r.submittedAt DESC
  `, [req.user.id]);

  const formatted = results.map(r => {
    const correct = Number(r.correct) || 0;
    const wrong = Number(r.wrong) || 0;
    const skipped = Number(r.skipped) || 0;
    const totalQuestions = correct + wrong + skipped;
    return {
      ...r,
      quiz_title: r.quiz_title,
      quizTitle: r.quiz_title || r.quizTitle,
      subject: r.category || r.subject || 'General',
      category: r.category || r.subject || 'General',
      total_questions: totalQuestions,
      totalQuestions,
      time_spent_seconds: r.timeTaken ? timeStrToSec(r.timeTaken) : 0,
      status: r.passed ? 'PASSED' : 'FAILED',
      user_id: r.userId,
      quiz_id: r.quizId,
      submitted_at: r.submittedAt,
      detailed_answers: r.answers,
      certificateCode: r.certificate_code,
      score: Number(r.score) || 0,
      totalMarks: Number(r.totalMarks) || 0,
      percentage: Number(r.percentage) || 0
    };
  });

  res.json({ ok: true, results: formatted });
});

function timeStrToSec(t) {
  if (!t || typeof t !== 'string') return 0;
  const parts = t.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

router.get('/all', verifyToken, requireRole('admin'), (req, res) => {
  const results = queryAll(`
    SELECT r.*, u.name as student_name, u.email as student_email, q.title as quiz_title, c.certificate_code
    FROM results r
    JOIN users u ON r.userId = u.id
    LEFT JOIN quizzes q ON r.quizId = q.id
    LEFT JOIN certificates c ON r.id = c.result_id
    ORDER BY r.submittedAt DESC
    LIMIT 500
  `);

  const formatted = results.map(r => {
    const correct = Number(r.correct) || 0;
    const wrong = Number(r.wrong) || 0;
    const skipped = Number(r.skipped) || 0;
    return {
      ...r,
      student_name: r.student_name,
      studentName: r.student_name,
      userName: r.student_name,
      student_email: r.student_email,
      studentEmail: r.student_email,
      userEmail: r.student_email,
      quiz_title: r.quiz_title,
      quizTitle: r.quiz_title || r.quizTitle,
      total_questions: correct + wrong + skipped,
      totalQuestions: correct + wrong + skipped,
      time_spent_seconds: r.timeTaken ? timeStrToSec(r.timeTaken) : 0,
      timeSpentSeconds: r.timeTaken ? timeStrToSec(r.timeTaken) : 0,
      status: r.passed ? 'PASSED' : 'FAILED',
      user_id: r.userId,
      quiz_id: r.quizId,
      submitted_at: r.submittedAt,
      submittedAt: r.submittedAt,
      percentage: Number(r.percentage) || 0,
      correct, wrong, skipped,
      score: Number(r.score) || 0,
      certificate_code: r.certificate_code,
      certificateCode: r.certificate_code
    };
  });

  res.json({ ok: true, results: formatted });
});

router.get('/leaderboard/:quizId', verifyToken, (req, res) => {
  const leaderboard = queryAll(`
    SELECT r.id, r.score, r.percentage, r.timeTaken, r.submittedAt, u.name as student_name
    FROM results r
    JOIN users u ON r.userId = u.id
    WHERE r.quizId = ?
    ORDER BY r.percentage DESC, (r.timeTaken) ASC
    LIMIT 20
  `, [req.params.quizId]);

  const formatted = leaderboard.map(r => ({
    ...r,
    student_name: r.student_name,
    studentName: r.student_name,
    time_spent_seconds: r.timeTaken ? timeStrToSec(r.timeTaken) : 0,
    timeSpentSeconds: r.timeTaken ? timeStrToSec(r.timeTaken) : 0,
    submitted_at: r.submittedAt
  }));

  res.json({ ok: true, leaderboard: formatted });
});

router.get('/analytics/overview', verifyToken, requireRole('admin'), (req, res) => {
  const totalStudents = queryOne("SELECT COUNT(*) as count FROM users WHERE LOWER(role) = 'student'")?.count || 0;
  const totalQuizzes = queryOne("SELECT COUNT(*) as count FROM quizzes")?.count || 0;
  const totalAttempts = queryOne("SELECT COUNT(*) as count FROM results")?.count || 0;
  const passedAttempts = queryOne("SELECT COUNT(*) as count FROM results WHERE passed = 1")?.count || 0;
  const failedAttempts = totalAttempts - passedAttempts;
  const totalQuestions = queryOne("SELECT COUNT(*) as count FROM questions")?.count || 0;
  const avgPercentage = queryOne("SELECT AVG(percentage) as avg FROM results")?.avg || 0;

  const avgPerQuizRows = queryAll(`
    SELECT q.id, q.title, COUNT(r.id) as attempts,
           COALESCE(AVG(r.percentage), 0) as avgPct,
           COALESCE(SUM(r.passed), 0) as passCount
    FROM quizzes q
    LEFT JOIN results r ON r.quizId = q.id
    GROUP BY q.id, q.title
    ORDER BY attempts DESC
    LIMIT 10
  `);

  const dailyRows = queryAll(`
    SELECT DATE(submittedAt) as day, COUNT(*) as count
    FROM results
    WHERE submittedAt IS NOT NULL
    GROUP BY DATE(submittedAt)
    ORDER BY day DESC
    LIMIT 14
  `);
  dailyRows.reverse();

  const daysLabels = [];
  const dailyCounts = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    daysLabels.push(formatShortDate(d));
    const matched = dailyRows.find(r => r.day === iso);
    dailyCounts.push(matched ? Number(matched.count) : 0);
  }

  function formatShortDate(d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  const allResults = queryAll('SELECT percentage, quizId FROM results WHERE percentage IS NOT NULL');
  const pctList = allResults.map(r => Number(r.percentage)).filter(p => !Number.isNaN(p));
  const p50 = percentile(pctList, 50);
  const p75 = percentile(pctList, 75);

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] || 0;
  }

  res.json({
    ok: true,
    stats: {
      totalStudents,
      totalQuizzes,
      totalAttempts,
      totalQuestions,
      passedAttempts,
      failedAttempts,
      passRate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
      failRate: totalAttempts > 0 ? Math.round((failedAttempts / totalAttempts) * 100) : 0,
      avgPercentage: Math.round(avgPercentage * 10) / 10,
      medianPct: Math.round(p50 * 10) / 10,
      p75Pct: Math.round(p75 * 10) / 10
    },
    charts: {
      passFail: {
        labels: ['Passed', 'Failed'],
        values: [passedAttempts, failedAttempts]
      },
      avgPerQuiz: {
        labels: avgPerQuizRows.map(r => r.title && r.title.length > 22 ? r.title.slice(0, 22) + '…' : (r.title || 'Unnamed')),
        values: avgPerQuizRows.map(r => Math.round(Number(r.avgPct || 0) * 10) / 10),
        attempts: avgPerQuizRows.map(r => Number(r.attempts || 0)),
        quizIds: avgPerQuizRows.map(r => r.id)
      },
      dailySubmissions: {
        labels: daysLabels,
        values: dailyCounts
      }
    }
  });
});

router.get('/:id', verifyToken, (req, res) => {
  const result = queryOne(`
    SELECT r.*, q.title as quiz_title, q.emoji, u.name as student_name, u.email as student_email, c.certificate_code
    FROM results r
    LEFT JOIN quizzes q ON r.quizId = q.id
    LEFT JOIN users u ON r.userId = u.id
    LEFT JOIN certificates c ON r.id = c.result_id
    WHERE r.id = ?
  `, [req.params.id]);

  if (!result) {
    return res.status(404).json({ ok: false, msg: 'Result record not found.' });
  }

  if (req.user.role !== 'admin' && result.userId !== req.user.id) {
    return res.status(403).json({ ok: false, msg: 'Access denied.' });
  }

  let detailedAnswers = [];
  try {
    detailedAnswers = JSON.parse(result.answers || '[]');
  } catch (e) { detailedAnswers = []; }

  const correct = Number(result.correct) || 0;
  const wrong = Number(result.wrong) || 0;
  const skipped = Number(result.skipped) || 0;

  res.json({
    ok: true,
    result: {
      ...result,
      quiz_title: result.quiz_title,
      quizTitle: result.quiz_title || result.quizTitle,
      student_name: result.student_name,
      studentName: result.student_name,
      student_email: result.student_email,
      status: result.passed ? 'PASSED' : 'FAILED',
      totalQuestions: correct + wrong + skipped,
      total_questions: correct + wrong + skipped,
      correct, wrong, skipped,
      score: Number(result.score) || 0,
      totalMarks: Number(result.totalMarks) || 0,
      percentage: Number(result.percentage) || 0,
      submitted_at: result.submittedAt,
      timeSpentSeconds: result.timeTaken ? timeStrToSec(result.timeTaken) : 0,
      certificate_code: result.certificate_code,
      certificateCode: result.certificate_code,
      detailedAnswers,
      detailed_answers: result.answers
    }
  });
});

module.exports = router;
