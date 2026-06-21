import { useState } from 'react'

const CHINA_SCENARIOS = [
  {
    id: 'street-market',
    title: 'Street Market',
    icon: '\u{1F3EE}',
    description: 'Haggle over prices and order street food from local vendors.',
    vocab: [
      { en: 'Market', zh: '市场', pinyin: 'shìchǎng' },
      { en: 'How much?', zh: '多少钱？', pinyin: 'duōshao qián' },
      { en: 'Too expensive', zh: '太贵了', pinyin: 'tài guì le' },
      { en: 'Discount', zh: '打折', pinyin: 'dǎzhé' },
      { en: 'Fresh', zh: '新鲜', pinyin: 'xīnxiān' },
      { en: 'Bargain', zh: '还价', pinyin: 'huánjià' },
    ],
  },
  {
    id: 'restaurant',
    title: 'Restaurant',
    icon: '\u{1F962}',
    description: 'Order dishes, ask for recommendations, and pay the bill.',
    vocab: [
      { en: 'Menu', zh: '菜单', pinyin: 'càidān' },
      { en: 'Delicious', zh: '好吃', pinyin: 'hǎochī' },
      { en: 'Check, please', zh: '买单', pinyin: 'mǎidān' },
      { en: 'Spicy', zh: '辣', pinyin: 'là' },
      { en: 'Waiter', zh: '服务员', pinyin: 'fúwùyuán' },
      { en: 'Recommend', zh: '推荐', pinyin: 'tuījiàn' },
    ],
  },
  {
    id: 'train-station',
    title: 'Train Station',
    icon: '\u{1F684}',
    description: 'Buy tickets, ask for directions, and catch your train on time.',
    vocab: [
      { en: 'Ticket', zh: '票', pinyin: 'piào' },
      { en: 'Platform', zh: '站台', pinyin: 'zhàntái' },
      { en: 'Departure', zh: '出发', pinyin: 'chūfā' },
      { en: 'Arrival', zh: '到达', pinyin: 'dàodá' },
      { en: 'Schedule', zh: '时间表', pinyin: 'shíjiānbiǎo' },
      { en: 'Delay', zh: '延误', pinyin: 'yánwù' },
    ],
  },
  {
    id: 'taxi-ride',
    title: 'Taxi Ride',
    icon: '\u{1F695}',
    description: 'Give directions to your destination and chat with the driver.',
    vocab: [
      { en: 'Address', zh: '地址', pinyin: 'dìzhǐ' },
      { en: 'Turn left', zh: '左转', pinyin: 'zuǒ zhuǎn' },
      { en: 'Turn right', zh: '右转', pinyin: 'yòu zhuǎn' },
      { en: 'Straight ahead', zh: '直走', pinyin: 'zhízǒu' },
      { en: 'Fare', zh: '车费', pinyin: 'chēfèi' },
      { en: 'Stop here', zh: '在这里停', pinyin: 'zài zhèlǐ tíng' },
    ],
  },
  {
    id: 'hotel-checkin',
    title: 'Hotel Check-in',
    icon: '\u{1F6CE}\u{FE0F}',
    description: 'Check into your room and ask about hotel amenities.',
    vocab: [
      { en: 'Reservation', zh: '预订', pinyin: 'yùdìng' },
      { en: 'Room key', zh: '房卡', pinyin: 'fángkǎ' },
      { en: 'Check-in', zh: '入住', pinyin: 'rùzhù' },
      { en: 'Check-out', zh: '退房', pinyin: 'tuìfáng' },
      { en: 'Breakfast', zh: '早餐', pinyin: 'zǎocān' },
      { en: 'Wi-Fi password', zh: 'Wi-Fi密码', pinyin: 'Wi-Fi mìmǎ' },
    ],
  },
  {
    id: 'newspaper-reading',
    title: 'Newspaper Reading',
    icon: '\u{1F4F0}',
    description: 'Read headlines and discuss current events with a local.',
    vocab: [
      { en: 'News', zh: '新闻', pinyin: 'xīnwén' },
      { en: 'Headline', zh: '头条', pinyin: 'tóutiáo' },
      { en: 'Economy', zh: '经济', pinyin: 'jīngjì' },
      { en: 'Government', zh: '政府', pinyin: 'zhèngfǔ' },
      { en: 'Report', zh: '报道', pinyin: 'bàodào' },
      { en: 'Opinion', zh: '观点', pinyin: 'guāndiǎn' },
    ],
  },
  {
    id: 'business-meeting',
    title: 'Business Meeting',
    icon: '\u{1F4BC}',
    description: 'Negotiate a deal and exchange pleasantries with partners.',
    vocab: [
      { en: 'Contract', zh: '合同', pinyin: 'hétong' },
      { en: 'Partner', zh: '合作伙伴', pinyin: 'hézuò huǒbàn' },
      { en: 'Negotiate', zh: '谈判', pinyin: 'tánpàn' },
      { en: 'Agreement', zh: '协议', pinyin: 'xiéyì' },
      { en: 'Deadline', zh: '截止日期', pinyin: 'jiézhǐ rìqī' },
      { en: 'Profit', zh: '利润', pinyin: 'lìrùn' },
    ],
  },
  {
    id: 'politician-speech',
    title: 'Politician Speech',
    icon: '\u{1F3A4}',
    description: 'Listen to a speech and discuss politics with citizens.',
    vocab: [
      { en: 'Speech', zh: '演讲', pinyin: 'yǎnjiǎng' },
      { en: 'Policy', zh: '政策', pinyin: 'zhèngcè' },
      { en: 'Citizen', zh: '公民', pinyin: 'gōngmín' },
      { en: 'Election', zh: '选举', pinyin: 'xuǎnjǔ' },
      { en: 'Vote', zh: '投票', pinyin: 'tóupiào' },
      { en: 'Reform', zh: '改革', pinyin: 'gǎigé' },
    ],
  },
]

