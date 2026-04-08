import React, { useEffect, useMemo, useRef, useState } from 'react';

const PHRASE_SUGGESTIONS = {
  example: 'For example, in my previous role...',
  result: 'The result of this was...',
  team: 'I collaborated with my team to...',
  impact: 'This created measurable impact by...',
  approach: 'My approach was to first clarify requirements...',
  tradeoff: 'The trade-off here was...',
  scale: 'At scale, I would optimize by...',
  metric: 'I measured success using...',
  ownership: 'I took ownership by...',
  challenge: 'The main challenge was...',
};

/**
 * Live helper panel while speech recognition is active.
 * @param {{ transcript: string, expectedKeywords: string[], elapsedSeconds: number, isBehavioral: boolean }} props
 */
export default function LiveAnswerHelper({
  transcript = '',
  expectedKeywords = [],
  elapsedSeconds = 0,
  isBehavioral = true,
}) {
  const [speechRateWarning, setSpeechRateWarning] = useState('');
  const wordCountRef = useRef(0);

  const normalized = String(transcript || '').toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const missing = useMemo(
    () => (expectedKeywords || []).filter((kw) => kw && !normalized.includes(String(kw).toLowerCase())),
    [expectedKeywords, normalized]
  );
  const fillerCount = useMemo(
    () => (normalized.match(/\b(um+|uh+|like|you know|i mean|basically|actually|sort of|kind of)\b/g) || []).length,
    [normalized]
  );
  const fillerRate = words.length ? Math.round((fillerCount / words.length) * 100) : 0;
  const sentenceLikeChunks = transcript.split(/[.!?]/).map((x) => x.trim()).filter(Boolean);
  const longestChunkWords = sentenceLikeChunks.reduce((m, chunk) => Math.max(m, chunk.split(/\s+/).filter(Boolean).length), 0);
  const hasStarLike = useMemo(() => {
    const context = /\b(when|situation|context|at that time|challenge)\b/.test(normalized);
    const action = /\b(i did|i took|i led|i implemented|i built|i decided|my approach)\b/.test(normalized);
    const result = /\b(result|impact|outcome|improved|reduced|increased|saved|delivered)\b/.test(normalized);
    return context && action && result;
  }, [normalized]);

  useEffect(() => {
    const id = setInterval(() => {
      const delta = words.length - wordCountRef.current;
      wordCountRef.current = words.length;
      setSpeechRateWarning(delta > 30 ? '🐢 Speak a bit slower' : '');
    }, 5000);
    return () => clearInterval(id);
  }, [words.length]);

  const liveCues = useMemo(() => {
    const cues = [];
    if (isBehavioral && elapsedSeconds >= 12 && !hasStarLike) {
      cues.push('Add STAR flow now: context -> your action -> measurable result.');
    }
    if (fillerRate >= 8 && words.length >= 30) {
      cues.push('High filler rate detected. Pause for 1 second instead of using fillers.');
    }
    if (longestChunkWords >= 24) {
      cues.push('Your sentence is getting long. Break it into shorter points.');
    }
    return cues.slice(0, 3);
  }, [elapsedSeconds, fillerRate, hasStarLike, isBehavioral, longestChunkWords, words.length]);

  return (
    <div className="fixed bottom-20 right-6 w-[280px] z-40 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
      <div className="text-xs font-black mb-2">💡 Live Answer Helper</div>
      <div className="text-[11px] text-gray-500 mb-1">Missing keywords:</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {(expectedKeywords || []).slice(0, 8).map((kw) => {
          const has = !missing.includes(kw);
          return (
            <span
              key={kw}
              className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                has ? 'bg-green-50 text-green-700 border-green-200 opacity-60' : 'bg-red-50 text-red-600 border-red-200'
              }`}
            >
              {kw}
            </span>
          );
        })}
      </div>
      <div className="text-[11px] text-gray-500 mb-1">Try saying:</div>
      <div className="text-[11px] text-gray-700 bg-cream border border-linen rounded-lg p-2">
        {PHRASE_SUGGESTIONS[(missing[0] || '').toLowerCase()] || 'Start with context, then your action, then result.'}
      </div>
      {speechRateWarning && <div className="text-[11px] text-amber-700 mt-2">{speechRateWarning}</div>}
      {!!liveCues.length && (
        <div className="mt-2">
          <div className="text-[10px] uppercase font-black text-gray-500 mb-1">Live cues</div>
          {liveCues.map((cue, idx) => (
            <p key={`cue-${idx}`} className="text-[11px] text-indigo-700 mb-1">- {cue}</p>
          ))}
        </div>
      )}
    </div>
  );
}
