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

function letterToIndex(letter) {
  const map = { a: 0, b: 1, c: 2, d: 3 };
  return map[String(letter).trim().toLowerCase()];
}

function normalizeMCQPayload(body) {
  const type = (body.type || 'mcq').toLowerCase();
  const quizId = body.quizId || body.quiz_id;
  const questionText = body.questionText || body.question_text || '';
  const codeSnippet = body.codeSnippet || body.code_snippet || null;
  const imageUrl = body.imageUrl || body.image_url || null;
  const marks = Number(body.marks) || Number(body.points) || 1;
  const explanation = body.explanation || '';

  let optionsArr = [];
  let correctOption = body.correctOption || body.correct_option || '';

  if (type === 'mcq') {
    if (Array.isArray(body.options) && body.options.length) {
      optionsArr = body.options;
    } else {
      const a = body.option_a ?? body.optionA;
      const b = body.option_b ?? body.optionB;
      const c = body.option_c ?? body.optionC;
      const d = body.option_d ?? body.optionD;
      if (a !== undefined || b !== undefined) optionsArr = [a, b, c, d].filter(x => x !== undefined && x !== null && x !== '');
    }

    if (optionsArr.length) {
      let idx = letterToIndex(correctOption);
      if (idx === undefined || idx >= optionsArr.length) {
        const matchIdx = optionsArr.findIndex(o =>
          String(o).trim().toLowerCase() === String(correctOption).trim().toLowerCase()
        );
        if (matchIdx >= 0) {
          const letters = ['A', 'B', 'C', 'D'];
          correctOption = letters[matchIdx] || correctOption;
        }
      }
    }
  } else if (type === 'truefalse') {
    optionsArr = ['True', 'False'];
    const co = String(correctOption).trim().toLowerCase();
    if (co === 'a' || co === 'true' || co === '1') {
      correctOption = 'True';
    } else if (co === 'b' || co === 'false' || co === '0') {
      correctOption = 'False';
    } else {
      correctOption = String(correctOption).trim();
    }
  } else if (type === 'fillblank') {
    optionsArr = [];
    correctOption = String(correctOption).trim();
  }

  return { type, quizId, questionText, codeSnippet, imageUrl, marks, explanation, optionsArr, correctOption };
}

router.get('/quiz/:quizId', verifyToken, requireRole('admin'), (req, res) => {
  const questions = queryAll(`
    SELECT * FROM questions
    WHERE quizId = ?
    ORDER BY id ASC
  `, [req.params.quizId]);

  const formatted = questions.map(q => ({
    ...q,
    options: parseOptions(q.options),
    marks: Number(q.marks) || 1,
    points: Number(q.marks) || 1,
    question_text: q.questionText,
    code_snippet: q.code_snippet,
    correct_option: q.correctOption
  }));

  res.json({ ok: true, questions: formatted });
});

router.get('/all', verifyToken, requireRole('admin'), (req, res) => {
  const questions = queryAll(`
    SELECT q.*, qz.title as quiz_title
    FROM questions q
    LEFT JOIN quizzes qz ON q.quizId = qz.id
    ORDER BY q.rowid DESC
    LIMIT 500
  `);

  const formatted = questions.map(q => ({
    ...q,
    quiz_title: q.quiz_title,
    quizTitle: q.quiz_title,
    options: parseOptions(q.options),
    marks: Number(q.marks) || 1,
    points: Number(q.marks) || 1
  }));

  res.json({ ok: true, questions: formatted });
});

