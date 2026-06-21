export const COUNTRIES = [
  { name: 'China', code: 'cn', flag: '\u{1F1E8}\u{1F1F3}', lat: 35.8617, lng: 104.1954, langCode: 'zh' },
  { name: 'India', code: 'in', flag: '🇮🇳', lat: 20.5937, lng: 78.9629, langCode: 'hi' },
  { name: 'France', code: 'fr', flag: '\u{1F1EB}\u{1F1F7}', lat: 46.2276, lng: 2.2137, langCode: 'fr' },
  { name: 'Mexico', code: 'mx', flag: '\u{1F1F2}\u{1F1FD}', lat: 23.6345, lng: -102.5528, langCode: 'es' },
  { name: 'Egypt', code: 'eg', flag: '\u{1F1EA}\u{1F1EC}', lat: 26.8206, lng: 30.8025, langCode: 'ar' },
  { name: 'Brazil', code: 'br', flag: '\u{1F1E7}\u{1F1F7}', lat: -14.235, lng: -51.9253, langCode: 'pt' },
]

export const CHINA = COUNTRIES[0]

export const CHARACTERS = {
  China: {
    type: 'Spy',
    icon: '\u{1F575}\u{FE0F}',
    story: 'You are a spy sent to infiltrate a Shanghai black market. To blend in, you must master Mandarin.',
    gradient: 'from-[#3a0a0a] via-[#1F2937] to-[#0F1418]',
  },
  India: {
    type: 'Bollywood Actor',
    icon: '🎬',
    story: 'You are an aspiring Bollywood actor trying to make it big in Mumbai. To win over the directors, you must master Hindi.',
    gradient: 'from-[#331a00] via-[#1F2937] to-[#0F1418]',
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

export const INDIA_SCENARIOS = [
  {
    id: 'chai-stall',
    title: 'Chai Stall',
    icon: '☕',
    description: 'Order a cup of cutting chai and chat with the locals.',
    vocab: [
      { en: 'Tea', zh: 'चाय', pinyin: 'chaay' },
      { en: 'Sugar', zh: 'चीनी', pinyin: 'cheenee' },
      { en: 'Hot', zh: 'गरम', pinyin: 'garam' },
    ],
  },
  {
    id: 'rickshaw-ride',
    title: 'Rickshaw Ride',
    icon: '🛺',
    description: 'Negotiate the fare for an auto rickshaw ride.',
    vocab: [
      { en: 'Where', zh: 'कहाँ', pinyin: 'kahaan' },
      { en: 'Money', zh: 'पैसे', pinyin: 'paise' },
      { en: 'Stop', zh: 'रुको', pinyin: 'ruko' },
    ],
  },
  {
    id: 'bollywood-set',
    title: 'Bollywood Set',
    icon: '🎬',
    description: 'Introduce yourself to the director on a movie set.',
    vocab: [
      { en: 'Actor', zh: 'अभिनेता', pinyin: 'abhineta' },
      { en: 'Ready', zh: 'तैयार', pinyin: 'taiyaar' },
      { en: 'Action', zh: 'एक्शन', pinyin: 'ekshan' },
    ],
  },
  {
    id: 'spice-market',
    title: 'Spice Market',
    icon: '🌶️',
    description: 'Buy fresh spices from a local vendor.',
    vocab: [
      { en: 'Spice', zh: 'मसाला', pinyin: 'masala' },
      { en: 'Spicy', zh: 'तीखा', pinyin: 'teekha' },
      { en: 'Give', zh: 'दो', pinyin: 'do' },
    ],
  },
  {
    id: 'yoga-ashram',
    title: 'Yoga Ashram',
    icon: '🧘',
    description: 'Attend a morning yoga session.',
    vocab: [
      { en: 'Breathe', zh: 'साँस', pinyin: 'saans' },
      { en: 'Peace', zh: 'शांति', pinyin: 'shaanti' },
      { en: 'Mind', zh: 'मन', pinyin: 'man' },
    ],
  },
  {
    id: 'indian-railway',
    title: 'Indian Railway',
    icon: '🚂',
    description: 'Find your platform at a busy railway station.',
    vocab: [
      { en: 'Train', zh: 'ट्रेन', pinyin: 'train' },
      { en: 'Ticket', zh: 'टिकट', pinyin: 'ticket' },
      { en: 'Time', zh: 'समय', pinyin: 'samay' },
    ],
  },
  {
    id: 'tech-hub',
    title: 'Tech Hub',
    icon: '💻',
    description: 'Meet with software engineers in Bangalore.',
    vocab: [
      { en: 'Computer', zh: 'कंप्यूटर', pinyin: 'kampyutar' },
      { en: 'Work', zh: 'काम', pinyin: 'kaam' },
      { en: 'Fast', zh: 'तेज़', pinyin: 'tez' },
    ],
  },
  {
    id: 'wedding-party',
    title: 'Wedding Party',
    icon: '🎊',
    description: 'Celebrate and dance at an Indian wedding.',
    vocab: [
      { en: 'Dance', zh: 'नाच', pinyin: 'naach' },
      { en: 'Happy', zh: 'खुश', pinyin: 'khush' },
      { en: 'Beautiful', zh: 'सुंदर', pinyin: 'sundar' },
    ],
  },
];

export const FRANCE_SCENARIOS = [
  {
    id: 'cafe-terrace',
    title: 'Café Terrace',
    icon: '🥐',
    description: 'Order a croissant and coffee at a bustling Parisian café.',
    vocab: [
      { en: 'Coffee', zh: 'café', pinyin: 'ka.fe' },
      { en: 'Croissant', zh: 'croissant', pinyin: 'kʁwa.sɑ̃' },
      { en: 'Please', zh: "s'il vous plaît", pinyin: 'sil vu plɛ' },
    ],
  },
  {
    id: 'louvre-museum',
    title: 'Louvre Museum',
    icon: '🖼️',
    description: 'Ask for directions to the Mona Lisa.',
    vocab: [
      { en: 'Where', zh: 'où', pinyin: 'u' },
      { en: 'Ticket', zh: 'billet', pinyin: 'bi.jɛ' },
      { en: 'Art', zh: 'art', pinyin: 'aʁ' },
    ],
  },
  {
    id: 'metro-station',
    title: 'Metro Station',
    icon: '🚇',
    description: 'Buy a train ticket and navigate the Paris Metro.',
    vocab: [
      { en: 'Train', zh: 'train', pinyin: 'tʁɛ̃' },
      { en: 'Station', zh: 'station', pinyin: 'sta.sjɔ̃' },
      { en: 'Exit', zh: 'sortie', pinyin: 'sɔʁ.ti' },
    ],
  },
  {
    id: 'bakery',
    title: 'Bakery',
    icon: '🥖',
    description: 'Buy a fresh baguette from a local boulangerie.',
    vocab: [
      { en: 'Bread', zh: 'pain', pinyin: 'pɛ̃' },
      { en: 'Bakery', zh: 'boulangerie', pinyin: 'bu.lɑ̃.ʒʁi' },
      { en: 'Good morning', zh: 'bonjour', pinyin: 'bɔ̃.ʒuʁ' },
    ],
  },
  {
    id: 'fashion-boutique',
    title: 'Fashion Boutique',
    icon: '👗',
    description: 'Try on clothes in a high-end fashion boutique.',
    vocab: [
      { en: 'Clothes', zh: 'vêtements', pinyin: 'vɛt.mɑ̃' },
      { en: 'Beautiful', zh: 'beau', pinyin: 'bo' },
      { en: 'Size', zh: 'taille', pinyin: 'taj' },
    ],
  },
  {
    id: 'vineyard',
    title: 'Vineyard Tour',
    icon: '🍷',
    description: 'Taste local wine and chat with the winemaker.',
    vocab: [
      { en: 'Wine', zh: 'vin', pinyin: 'vɛ̃' },
      { en: 'Red', zh: 'rouge', pinyin: 'ʁuʒ' },
      { en: 'Glass', zh: 'verre', pinyin: 'vɛʁ' },
    ],
  },
  {
    id: 'eiffel-tower',
    title: 'Eiffel Tower',
    icon: '🗼',
    description: 'Take photos and enjoy the view from the top.',
    vocab: [
      { en: 'Tower', zh: 'tour', pinyin: 'tuʁ' },
      { en: 'High', zh: 'haut', pinyin: 'o' },
      { en: 'Photo', zh: 'photo', pinyin: 'fɔ.to' },
    ],
  },
  {
    id: 'cheese-shop',
    title: 'Cheese Shop',
    icon: '🧀',
    description: 'Sample different types of French cheese.',
    vocab: [
      { en: 'Cheese', zh: 'fromage', pinyin: 'fʁɔ.maʒ' },
      { en: 'Taste', zh: 'goût', pinyin: 'gu' },
      { en: 'Strong', zh: 'fort', pinyin: 'fɔʁ' },
    ],
  },
];

export const MEXICO_SCENARIOS = [
  {
    id: 'taco-stand',
    title: 'Taco Stand',
    icon: '🌮',
    description: 'Order some street tacos and ask for extra salsa.',
    vocab: [
      { en: 'Taco', zh: 'taco', pinyin: 'ta.ko' },
      { en: 'Spicy', zh: 'picante', pinyin: 'pi.kan.te' },
      { en: 'Delicious', zh: 'delicioso', pinyin: 'de.li.sjo.so' },
    ],
  },
  {
    id: 'local-mercado',
    title: 'Local Mercado',
    icon: '🛍️',
    description: 'Haggle for souvenirs at a lively market.',
    vocab: [
      { en: 'How much', zh: 'cuánto', pinyin: 'kwan.to' },
      { en: 'Expensive', zh: 'caro', pinyin: 'ka.ɾo' },
      { en: 'Cheap', zh: 'barato', pinyin: 'ba.ɾa.to' },
    ],
  },
  {
    id: 'beach-resort',
    title: 'Beach Resort',
    icon: '🏖️',
    description: 'Relax at a resort in Cancún and ask for a towel.',
    vocab: [
      { en: 'Beach', zh: 'playa', pinyin: 'pla.ʝa' },
      { en: 'Towel', zh: 'toalla', pinyin: 'to.a.ʝa' },
      { en: 'Sun', zh: 'sol', pinyin: 'sol' },
    ],
  },
  {
    id: 'mariachi-plaza',
    title: 'Mariachi Plaza',
    icon: '🎸',
    description: 'Request a song from a local Mariachi band.',
    vocab: [
      { en: 'Music', zh: 'música', pinyin: 'mu.si.ka' },
      { en: 'Song', zh: 'canción', pinyin: 'kan.sjon' },
      { en: 'Sing', zh: 'cantar', pinyin: 'kan.taɾ' },
    ],
  },
  {
    id: 'cenote-swim',
    title: 'Cenote Swim',
    icon: '🌊',
    description: 'Go swimming in a beautiful natural cenote.',
    vocab: [
      { en: 'Swim', zh: 'nadar', pinyin: 'na.ðaɾ' },
      { en: 'Water', zh: 'agua', pinyin: 'a.ɣwa' },
      { en: 'Cold', zh: 'frío', pinyin: 'fɾi.o' },
    ],
  },
  {
    id: 'ruins-tour',
    title: 'Maya Ruins Tour',
    icon: '🏛️',
    description: 'Explore ancient pyramids and learn history.',
    vocab: [
      { en: 'Pyramid', zh: 'pirámide', pinyin: 'pi.ɾa.mi.ðe' },
      { en: 'Old', zh: 'viejo', pinyin: 'bje.xo' },
      { en: 'History', zh: 'historia', pinyin: 'is.to.ɾja' },
    ],
  },
  {
    id: 'lucha-libre',
    title: 'Lucha Libre',
    icon: '🤼',
    description: 'Cheer at an exciting wrestling match.',
    vocab: [
      { en: 'Fight', zh: 'lucha', pinyin: 'lu.tʃa' },
      { en: 'Mask', zh: 'máscara', pinyin: 'mas.ka.ɾa' },
      { en: 'Strong', zh: 'fuerte', pinyin: 'fweɾ.te' },
    ],
  },
  {
    id: 'cantina',
    title: 'Local Cantina',
    icon: '🍻',
    description: 'Grab a drink and chat at a traditional cantina.',
    vocab: [
      { en: 'Beer', zh: 'cerveza', pinyin: 'seɾ.βe.sa' },
      { en: 'Cheers', zh: 'salud', pinyin: 'sa.luð' },
      { en: 'Friend', zh: 'amigo', pinyin: 'a.mi.ɣo' },
    ],
  },
];

export const SCENARIOS_BY_COUNTRY = {
  China: CHINA_SCENARIOS,
  India: INDIA_SCENARIOS,
  France: FRANCE_SCENARIOS,
  Mexico: MEXICO_SCENARIOS,
}

export const SPECIAL_SCENARIO_BY_COUNTRY = {
  China: REAL_LIFE_SCENARIO,
  India: {
    ...REAL_LIFE_SCENARIO,
    id: 'real-life-india',
  },
  France: {
    ...REAL_LIFE_SCENARIO,
    id: 'real-life-france',
  },
  Mexico: {
    ...REAL_LIFE_SCENARIO,
    id: 'real-life-mexico',
  },
}

export const UNLOCK_COST = 100
export const REWARD_TOKENS = 150

export function levelForCompleted(completed) {
  return 1 + Math.floor(completed / 2)
}
