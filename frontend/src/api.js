import { MOCK_COACH_RESPONSE, MOCK_QUESTIONS } from './utils/mockResponses.js';

const jsonHeaders = { 'Content-Type': 'application/json' };
const DEFAULT_TIMEOUT_MS = 12000;

async function handleJson(res) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Invalid JSON from server');
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function apiParseResume(text, roleContext = {}) {
  try {
    const res = await fetchWithTimeout('/api/resume/parse', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        text,
        targetRole: roleContext?.targetRole || '',
        jobDescription: roleContext?.jobDescription || '',
      }),
    });
    const data = await handleJson(res);
    return { ...data, _fallback: false };
  } catch (err) {
    console.warn('Resume parse API failed — using local fallback', err);
  }
  const guessName = String(text || '').split('\n').map((x) => x.trim()).find(Boolean) || 'Candidate';
  return {
    parsed: {
      name: guessName.slice(0, 40),
      title: 'Software Engineer',
      skills: ['React', 'Node.js', 'Communication'],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
    },
    _fallback: true,
    _fallbackReason: 'Resume parsing API failed.',
  };
}

export async function apiGenerateQuestions(parsed, roleContext = {}) {
  try {
    const res = await fetchWithTimeout('/api/resume/questions', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        parsed,
        targetRole: roleContext?.targetRole || '',
        jobDescription: roleContext?.jobDescription || '',
      }),
    });
    const data = await handleJson(res);
    return { ...data, _fallback: false };
  } catch (err) {
    console.warn('Questions API failed — using mock response', err);
    return {
      raw: {},
      flat: MOCK_QUESTIONS.map((q) => ({ category: 'HR', question: q, hint: '' })),
      _fallback: true,
      _fallbackReason: 'Question generation API failed.',
    };
  }
}

export async function apiCoach(body) {
  try {
    const res = await fetchWithTimeout('/api/coach', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    });
    const data = await handleJson(res);
    return { ...data, _fallback: false };
  } catch (err) {
    console.warn('Coach API failed — using mock response', err);
    return {
      ...MOCK_COACH_RESPONSE,
      _fallback: true,
      _fallbackReason: 'Coaching API failed.',
    };
  }
}

export async function apiReport() {
  // REMOVED: heavy report endpoint
  console.warn('Endpoint /api/report replaced with mock for demo');
  return { narrative: { summary: 'In-app summary is used for this demo flow.' } };
}

export async function apiAdaptiveNext(payload) {
  try {
    const res = await fetchWithTimeout('/api/adaptive-next', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
    const data = await handleJson(res);
    return { ...data, _fallback: false };
  } catch {
    console.warn('Adaptive API failed — using local fallback');
    const pool = Array.isArray(payload?.questionPool) ? payload.questionPool : [];
    return {
      nextQuestion: pool.find((q) => q.question !== payload?.currentQuestion)?.question || 'Tell me about yourself.',
      reason: 'Local demo selection.',
      difficulty: 'intermediate',
      _fallback: true,
      _fallbackReason: 'Adaptive API failed.',
    };
  }
}

export async function apiHealth() {
  const res = await fetch('/api/health');
  return handleJson(res);
}
