import { useState } from 'react';

const GRAMMAR = [
  { id: 1, title: '是...的 (shì...de)', level: 'HSK 1', pattern: 'Subject + 是 + Detail + 的 + Verb', explanation: 'Emphasizes details about a past action — when, where, how, or with whom.', examples: [{ zh: '我是昨天去的。', en: 'I went yesterday (it was yesterday that I went).' }, { zh: '他是坐飞机来的。', en: 'He came by plane.' }] },
  { id: 2, title: '了 (le) — completed action', level: 'HSK 1', pattern: 'Subject + Verb + 了 + Object', explanation: 'Marks a completed action. Placed after the verb.', examples: [{ zh: '我吃了饭。', en: 'I ate (a meal).' }, { zh: '他看了书。', en: 'He read a book.' }] },
  { id: 3, title: '把 (bǎ) construction', level: 'HSK 3', pattern: 'Subject + 把 + Object + Verb + Complement', explanation: 'Shows how an object is disposed of or affected. The object must be definite.', examples: [{ zh: '我把水喝了。', en: 'I drank the water.' }, { zh: '她把门打开了。', en: 'She opened the door.' }] },
  { id: 4, title: '被 (bèi) — passive voice', level: 'HSK 3', pattern: 'Subject + 被 + Agent + Verb + Complement', explanation: 'Passive construction marking the subject as the recipient of an action.', examples: [{ zh: '我的书被他拿走了。', en: 'My book was taken by him.' }, { zh: '杯子被打破了。', en: 'The cup was broken.' }] },
  { id: 5, title: '过 (guo) — experience', level: 'HSK 2', pattern: 'Subject + Verb + 过 + Object', explanation: 'Indicates an experience in the past; often means "have done something before".', examples: [{ zh: '我去过北京。', en: 'I have been to Beijing.' }, { zh: '你吃过饺子吗？', en: 'Have you (ever) eaten dumplings?' }] },
  { id: 6, title: '着 (zhe) — continuous state', level: 'HSK 2', pattern: 'Subject + Verb + 着 + Object', explanation: 'Indicates a continuing state or an ongoing action.', examples: [{ zh: '门开着。', en: 'The door is open.' }, { zh: '他坐着看书。', en: 'He is sitting and reading.' }] },
  { id: 7, title: '比 (bǐ) — comparison', level: 'HSK 1', pattern: 'A + 比 + B + Adjective', explanation: 'Comparative structure. A is more [adjective] than B.', examples: [{ zh: '我比她高。', en: 'I am taller than her.' }, { zh: '今天比昨天热。', en: 'Today is hotter than yesterday.' }] },
  { id: 8, title: '得 (de) — degree complement', level: 'HSK 2', pattern: 'Subject + Verb + 得 + Complement', explanation: 'Describes the manner or degree of an action.', examples: [{ zh: '他说得很好。', en: 'He speaks very well.' }, { zh: '我走得很快。', en: 'I walk quickly.' }] },
  { id: 9, title: '虽然...但是... (suīrán...dànshì...)', level: 'HSK 2', pattern: '虽然 + Clause 1 + 但是 + Clause 2', explanation: '"Although...but..." — expresses concession and contrast.', examples: [{ zh: '虽然很累，但是我还要工作。', en: 'Although I\'m tired, I still have to work.' }] },
  { id: 10, title: '如果...就... (rúguǒ...jiù...)', level: 'HSK 2', pattern: '如果 + Condition + 就 + Result', explanation: '"If...then..." — conditional construction.', examples: [{ zh: '如果你来中国，我就带你去吃火锅。', en: 'If you come to China, I\'ll take you to eat hotpot.' }] },
  { id: 11, title: 'V + 起来 (qǐlai)', level: 'HSK 3', pattern: 'Verb + 起来', explanation: 'Directional complement meaning "to start doing" or describing how something feels.', examples: [{ zh: '这本书看起来很有意思。', en: 'This book looks very interesting.' }, { zh: '我们开始唱起来。', en: 'We started singing.' }] },
  { id: 12, title: 'A 是 A，但是...', level: 'HSK 3', pattern: 'A + 是 + A + 但是 + Clause', explanation: '"A is A, but..." — concedes a point then contrasts it.', examples: [{ zh: '好是好，但是太贵了。', en: 'It\'s good alright, but too expensive.' }] },
];

const LEVELS = ['HSK 1', 'HSK 2', 'HSK 3'];

export default function GrammarPage() {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const filtered = GRAMMAR.filter(g =>
    !filter || g.level === filter
  );

  return (
    <div style={{ padding: 40, color: '#e7e6ee', background: '#15151c', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>Chinese Grammar</h1>
      <p style={{ color: '#928fa3', fontSize: 14, margin: '0 0 24px' }}>
        {GRAMMAR.length} structures · reference only
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setFilter('')} style={{
          padding: '6px 16px', borderRadius: 999, border: `1px solid ${filter ? '#312f3e' : '#5d6ce0'}`,
          background: filter ? 'transparent' : '#23233a', color: filter ? '#928fa3' : '#b3bcf7',
          cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>All</button>
        {LEVELS.map(l => (
          <button key={l} onClick={() => setFilter(filter === l ? '' : l)} style={{
            padding: '6px 16px', borderRadius: 999, border: `1px solid ${filter === l ? '#5d6ce0' : '#312f3e'}`,
            background: filter === l ? '#23233a' : 'transparent', color: filter === l ? '#b3bcf7' : '#928fa3',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>{l}</button>
        ))}
      </div>

      {filtered.map(g => (
        <div key={g.id} style={{
          background: '#1b1b25', border: `1px solid ${expanded === g.id ? '#5d6ce0' : '#312f3e'}`,
          borderRadius: 12, padding: '16px 20px', marginBottom: 12,
          cursor: 'pointer', transition: 'border-color 150ms',
        }} onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: expanded === g.id ? 12 : 0 }}>
            <span style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Noto Serif SC', serif" }}>{g.title}</span>
            <span style={{
              padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: '#23233a', color: '#b3bcf7', border: '1px solid rgba(125,140,240,0.35)',
            }}>{g.level}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: '#646175', fontSize: 11 }}>{expanded === g.id ? '▲' : '▼'}</span>
          </div>

          {expanded === g.id && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                background: '#21212d', borderRadius: 8, padding: '8px 14px', marginBottom: 10,
                fontFamily: 'monospace', fontSize: 13, color: '#b3bcf7',
              }}>
                {g.pattern}
              </div>
              <p style={{ fontSize: 14, color: '#928fa3', lineHeight: 1.6, margin: '0 0 12px' }}>
                {g.explanation}
              </p>
              {g.examples.map((ex, i) => (
                <div key={i} style={{
                  padding: '10px 14px', marginBottom: 6, borderRadius: 8,
                  background: '#21212d', border: '1px solid #262534',
                }}>
                  <div style={{ fontSize: 18, fontFamily: "'Noto Serif SC', serif", color: '#e7e6ee', marginBottom: 4 }}>
                    {ex.zh}
                  </div>
                  <div style={{ fontSize: 13, color: '#646175' }}>
                    {ex.en}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
