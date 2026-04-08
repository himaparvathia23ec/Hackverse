import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const PORT = Number(process.env.PORT) || 3001;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '12mb' }));

function requireKey(_req, res, next) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY is not set on the backend. Add it to backend/.env',
    });
  }
  next();
}

/** Extract first JSON object from model text */
function extractJson(text) {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

app.post('/api/resume/parse', requireKey, async (req, res) => {
  try {
    const { text, targetRole, jobDescription } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text' });
    }
    const prompt = `Extract the following from this resume text and return ONLY valid JSON (no markdown fences):
{
  "name": "",
  "skills": [],
  "experience": [{ "role": "", "company": "", "duration": "", "responsibilities": [] }],
  "projects": [{ "name": "", "techStack": [], "description": "" }],
  "education": [{ "degree": "", "institution": "", "year": "" }],
  "certifications": []
}
If target role or job description context is provided, align inferred strengths and emphasis toward that role.`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Target role: ${targetRole || 'n/a'}\nJob description context: ${(jobDescription || 'n/a').slice(0, 4000)}\n\nResume text:\n\n${text.slice(0, 120000)}\n\n${prompt}`,
        },
      ],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const parsed = extractJson(out);
    if (!parsed) {
      return res.status(422).json({ error: 'Could not parse structured resume from model output.' });
    }
    res.json({ parsed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Parse failed' });
  }
});

app.post('/api/resume/questions', requireKey, async (req, res) => {
  try {
    const { parsed, targetRole, jobDescription } = req.body;
    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ error: 'Missing parsed resume object' });
    }
    const system = `You are an expert interviewer. Based on the candidate's resume data, generate 20 interview questions — a mix of HR, Technical, and Project-based — realistic and appropriately challenging.
Align to target role/JD context when provided.

Return ONLY valid JSON:
{
  "hr": [{ "question": "", "hint": "" }],
  "technical": [{ "question": "", "topic": "", "hint": "" }],
  "projectBased": [{ "question": "", "relatedProject": "", "hint": "" }]
}
The three arrays must total exactly 20 questions.`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: `Target role: ${targetRole || 'n/a'}\nJob description context: ${(jobDescription || 'n/a').slice(0, 4000)}\nResume Data: ${JSON.stringify(parsed)}` }],
        },
      ],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    if (!data || !Array.isArray(data.hr)) {
      return res.status(422).json({ error: 'Could not parse questions from model output.' });
    }
    const flat = [];
    for (const q of data.hr || []) {
      if (q?.question) flat.push({ category: 'HR', question: q.question, hint: q.hint || '' });
    }
    for (const q of data.technical || []) {
      if (q?.question) {
        flat.push({
          category: 'Technical',
          question: q.question,
          hint: q.hint || '',
          topic: q.topic || '',
        });
      }
    }
    for (const q of data.projectBased || []) {
      if (q?.question) {
        flat.push({
          category: 'Project',
          question: q.question,
          hint: q.hint || '',
          relatedProject: q.relatedProject || '',
        });
      }
    }
    res.json({ raw: data, flat });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Question generation failed' });
  }
});

app.post('/api/coach', requireKey, async (req, res) => {
  // HIREMIND-AUDIT: clarity/confidence/relevance scoring contract is defined in this route.
  try {
    const {
      question,
      answer,
      isBehavioral,
      dominantEmotion,
      emotionTip,
      attemptNumber,
      previousAttemptSummary,
      fillerInsights,
      resumeContext,
      targetRole,
      jobDescription,
    } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }
    const answerText = typeof answer === 'string' ? answer : '';

    const system = `You are an expert interview coach. Respond with ONLY valid JSON (no markdown):
{
  "feedback": "One concise coaching paragraph.",
  "whatWasGood": ["exact phrase from user answer", "..."],
  "whatToReplace": [{ "original": "", "better": "", "reason": "" }],
  "missingKeywords": ["", "", ""],
  "fillerInsights": {
    "count": 0,
    "densityPer100Words": 0,
    "topFillers": [""],
    "alternatives": [""]
  },
  "improvedAnswer": "A polished, hire-ready sample answer in first person.",
  "idealAnswer": "",
  "practiceScript": {
    "openingLine": "",
    "corePoints": ["", "", ""],
    "closingLine": "",
    "fullScript": ""
  },
  "strengths": ["", "", ""],
  "weaknesses": ["", "", ""],
  "transcriptEvidence": ["exact phrase or quote from the candidate transcript", "..."],
  "scores": { "clarity": 0, "confidence": 0, "relevance": 0 },
  "followups": ["", "", ""]
}
Rules:
- Score the answer on exactly three criteria:
  - Clarity (0-10): How clear and understandable is the answer?
  - Confidence (0-10): Does the speaker sound confident and assured?
  - Relevance (0-10): How directly does the answer address the question?
- Use the full transcript holistically before judging; do not grade partial snippets.
- Quote exact phrases from the transcript in whatWasGood and transcriptEvidence where possible.
- If the answer is empty, mention it in intro and provide corrective guidance.
- improvedAnswer must be question-specific and aligned to user context.
- Keep improvedAnswer in first person ("I"), 90-140 words, specific, outcome-focused, and confident.
- "idealAnswer" is the single most important field. This is not a rewrite of what the user said — this is the perfect, complete answer a top 1% candidate would give if they had prepared for 2 weeks for this exact question at a top company. It must:
  * Be 6-8 sentences in first person
  * Open with a one-sentence hook that immediately signals competence ("When I joined X, the first thing I noticed was...")
  * Include the STAR format naturally woven in — not labeled, just structured that way
  * Contain at least one specific number, metric, or timeline (invent a plausible one)
  * End with a reflection sentence that shows self-awareness ("That experience taught me that...")
  * Sound like a real human speaking confidently, not a corporate document
  * Directly and completely answer the exact question asked — if the question asks about conflict, the ideal answer must describe a conflict. If it asks about leadership, it must show leadership. Never be generic.
  * Be something the user could read once and immediately understand exactly what they should have said and why it works
- practiceScript must be directly related to this exact question and transcript.
- practiceScript.corePoints should contain exactly 3 concise points.
- whatToReplace should be phrase-level edits from user transcript (at least 2 when possible).
- Include fillerInsights and practical alternatives.
- If this is not the first attempt, compare against prior attempt summary and reward real improvements.`;

    const user = `Interview question: ${question}

Candidate's spoken/written answer:
${answerText || '[No answer captured — coach them to structure their next attempt.]'}

Question style: ${isBehavioral ? 'behavioral (use STAR)' : 'technical/other'}

Optional context — dominant expression: ${dominantEmotion || 'unknown'}. Tip: ${emotionTip || 'n/a'}

Attempt number: ${Number(attemptNumber) || 1}
Previous attempt summary: ${previousAttemptSummary || 'n/a'}

Resume context (if available): ${resumeContext ? JSON.stringify(resumeContext).slice(0, 3000) : 'n/a'}
Target role context: ${targetRole || 'n/a'}
Job description context: ${(jobDescription || 'n/a').slice(0, 4000)}
Client filler insights: ${fillerInsights ? JSON.stringify(fillerInsights) : 'n/a'}`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    if (!data) {
      return res.status(422).json({ error: 'Could not parse coach JSON from model.' });
    }
    const safeReplace = Array.isArray(data.whatToReplace)
      ? data.whatToReplace
        .map((row) => ({
          original: String(row?.original || '').trim(),
          better: String(row?.better || '').trim(),
          reason: String(row?.reason || '').trim(),
        }))
        .filter((row) => row.original && row.better)
        .slice(0, 6)
      : [];
    const safeTopFillers = Array.isArray(data.fillerInsights?.topFillers)
      ? data.fillerInsights.topFillers.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    const safeAlternatives = Array.isArray(data.fillerInsights?.alternatives)
      ? data.fillerInsights.alternatives.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    const safeCorePoints = Array.isArray(data.practiceScript?.corePoints)
      ? data.practiceScript.corePoints.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3)
      : [];
    const safeImprovedAnswer = String(data.improvedAnswer || data.improvedAnswerExample || '').trim();
    const safeIdealAnswer = String(data.idealAnswer || '').trim();

    res.json({
      feedback: data.feedback || data.intro || '',
      whatWasGood: Array.isArray(data.whatWasGood) ? data.whatWasGood.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6) : [],
      whatToReplace: safeReplace,
      missingKeywords: Array.isArray(data.missingKeywords) ? data.missingKeywords.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8) : [],
      fillerInsights: {
        count: Math.max(0, Number(data.fillerInsights?.count) || Number(fillerInsights?.count) || 0),
        densityPer100Words: Math.max(0, Number(data.fillerInsights?.densityPer100Words) || Number(fillerInsights?.densityPer100Words) || 0),
        topFillers: safeTopFillers.length ? safeTopFillers : (Array.isArray(fillerInsights?.topFillers) ? fillerInsights.topFillers : []),
        alternatives: safeAlternatives.length ? safeAlternatives : [
          'Replace filler with a short pause.',
          'Use transition words like "specifically", "therefore", "for example".',
        ],
      },
      improvedAnswer: safeImprovedAnswer,
      idealAnswer: safeIdealAnswer || safeImprovedAnswer || `When I prepared for this exact question, I started by clarifying the context and what success looked like. I then explained the specific task I owned and why it mattered to the business. Next, I walked through the actions I took, including trade-offs and collaboration with key stakeholders. I included a concrete metric, timeline, or measurable outcome to prove impact. I closed by connecting the result back to the original question so the answer felt complete and relevant. I also highlighted one thing I would improve if I repeated the same scenario today. That experience taught me that clear structure, measurable outcomes, and self-awareness are what make an answer stand out.`,
      practiceScript: {
        openingLine: String(data.practiceScript?.openingLine || '').trim(),
        corePoints: safeCorePoints.length ? safeCorePoints : ['Context', 'Action', 'Result'],
        closingLine: String(data.practiceScript?.closingLine || '').trim(),
        fullScript: String(data.practiceScript?.fullScript || safeImprovedAnswer || '').trim(),
      },
      strengths: Array.isArray(data.strengths) ? data.strengths.slice(0, 3) : [],
      weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses.slice(0, 3) : [],
      transcriptEvidence: Array.isArray(data.transcriptEvidence) ? data.transcriptEvidence.slice(0, 4) : [],
      scores: {
        clarity: Math.max(0, Math.min(10, Number(data.scores?.clarity) || 0)),
        confidence: Math.max(0, Math.min(10, Number(data.scores?.confidence) || 0)),
        relevance: Math.max(0, Math.min(10, Number(data.scores?.relevance) || 0)),
      },
      followups: Array.isArray(data.followups) ? data.followups.slice(0, 5) : [],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Coach failed' });
  }
});

app.post('/api/adaptive-next', requireKey, async (req, res) => {
  try {
    const { currentQuestion, currentCategory, scores, questionPool } = req.body;
    if (!currentQuestion || typeof currentQuestion !== 'string') {
      return res.status(400).json({ error: 'Missing currentQuestion' });
    }
    const safePool = Array.isArray(questionPool) ? questionPool.slice(0, 120) : [];
    const system = `You are an expert interview panelist. Choose ONE best next question from the given pool adaptively:
- If scores are weak (<60 in multiple areas), pick a foundational question.
- If scores are strong (>=75 overall), pick a deeper/challenging question.
- Prefer topic continuity with current question/category.
Return ONLY valid JSON:
{
  "nextQuestion": "",
  "reason": "",
  "difficulty": "foundational|intermediate|advanced"
}`;
    const user = JSON.stringify({
      currentQuestion,
      currentCategory,
      scores,
      questionPool: safePool,
    });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const out = msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    if (!data?.nextQuestion) {
      return res.status(422).json({ error: 'Could not choose adaptive next question.' });
    }
    res.json({
      nextQuestion: String(data.nextQuestion),
      reason: String(data.reason || ''),
      difficulty: ['foundational', 'intermediate', 'advanced'].includes(data.difficulty)
        ? data.difficulty
        : 'intermediate',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Adaptive question failed' });
  }
});

app.post('/api/report', requireKey, async (req, res) => {
  // HIREMIND-AUDIT: /api/report exists for backward compatibility; frontend no longer uses it.
  try {
    const payload = req.body;
    const system = `You are an interview coach. Given session JSON, return ONLY valid JSON:
{
  "summary":"...",
  "strengths":["","",""],
  "weaknesses":["","",""],
  "improvements":["","",""],
  "sevenDayPlan":["Day 1: ...","Day 2: ...","Day 3: ...","Day 4: ...","Day 5: ...","Day 6: ...","Day 7: ..."],
  "topLikelyNextQuestions":["","","","",""],
  "attemptWiseTrend":["Attempt 1: ...","Attempt 2: ..."],
  "closingNote":"..."
}
Keep advice concrete and interview-specific.`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: JSON.stringify(payload).slice(0, 100000) }],
        },
      ],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    res.json({ narrative: data || { summary: out } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Report failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`Hackverse API http://localhost:${PORT}`);
});