const REAL_LIFE_SCENARIO = {
  id: 'real-life-conversation',
  title: 'Real Life Conversation',
  icon: '\u{1F451}',
  description: 'An unscripted, free-flowing conversation putting everything together.',
  special: true,
  vocab: [
    { en: 'Free conversation', zh: '自由对话', pinyin: 'zìyóu duìhuà' },
    { en: 'Fluency', zh: '流利', pinyin: 'liúlì' },
    { en: 'Practice', zh: '练习', pinyin: 'liànxí' },
    { en: 'Confidence', zh: '自信', pinyin: 'zìxìn' },
  ],
}

function LockIcon({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrownIcon({ className = 'w-9 h-9' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <defs>
        <linearGradient id="crownGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path
        d="M3 8l3.5 3L12 4l5.5 7L21 8l-2 10H5L3 8z"
        fill="url(#crownGradient)"
        stroke="#92400e"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProgressBar({ progress, gold }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-[#37464F] overflow-hidden">
      <div
        className={'h-full rounded-full transition-all duration-500 ' + (gold ? 'bg-[#FFC800]' : 'bg-[#58CC02]')}
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

function ScenarioCard({ scenario, unlocked, progress, completed, index, onClick }) {
  const isSpecial = Boolean(scenario.special)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!unlocked}
      style={{ animationDelay: `${index * 70}ms` }}
      className={
        'group relative animate-fade-in-up text-left rounded-3xl p-5 border-2 transition-all duration-150 overflow-hidden ' +
        (isSpecial
          ? 'border-[#FFC800] border-b-[6px] bg-[#3A3115] ' + (unlocked ? 'hover:scale-[1.02]' : '')
          : 'bg-[#1F2937] ' +
            (unlocked
              ? 'border-[#37464F] border-b-[6px] hover:scale-[1.02] cursor-pointer'
              : 'border-[#37464F] cursor-not-allowed'))
      }
    >
      <div className={unlocked ? '' : 'opacity-40 grayscale'}>
        <div
          className={
            'flex h-12 w-12 items-center justify-center rounded-2xl text-3xl mb-4 ' +
            (isSpecial ? 'bg-[#FFC800]/20' : 'bg-[#2B4022]')
          }
        >
          {isSpecial ? <CrownIcon /> : <span>{scenario.icon}</span>}
        </div>

        <h3 className="font-display text-lg font-extrabold mb-1.5 text-white">
          {scenario.title}
        </h3>
        <p className="text-sm text-gray-400 font-medium leading-snug mb-4 min-h-[2.5rem]">
          {scenario.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <ProgressBar progress={progress} gold={isSpecial} />
          <span className="text-[11px] tabular-nums text-gray-400 font-bold shrink-0">{progress}%</span>
        </div>
      </div>

      {completed && (
        <span className="absolute top-3 right-3 text-[10px] font-extrabold uppercase tracking-wide text-white bg-[#58CC02] rounded-full px-2 py-0.5">
          Done
        </span>
      )}

      {!unlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-[#1F2937]/90 backdrop-blur-sm cursor-not-allowed">
          <LockIcon className={'w-7 h-7 ' + (isSpecial ? 'text-[#FFC800]' : 'text-gray-600')} />
          <span
            className={
              'text-[11px] font-extrabold uppercase tracking-widest ' + (isSpecial ? 'text-[#FFC800]' : 'text-gray-600')
            }
          >
            {isSpecial ? 'Complete all scenarios' : 'Locked'}
          </span>
        </div>
      )}
    </button>
  )
}

function LessonModal({ scenario, onClose, onStart }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-auto animate-overlay-fade z-20">
      <div className="animate-modal-pop w-[28rem] max-h-[85vh] overflow-y-auto rounded-3xl bg-[#1F2937] border-2 border-[#37464F] p-7 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-600 hover:text-gray-400 transition-colors text-2xl leading-none font-bold"
          aria-label="Close"
        >
          &times;
        </button>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{scenario.special ? '\u{1F451}' : scenario.icon}</span>
          <div>
            <h3 className="font-display text-xl font-extrabold text-white">{scenario.title}</h3>
            <p className="text-xs text-gray-400 font-medium">{scenario.description}</p>
          </div>
        </div>

        <h4 className="font-display text-xs font-extrabold uppercase tracking-widest text-gray-400 mt-6 mb-3">
          Key Vocabulary
        </h4>
        <ul className="flex flex-col gap-2 mb-6">
          {scenario.vocab.map((word) => (
            <li
              key={word.en}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[#28323c] border-2 border-[#37464F] px-4 py-2.5"
            >
              <span className="text-sm text-gray-300 font-semibold">{word.en}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-lg font-bold text-white">{word.zh}</span>
                <span className="text-xs text-[#1CB0F6] font-bold italic">{word.pinyin}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onStart}
          className="w-full py-3 rounded-2xl bg-[#58CC02] hover:bg-[#61D908] border-2 border-[#46A302] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all text-white font-display font-extrabold uppercase tracking-wide"
        >
          Start Scenario
        </button>
      </div>
    </div>
  )
}

export default function ScenariosPage({ country = 'China', completedScenarios = [], onBack, onScenarioStart }) {
  const progress = CHINA_SCENARIOS.map(sc => completedScenarios.includes(sc.id) ? 100 : 0)
  const [activeScenario, setActiveScenario] = useState(null)

  const allCompleted = progress.every((p) => p >= 100)
  const completedCount = progress.filter((p) => p >= 100).length

  function isUnlocked(index) {
    return index === 0 || progress[index - 1] >= 100
  }

  function handleCardClick(scenario, unlocked) {
    if (!unlocked) return
    setActiveScenario(scenario)
  }

  function handleStartScenario() {
    const scenario = activeScenario
    if (!scenario) return
    setActiveScenario(null)
    onScenarioStart?.(scenario)
  }

  return (
    <div className="relative w-screen h-screen overflow-y-auto overflow-x-hidden bg-[#0F1418] text-white font-sans">
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-full bg-[#1F2937] hover:bg-[#28323c] border-2 border-[#37464F] border-b-4 active:border-b-2 active:translate-y-0.5 px-4 py-2 transition-all font-extrabold text-gray-400"
        >
          <BackIcon />
          <span className="text-sm">Back to Globe</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-3xl">{'\u{1F1E8}\u{1F1F3}'}</span>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-white">{country}</h1>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em]">Choose a Scenario</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-[#1F2937] border-2 border-[#37464F] px-5 py-2.5 shadow-sm">
          <span className="font-display text-lg font-extrabold tabular-nums text-[#58CC02]">
            {completedCount}/{CHINA_SCENARIOS.length}
          </span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">completed</span>
        </div>
      </header>

      <main className="relative z-10 px-8 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {CHINA_SCENARIOS.map((scenario, index) => {
            const unlocked = isUnlocked(index)
            return (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                index={index}
                unlocked={unlocked}
                progress={progress[index]}
                completed={progress[index] >= 100}
                onClick={() => handleCardClick(scenario, unlocked)}
              />
            )
          })}
          <ScenarioCard
            scenario={REAL_LIFE_SCENARIO}
            index={CHINA_SCENARIOS.length}
            unlocked={allCompleted}
            progress={allCompleted ? 0 : 0}
            completed={false}
            onClick={() => handleCardClick(REAL_LIFE_SCENARIO, allCompleted)}
          />
        </div>
      </main>

      {activeScenario && (
        <LessonModal
          scenario={activeScenario}
          onClose={() => setActiveScenario(null)}
          onStart={handleStartScenario}
        />
      )}
    </div>
  )
}
