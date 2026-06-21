export const COUNTRIES = [
  { name: 'China', flag: '\u{1F1E8}\u{1F1F3}', lat: 35.8617, lng: 104.1954 },
  { name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', lat: 36.2048, lng: 138.2529 },
  { name: 'France', flag: '\u{1F1EB}\u{1F1F7}', lat: 46.2276, lng: 2.2137 },
  { name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}', lat: 23.6345, lng: -102.5528 },
  { name: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}', lat: 26.8206, lng: 30.8025 },
  { name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}', lat: -14.235, lng: -51.9253 },
]

export const CHINA = COUNTRIES[0]

export const CHARACTERS = {
  China: {
    type: 'Spy',
    icon: '\u{1F575}\u{FE0F}',
    story: 'You are a spy sent to infiltrate a Shanghai black market. To blend in, you must master Mandarin.',
    gradient: 'from-[#3a0a0a] via-[#1F2937] to-[#0F1418]',
  },
  Japan: {
    type: 'Ronin',
    icon: '⚔️',
    story: 'You are a wandering ronin chasing a rival through the neon streets of Tokyo. To earn allies, you must master Japanese.',
    gradient: 'from-[#1a1033] via-[#1F2937] to-[#0F1418]',
  },
  France: {
    type: 'Art Thief',
    icon: '\u{1F5BC}\u{FE0F}',
    story: 'You are a master thief plotting a heist inside the Louvre. To move unseen, you must master French.',
    gradient: 'from-[#241a05] via-[#1F2937] to-[#0F1418]',
  },
  Mexico: {
    type: 'Treasure Hunter',
    icon: '\u{1F5FA}\u{FE0F}',
    story: "You are a treasure hunter chasing a lost Aztec relic through Mexico City. To win the locals' trust, you must master Spanish.",
    gradient: 'from-[#1f1404] via-[#1F2937] to-[#0F1418]',
  },
  Egypt: {
    type: 'Archaeologist',
    icon: '\u{1F3FA}',
    story: "You are an archaeologist racing to uncover a pharaoh's tomb before rivals do. To decode the secrets, you must master Arabic.",
    gradient: 'from-[#241704] via-[#1F2937] to-[#0F1418]',
  },
  Brazil: {
    type: 'Undercover Journalist',
    icon: '\u{1F399}\u{FE0F}',
    story: 'You are an undercover journalist exposing a cartel in Rio de Janeiro. To gain access, you must master Portuguese.',
    gradient: 'from-[#031a14] via-[#1F2937] to-[#0F1418]',
  },
}

export const CHINA_SCENARIOS = [
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

export const REAL_LIFE_SCENARIO = {
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

export const SCENARIOS_BY_COUNTRY = {
  China: CHINA_SCENARIOS,
}

export const SPECIAL_SCENARIO_BY_COUNTRY = {
  China: REAL_LIFE_SCENARIO,
}

export const UNLOCK_COST = 100
export const REWARD_TOKENS = 150

export function levelForCompleted(completed) {
  return 1 + Math.floor(completed / 2)
}