router.post('/', verifyToken, requireRole('admin'), (req, res) => {
  const norm = normalizeMCQPayload(req.body);

  if (!norm.quizId) {
    return res.status(400).json({ ok: false, msg: 'Quiz ID is required.' });
  }
  if (!norm.questionText.trim()) {
    return res.status(400).json({ ok: false, msg: 'Question text is required.' });
  }
  if (norm.type === 'mcq' && norm.optionsArr.length < 2) {
    return res.status(400).json({ ok: false, msg: 'MCQ questions need at least 2 options.' });
  }
  if (norm.type === 'mcq' && !norm.correctOption) {
    return res.status(400).json({ ok: false, msg: 'Please select the correct answer for MCQ.' });
  }
  if (norm.type === 'truefalse' && !['True', 'False'].includes(String(norm.correctOption).trim())) {
    return res.status(400).json({ ok: false, msg: 'True/False question needs valid True or False answer.' });
  }
  if (norm.type === 'fillblank' && !String(norm.correctOption).trim()) {
    return res.status(400).json({ ok: false, msg: 'Fill-in-blank correct answer is required.' });
  }

  const questionId = genId('q');

  runSql(`
    INSERT INTO questions (id, quizId, type, questionText, options, correctOption, marks, explanation, code_snippet, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    questionId,
    norm.quizId,
    norm.type,
    norm.questionText.trim(),
    JSON.stringify(norm.optionsArr),
    norm.type === 'truefalse'
      ? (String(norm.correctOption).trim().toLowerCase() === 'false' ? 'False' : 'True')
      : String(norm.correctOption).trim(),
    norm.marks,
    norm.explanation,
    norm.codeSnippet,
    norm.imageUrl
  ]);
  saveDatabase();

  res.json({ ok: true, msg: 'Question added successfully!', questionId, id: questionId });
});

router.put('/:id', verifyToken, requireRole('admin'), (req, res) => {
  const existing = queryOne('SELECT * FROM questions WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ ok: false, msg: 'Question not found.' });
  }

  const norm = normalizeMCQPayload(req.body);

  if (!norm.questionText.trim()) {
    return res.status(400).json({ ok: false, msg: 'Question text is required.' });
  }

  const finalType = norm.type || existing.type || 'mcq';
  let finalOptions = norm.optionsArr;
  let finalCorrect = norm.correctOption;
  let finalMarks = norm.marks;

  if (!finalOptions.length) finalOptions = parseOptions(existing.options);
  if (!finalCorrect) finalCorrect = existing.correctOption;
  if (!finalMarks) finalMarks = Number(existing.marks) || 1;

  if (finalType === 'mcq' && finalOptions.length < 2) {
    return res.status(400).json({ ok: false, msg: 'MCQ questions need at least 2 options.' });
  }
  if (finalType === 'mcq' && !finalCorrect) {
    return res.status(400).json({ ok: false, msg: 'Please select the correct answer.' });
  }

  runSql(`
    UPDATE questions
    SET type = ?, questionText = ?, options = ?, correctOption = ?, marks = ?, explanation = ?, code_snippet = ?, image_url = ?
    WHERE id = ?
  `, [
    finalType,
    norm.questionText.trim(),
    JSON.stringify(finalOptions),
    finalType === 'truefalse'
      ? (String(finalCorrect).trim().toLowerCase() === 'false' ? 'False' : 'True')
      : String(finalCorrect).trim(),
    finalMarks,
    norm.explanation || existing.explanation || '',
    norm.codeSnippet,
    norm.imageUrl,
    req.params.id
  ]);
  saveDatabase();

  res.json({ ok: true, msg: 'Question updated successfully!' });
});

router.delete('/:id', verifyToken, requireRole('admin'), (req, res) => {
  const result = runSql('DELETE FROM questions WHERE id = ?', [req.params.id]);
  if (result.changes === 0) {
    return res.status(404).json({ ok: false, msg: 'Question not found.' });
  }
  saveDatabase();
  res.json({ ok: true, msg: 'Question deleted successfully!' });
});

router.post('/bulk-csv', verifyToken, requireRole('admin'), (req, res) => {
  const { quizId, questions } = req.body;
  if (!quizId || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ ok: false, msg: 'Invalid or empty questions dataset.' });
  }

  let inserted = 0;
  const errors = [];

  for (let i = 0; i < questions.length; i++) {
    const raw = questions[i];
    try {
      const type = (raw.type || 'mcq').toLowerCase();

      let optsArr = [];
      let correctOpt = raw.correct_option || raw.correctOption || '';

      if (Array.isArray(raw.options)) {
        optsArr = raw.options;
      } else {
        const a = raw.option_a ?? raw.optionA;
        const b = raw.option_b ?? raw.optionB;
        const c = raw.option_c ?? raw.optionC;
        const d = raw.option_d ?? raw.optionD;
        if (a && b) optsArr = [a, b, c, d].filter(x => x !== undefined && x !== null && x !== '');
      }

      if (!raw.question_text && !raw.questionText) continue;
      if (type === 'mcq' && optsArr.length < 2) continue;

      if (type === 'mcq' && optsArr.length) {
        let idx = letterToIndex(correctOpt);
        if (idx === undefined || idx >= optsArr.length) {
          const matchIdx = optsArr.findIndex(o =>
            String(o).trim().toLowerCase() === String(correctOpt).trim().toLowerCase()
          );
          if (matchIdx >= 0) {
            const letters = ['A', 'B', 'C', 'D'];
            correctOpt = letters[matchIdx] || correctOpt;
          }
        }
      } else if (type === 'truefalse') {
        optsArr = ['True', 'False'];
        const co = String(correctOpt).trim().toLowerCase();
        if (co === 'a' || co === 'true' || co === '1') correctOpt = 'True';
        else if (co === 'b' || co === 'false' || co === '0') correctOpt = 'False';
      }

      const qId = genId('q');
      runSql(`
        INSERT INTO questions (id, quizId, type, questionText, options, correctOption, marks, explanation, code_snippet)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        qId,
        quizId,
        type,
        (raw.questionText || raw.question_text || '').trim(),
        JSON.stringify(optsArr),
        String(correctOpt).trim(),
        Number(raw.marks) || Number(raw.points) || 1,
        raw.explanation || '',
        raw.code_snippet || raw.codeSnippet || null
      ]);
      inserted++;
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e.message}`);
    }
  }
  saveDatabase();

  res.json({
    ok: true,
    msg: `Successfully imported ${inserted} questions!`,
    inserted,
    errors: errors.length ? errors : undefined
  });
});

module.exports = router;
