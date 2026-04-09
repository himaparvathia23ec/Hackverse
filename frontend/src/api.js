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

function detectIntent(question = '', behavioral = true) {
  const q = String(question).toLowerCase();
  if (!behavioral) {
    if (/design|architecture|system|scal/i.test(q)) return 'systemDesign';
    if (/debug|bug|incident|outage|failure/i.test(q)) return 'debugging';
    if (/performance|optimi|latency|scale|throughput/i.test(q)) return 'performance';
    return 'technicalGeneral';
  }
  if (/lead|leadership|manage|mentor|ownership/i.test(q)) return 'leadership';
  if (/conflict|disagree|disagreement|difficult stakeholder/i.test(q)) return 'conflict';
  if (/fail|mistake|wrong|regret|setback/i.test(q)) return 'failure';
  if (/challenge|pressure|deadline|stress/i.test(q)) return 'challenge';
  return 'behavioralGeneral';
}

function hashSeed(text = '') {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildDynamicFallbackCoach(body = {}) {
  const question = String(body?.question || 'Tell me about yourself.').trim();
  const answer = String(body?.answer || '').trim();
  const behavioral = detectBehavioral(question, body);
  const intent = detectIntent(question, behavioral);
  const seed = hashSeed(question);
  const keywords = extractKeywords(question, 5);
  const topic = keywords.slice(0, 3).join(', ') || (behavioral ? 'the situation and outcomes' : 'the core requirements and trade-offs');
  const answerWords = answer.split(/\s+/).filter(Boolean);
  const answerPreview = answerWords.slice(0, 8).join(' ') || 'I handled the problem';
  const metrics = [24, 28, 31, 35, 38, 42];
  const metric = metrics[seed % metrics.length];
  const improvedByIntent = {
    leadership: `I would use STAR and focus on leadership actions. I set direction around ${topic}, aligned cross-functional teammates on goals, and created a clear execution cadence. I delegated work by strengths, removed blockers quickly, and maintained transparent updates for stakeholders. The result was ${metric}% faster delivery and better team confidence. I keep this answer concrete, people-focused, and outcome-driven.`,
    conflict: `I would show a real conflict and how I resolved it professionally. I had a disagreement related to ${topic}, so I first clarified shared goals, then used data and user impact to align decisions. I listened actively, documented trade-offs, and proposed a trial plan both sides could evaluate. We shipped with stronger alignment and improved quality by ${metric}%. This demonstrates calm communication, collaboration, and ownership under tension.`,
    failure: `I would acknowledge the mistake directly, explain what I learned, and show recovery. I made an incorrect assumption related to ${topic}, which affected timelines. I took ownership immediately, communicated impact early, and redesigned the plan with clear checkpoints. We recovered within two weeks and improved process quality by ${metric}%. The key is accountability, corrective action, and measurable learning.`,
    challenge: `I would frame the pressure clearly and walk through my decision process. The challenge centered on ${topic} with tight deadlines and limited resources. I prioritized high-impact tasks, coordinated stakeholders, and used daily risk reviews to keep execution stable. We delivered with ${metric}% better speed while maintaining quality. This shows structured thinking and composure under pressure.`,
    behavioralGeneral: `I would answer with STAR and keep it specific. I faced a situation involving ${topic}, took ownership, and executed a clear action plan with the team. I focused on decisions, communication, and risk management rather than generic claims. As a result, we improved outcomes by ${metric}% and left a repeatable process in place. This makes the answer credible and interview-ready.`,
    systemDesign: `I would begin with requirements, then propose architecture with trade-offs. I would design for ${topic}, define throughput/latency targets, and explain failure handling. I would compare options, justify decisions, and include observability from day one. In a similar case, this approach improved p95 latency by ${metric}% in one month. This shows practical design thinking and scalability awareness.`,
    debugging: `I would explain a structured debugging strategy end-to-end. I would reproduce the issue linked to ${topic}, narrow scope with logs and metrics, and isolate root cause before patching. Then I would add safeguards: alerts, tests, and rollback strategy. In my past work, this cut recurring incidents by ${metric}% over two sprints. This demonstrates reliability ownership and technical discipline.`,
    performance: `I would identify bottlenecks first and optimize in measured steps. I would baseline current behavior around ${topic}, prioritize high-impact fixes, and validate each change with metrics. I would focus on caching, query/runtime efficiency, and concurrency trade-offs where relevant. This method improved latency by ${metric}% and increased throughput without instability. It demonstrates data-driven optimization.`,
    technicalGeneral: `I would clarify constraints, propose an implementable approach, and explain trade-offs around ${topic}. I would cover edge cases, reliability, and validation strategy. In similar work, this approach improved key system metrics by ${metric}% in production. I would close with what I would monitor and optimize next. That communicates strong technical judgment.`,
  };
  const idealByIntent = {
    leadership: `When I took over a project with unclear ownership, the first thing I noticed was that the team was shipping slowly because decisions were fragmented. I was responsible for getting execution back on track before an important release. I aligned engineering, product, and QA on one weekly objective, clarified ownership, and set a lightweight decision framework. I also introduced short daily checkpoints to surface blockers early and keep stakeholders informed. Within six weeks, we improved delivery speed by ${metric}% and reduced cross-team rework significantly. More importantly, the team moved from reactive firefighting to predictable execution. That experience taught me that leadership is about creating clarity, trust, and momentum under pressure.`,
    conflict: `When I joined a cross-functional initiative, the first thing I noticed was that a design-versus-engineering conflict was stalling progress. I was asked to resolve it without slowing the release plan. I reframed the discussion around shared user outcomes, gathered the right data, and proposed a phased solution with measurable checkpoints. I facilitated direct conversations, documented trade-offs transparently, and ensured both teams felt heard in the final decision. We shipped on time and improved defect escape rate by ${metric}% in the following sprint. The process also improved collaboration quality for future launches. That experience taught me that conflict resolution works best when you combine empathy, evidence, and clear ownership.`,
    failure: `When I look back at a failure I own, the first thing I noticed was that I had moved too fast on assumptions and not validated risks early enough. The issue impacted delivery and created avoidable pressure on the team. I took accountability immediately, communicated the impact clearly, and led a recovery plan with concrete checkpoints. I rebuilt the solution with stronger validation and introduced a pre-release review checklist to prevent recurrence. Over the next month, we reduced similar incidents by ${metric}% and restored stakeholder confidence. I also shared the lessons as a team practice so the learning was institutional, not personal. That experience taught me that credibility comes from how quickly and transparently you recover.`,
    challenge: `When we were facing a tight deadline, the first thing I noticed was that the work was large but priorities were not clear. I was responsible for ensuring we delivered without sacrificing quality. I broke the scope into critical and non-critical paths, aligned owners, and ran short risk reviews to keep momentum. I protected the team’s focus by removing blockers quickly and communicating trade-offs early with stakeholders. We delivered the critical scope on time and improved cycle efficiency by ${metric}% in that phase. The release quality stayed stable, which validated our approach under pressure. That experience taught me that difficult timelines are manageable with ruthless prioritization and disciplined communication.`,
    behavioralGeneral: `When I faced a high-impact interview scenario like this, the first thing I noticed was that success depended on balancing execution and communication. I was responsible for delivering results while coordinating multiple stakeholders around competing priorities. I created a clear plan, assigned ownership, and used measurable checkpoints so everyone understood progress and risks. I then executed in phases, adjusting quickly when constraints changed. The outcome was a ${metric}% improvement in delivery performance with better predictability. The team also adopted the process as a repeatable playbook for future projects. That experience taught me that strong outcomes come from structured ownership and measurable decisions.`,
    systemDesign: `When I approach a system design problem, the first thing I notice is whether requirements are explicit enough to make good trade-offs. I start by defining scale targets, latency budgets, reliability goals, and cost boundaries so architecture choices are grounded. Then I propose a design focused on ${topic}, including data flow, failure handling, and scaling strategy. I explain alternatives, justify why I pick one, and call out where I would optimize later based on real traffic. In production work, this approach improved p95 latency by ${metric}% while keeping error rates stable during scale-up. I validate with load tests, observability dashboards, and staged rollouts to reduce risk. That experience taught me that good design is less about complexity and more about clear trade-offs with measurable outcomes.`,
    debugging: `When I’m handling a production issue, the first thing I notice is that fast guessing wastes more time than disciplined diagnosis. I start by defining symptoms and impact, then use logs, traces, and metrics to isolate the smallest failing component. I create a reproducible case, identify root cause, and implement the safest fix with rollback readiness. I then add tests and alerts so the same class of issue is caught earlier next time. Using this approach, we reduced repeat incidents by ${metric}% over two sprints in one service I owned. I also documented the incident timeline so the team could reuse the playbook under pressure. That experience taught me that reliability comes from systematic debugging, not heroics.`,
    performance: `When I optimize performance, the first thing I notice is that teams often tune symptoms instead of bottlenecks. I begin with a baseline for throughput, p95 latency, and error rates so we can measure real gains. I prioritize the top bottlenecks, implement changes incrementally, and validate each step against production-like workloads. I also evaluate trade-offs such as memory overhead, consistency behavior, and operational complexity before scaling a fix. In one optimization cycle, this reduced latency by ${metric}% and improved capacity without destabilizing the system. I close by setting monitoring thresholds so regressions are caught automatically. That experience taught me that sustainable performance comes from measurement-driven iteration.`,
    technicalGeneral: `When I answer technical questions, the first thing I notice is whether the problem is framed with clear constraints and success criteria. I define assumptions, propose a practical approach focused on ${topic}, and explain trade-offs at each decision point. I then walk through edge cases, failure modes, and how I would test correctness and resilience. I keep the design implementation-aware so it is realistic to build and operate. In similar work, this style improved production performance by ${metric}% while keeping reliability steady. I also explain what I would monitor post-launch and how I would iterate. That experience taught me that strong technical answers connect architecture, execution, and measurable business impact.`,
  };
  const improvedAnswer = improvedByIntent[intent] || improvedByIntent.technicalGeneral;
  const idealAnswer = idealByIntent[intent] || idealByIntent.technicalGeneral;
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
          ? `I led work on ${topic} by setting clear ownership, executing in phases, and measuring outcomes`
          : `I solved ${topic} by clarifying constraints first, then making explicit design trade-offs`,
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
