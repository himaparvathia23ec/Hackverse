import { MOCK_COACH_RESPONSE, MOCK_QUESTIONS } from './utils/mockResponses.js';

const jsonHeaders = { 'Content-Type': 'application/json' };
const DEFAULT_TIMEOUT_MS = 12000;
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'for', 'with', 'on', 'is', 'are', 'you', 'your', 'how', 'what', 'why', 'when', 'where', 'do', 'does', 'did', 'would', 'could', 'should', 'tell', 'about', 'me']);

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

function extractKeywords(question, limit = 4) {
  return String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOPWORDS.has(w))
    .slice(0, limit);
}

function detectBehavioral(question, body = {}) {
  if (typeof body?.isBehavioral === 'boolean') return body.isBehavioral;
  return /tell me about a time|describe a time|give me an example|conflict|leadership|challenge/i.test(String(question || ''));
}

function buildDynamicFallbackCoach(body = {}) {
  const question = String(body?.question || 'Tell me about yourself.').trim();
  const answer = String(body?.answer || '').trim();
  const behavioral = detectBehavioral(question, body);
  const keywords = extractKeywords(question, 5);
  const anchor = keywords.slice(0, 2).join(' and ') || (behavioral ? 'the situation and my actions' : 'the requirements and trade-offs');
  const answerWords = answer.split(/\s+/).filter(Boolean);
  const answerPreview = answerWords.slice(0, 8).join(' ') || 'I handled the problem';
  const improvedAnswer = behavioral
    ? `For "${question}", I would answer with a clear STAR structure. In my last role, I faced a challenge around ${anchor} and took ownership to resolve it. I aligned the team, set a concrete plan, and executed step-by-step while communicating risks early. As a result, we improved delivery speed by 28% within one sprint and reduced rework. If I answer this in an interview, I will focus on decisions, collaboration, and measurable impact rather than generic statements.`
    : `For "${question}", I would begin by clarifying goals, constraints, and success metrics. Then I would propose a practical approach to ${anchor}, explain key trade-offs, and describe edge-case handling. In a similar project, this approach reduced latency by 35% over four weeks while improving reliability. I would close by describing validation, monitoring, and what I would optimize next at scale to show strong technical judgment.`;
  const idealAnswer = behavioral
    ? `When I joined the team, the first thing I noticed was that we were repeatedly losing time because ownership around ${anchor} was unclear. I was asked to lead the recovery effort and bring execution back on track before a critical release window. I mapped the blockers, aligned stakeholders on one weekly target, and introduced a lightweight operating rhythm with daily checkpoints and risk reviews. I also worked directly with cross-functional partners to remove dependencies that were slowing us down. Within six weeks, we improved on-time delivery by 31% and reduced post-release issues by 22%. Beyond the numbers, the team gained clarity on decision-making and accountability. That experience taught me that leadership in high-pressure moments is about creating structure, communicating early, and staying outcome-focused.`
    : `When I was asked this kind of system question, the first thing I noticed was that teams often jump into implementation before clarifying requirements. I started by defining throughput, latency, reliability, and cost goals so the architecture decisions had a clear target. I then proposed a design around ${anchor}, explained the trade-offs, and highlighted where failures could occur under peak load. Next, I described how I would implement incrementally with observability and rollback safety from day one. In a similar scenario, this method helped us cut p95 latency by 38% over a month while keeping error rates stable. I ended by showing how I would validate with load tests and iterate based on production telemetry. That experience taught me that strong technical answers combine clarity, measurable impact, and pragmatic trade-offs.`;
  return {
    ...MOCK_COACH_RESPONSE,
    feedback: `Good attempt. To improve this answer for "${question}", be more specific about your decisions, quantifiable impact, and why your approach was effective.`,
    improvedAnswer,
    idealAnswer,
    whatWasGood: answer ? [`"${answerPreview}${answerWords.length > 8 ? '...' : ''}"`] : ['You attempted a direct response.'],
    whatToReplace: [
      {
        original: answerWords.slice(0, 6).join(' ') || 'I worked on this',
        better: behavioral
          ? `I led ${anchor} by setting clear ownership, executing in phases, and measuring outcomes`
          : `I solved ${anchor} by clarifying constraints first, then making explicit design trade-offs`,
        reason: 'Makes your answer specific to the exact question.',
      },
      {
        original: answerWords.slice(-6).join(' ') || 'it went well',
        better: behavioral
          ? 'This improved team execution with measurable impact and clear stakeholder alignment'
          : 'This improved performance and reliability with measurable production outcomes',
        reason: 'Adds credibility through measurable impact.',
      },
    ],
    missingKeywords: keywords.length ? keywords : MOCK_COACH_RESPONSE.missingKeywords,
    practiceScript: {
      openingLine: behavioral
        ? `For "${question}", I will start with context and ownership.`
        : `For "${question}", I will start with requirements and constraints.`,
      corePoints: behavioral
        ? ['Situation and objective', 'Action with decisions', 'Measured result and learning']
        : ['Requirements and architecture', 'Trade-offs and edge cases', 'Validation and impact'],
      closingLine: 'I will close with measurable outcomes and one key lesson.',
      fullScript: improvedAnswer,
    },
    _fallback: true,
    _fallbackReason: 'Coaching API failed. Using question-specific local fallback.',
  };
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
    return buildDynamicFallbackCoach(body);
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
