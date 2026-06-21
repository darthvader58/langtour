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

export const JAPAN_SCENARIOS = [
  {
    id: 'ninja-dojo',
    title: 'Ninja Training Dojo',
    icon: '\u{1F977}',
    description: 'Infiltrate a secret dojo and earn the master\'s trust while learning the way of the shadow.',
    vocab: [
      { en: 'Master', native: '先生', roman: 'sensei' },
      { en: 'Sword', native: '刀', roman: 'katana' },
      { en: 'Hide', native: '隠れる', roman: 'kakureru' },
      { en: 'Quietly', native: '静かに', roman: 'shizuka ni' },
      { en: 'Train', native: '稽古', roman: 'keiko' },
    ],
  },
  {
    id: 'sushi-restaurant',
    title: 'Sushi Restaurant',
    icon: '\u{1F363}',
    description: 'Slip a message to your contact across the counter while ordering at a busy sushi bar.',
    vocab: [
      { en: 'Welcome', native: 'いらっしゃいませ', roman: 'irasshaimase' },
      { en: 'Recommendation', native: 'おすすめ', roman: 'osusume' },
      { en: 'Tuna', native: 'まぐろ', roman: 'maguro' },
      { en: 'Check, please', native: 'お会計お願いします', roman: 'okaikei onegai shimasu' },
      { en: 'Delicious', native: '美味しい', roman: 'oishii' },
    ],
  },
  {
    id: 'tokyo-train',
    title: 'Tokyo Train',
    icon: '\u{1F686}',
    description: 'Tail your target through a crowded station without losing them in the rush.',
    vocab: [
      { en: 'Station', native: '駅', roman: 'eki' },
      { en: 'Ticket', native: '切符', roman: 'kippu' },
      { en: 'Next stop', native: '次の駅', roman: 'tsugi no eki' },
      { en: 'Transfer', native: '乗り換え', roman: 'norikae' },
      { en: 'Excuse me', native: 'すみません', roman: 'sumimasen' },
    ],
  },
  {
    id: 'karaoke-bar',
    title: 'Karaoke Bar',
    icon: '\u{1F3A4}',
    description: 'Loosen a loose-lipped informant\'s tongue over drinks and a private karaoke room.',
    vocab: [
      { en: 'Song', native: '歌', roman: 'uta' },
      { en: 'Drink', native: '飲み物', roman: 'nomimono' },
      { en: 'Cheers', native: '乾杯', roman: 'kanpai' },
      { en: 'One more', native: 'もう一曲', roman: 'mou ikkyoku' },
      { en: 'Microphone', native: 'マイク', roman: 'maiku' },
    ],
  },
  {
    id: 'sumo-match',
    title: 'Sumo Match',
    icon: '\u{1F93C}',
    description: 'Blend in with roaring fans at the arena while watching a suspect in the stands.',
    vocab: [
      { en: 'Wrestler', native: '力士', roman: 'rikishi' },
      { en: 'Match', native: '取組', roman: 'torikumi' },
      { en: 'Win', native: '勝ち', roman: 'kachi' },
      { en: 'Strong', native: '強い', roman: 'tsuyoi' },
      { en: 'Ring', native: '土俵', roman: 'dohyou' },
    ],
  },
  {
    id: 'cherry-blossom-festival',
    title: 'Cherry Blossom Festival',
    icon: '\u{1F338}',
    description: 'Pass unnoticed through the picnic crowds to retrieve a drop hidden beneath the petals.',
    vocab: [
      { en: 'Cherry blossom', native: '桜', roman: 'sakura' },
      { en: 'Flower viewing', native: 'お花見', roman: 'ohanami' },
      { en: 'Beautiful', native: '綺麗', roman: 'kirei' },
      { en: 'Spring', native: '春', roman: 'haru' },
      { en: 'Picnic', native: 'ピクニック', roman: 'pikunikku' },
    ],
  },
  {
    id: 'tech-company-meeting',
    title: 'Tech Company Meeting',
    icon: '\u{1F4BB}',
    description: 'Pose as a consultant in a boardroom to lift secrets from a guarded prototype.',
    vocab: [
      { en: 'Meeting', native: '会議', roman: 'kaigi' },
      { en: 'Company', native: '会社', roman: 'kaisha' },
      { en: 'Project', native: 'プロジェクト', roman: 'purojekuto' },
      { en: 'Business card', native: '名刺', roman: 'meishi' },
      { en: 'Deadline', native: '締め切り', roman: 'shimekiri' },
    ],
  },
  {
    id: 'emperors-speech',
    title: 'Emperor\'s Speech',
    icon: '\u{1F3EF}',
    description: 'Stand among dignitaries at the palace, decoding a coded phrase woven into the address.',
    vocab: [
      { en: 'Emperor', native: '天皇', roman: 'tennou' },
      { en: 'Speech', native: '演説', roman: 'enzetsu' },
      { en: 'Nation', native: '国', roman: 'kuni' },
      { en: 'Peace', native: '平和', roman: 'heiwa' },
      { en: 'Honored guest', native: '来賓', roman: 'raihin' },
    ],
  },
]

export const JAPAN_REAL_LIFE = {
  id: 'japan-real-life',
  title: 'Real Life Conversation',
  icon: '\u{1F451}',
  description: 'Drop the script and hold a free-flowing conversation that pulls every mission\'s lessons together.',
  special: true,
  vocab: [
    { en: 'How are you?', native: 'お元気ですか', roman: 'ogenki desu ka' },
    { en: 'I think that...', native: '〜と思います', roman: '~to omoimasu' },
    { en: 'Really?', native: '本当ですか', roman: 'hontou desu ka' },
    { en: 'See you again', native: 'また会いましょう', roman: 'mata aimashou' },
  ],
}

export const FRANCE_SCENARIOS = [
  {
    id: 'cafe-au-lait',
    title: 'Cafe au Lait',
    icon: '☕',
    description: 'Blend in at a sidewalk cafe while quietly clocking the contact two tables over.',
    vocab: [
      { en: 'Hello', native: 'Bonjour', roman: 'bohn-ZHOOR' },
      { en: 'A coffee with milk, please', native: 'Un cafe au lait, s\'il vous plait', roman: 'uhn ka-FAY oh LAY seel voo PLEH' },
      { en: 'The bill, please', native: 'L\'addition, s\'il vous plait', roman: 'la-dee-SYOHN seel voo PLEH' },
      { en: 'Is this seat free?', native: 'Cette place est-elle libre?', roman: 'set PLASS et-EL LEE-bruh' },
      { en: 'Thank you very much', native: 'Merci beaucoup', roman: 'mair-SEE boh-KOO' },
    ],
  },
  {
    id: 'eiffel-tower',
    title: 'Eiffel Tower Tour',
    icon: '🗼',
    description: 'Pose as a tourist on the observation deck to make the dead-drop hand-off unseen.',
    vocab: [
      { en: 'Where is the entrance?', native: 'Ou est l\'entree?', roman: 'oo eh lahn-TRAY' },
      { en: 'One ticket, please', native: 'Un billet, s\'il vous plait', roman: 'uhn bee-YAY seel voo PLEH' },
      { en: 'The view is beautiful', native: 'La vue est magnifique', roman: 'lah VOO eh mah-nyee-FEEK' },
      { en: 'The elevator', native: 'L\'ascenseur', roman: 'la-sahn-SUR' },
      { en: 'What time does it close?', native: 'A quelle heure ca ferme?', roman: 'ah kel UR sah FAIRM' },
    ],
  },
  {
    id: 'metro-station',
    title: 'Metro Station',
    icon: '🚇',
    description: 'Lose the tail in the crowd and slip onto the last train before the doors close.',
    vocab: [
      { en: 'Which line goes to the center?', native: 'Quelle ligne va au centre?', roman: 'kel LEEN-yuh vah oh SAHN-truh' },
      { en: 'A ticket', native: 'Un ticket', roman: 'uhn tee-KAY' },
      { en: 'Where do I change trains?', native: 'Ou est-ce que je change?', roman: 'oo ESS kuh zhuh SHAHNZH' },
      { en: 'The next stop', native: 'Le prochain arret', roman: 'luh proh-SHAN ah-RAY' },
      { en: 'Excuse me, I\'m getting off', native: 'Pardon, je descends', roman: 'par-DOHN zhuh day-SAHN' },
    ],
  },
  {
    id: 'boulangerie',
    title: 'Boulangerie',
    icon: '🥖',
    description: 'Pass the coded message folded inside a baguette during the morning bread run.',
    vocab: [
      { en: 'A baguette, please', native: 'Une baguette, s\'il vous plait', roman: 'oon ba-GET seel voo PLEH' },
      { en: 'How much is it?', native: 'C\'est combien?', roman: 'say kohm-BYAN' },
      { en: 'Two croissants', native: 'Deux croissants', roman: 'duh krwah-SAHN' },
      { en: 'Fresh bread', native: 'Du pain frais', roman: 'doo pan FRAY' },
      { en: 'That\'s all, thank you', native: 'C\'est tout, merci', roman: 'say TOO mair-SEE' },
    ],
  },
  {
    id: 'art-museum',
    title: 'Art Museum',
    icon: '🎨',
    description: 'Study the forged canvas the broker is fencing while admiring the masterpieces.',
    vocab: [
      { en: 'Where is the painting?', native: 'Ou est le tableau?', roman: 'oo eh luh ta-BLOH' },
      { en: 'This artwork', native: 'Cette oeuvre', roman: 'set UH-vruh' },
      { en: 'Is photography allowed?', native: 'Les photos sont-elles permises?', roman: 'lay foh-TOH sohn-tel pair-MEEZ' },
      { en: 'It is magnificent', native: 'C\'est magnifique', roman: 'say mah-nyee-FEEK' },
      { en: 'Where is the exit?', native: 'Ou est la sortie?', roman: 'oo eh lah sor-TEE' },
    ],
  },
  {
    id: 'fashion-show',
    title: 'Fashion Show',
    icon: '👗',
    description: 'Work the runway crowd to lift the target\'s phone amid the camera flashes.',
    vocab: [
      { en: 'It is very elegant', native: 'C\'est tres elegant', roman: 'say tray ay-lay-GAHN' },
      { en: 'What is your name?', native: 'Comment vous appelez-vous?', roman: 'koh-MAHN voo zap-lay VOO' },
      { en: 'The dress', native: 'La robe', roman: 'lah ROHB' },
      { en: 'I love this style', native: 'J\'adore ce style', roman: 'zha-DOR suh STEEL' },
      { en: 'May I take a photo?', native: 'Puis-je prendre une photo?', roman: 'pwee-zhuh PRAHN-druh oon foh-TOH' },
    ],
  },
  {
    id: 'business-lunch',
    title: 'Business Lunch',
    icon: '🍽️',
    description: 'Trade pleasantries over wine while steering the deal toward the real intel.',
    vocab: [
      { en: 'Pleased to meet you', native: 'Enchante', roman: 'ahn-shahn-TAY' },
      { en: 'Shall we discuss business?', native: 'Parlons-nous affaires?', roman: 'par-LOHN noo za-FAIR' },
      { en: 'I agree', native: 'Je suis d\'accord', roman: 'zhuh swee da-KOR' },
      { en: 'To your health', native: 'A votre sante', roman: 'ah VOH-truh sahn-TAY' },
      { en: 'It\'s a deal', native: 'Marche conclu', roman: 'mar-SHAY kohn-KLOO' },
    ],
  },
  {
    id: 'presidential-address',
    title: 'Presidential Address',
    icon: '🏛️',
    description: 'Slip into the press corps at the Elysee to read the room before the leak breaks.',
    vocab: [
      { en: 'Ladies and gentlemen', native: 'Mesdames et messieurs', roman: 'may-DAHM ay may-SYUH' },
      { en: 'The president', native: 'Le president', roman: 'luh pray-zee-DAHN' },
      { en: 'I have a question', native: 'J\'ai une question', roman: 'zhay oon kess-TYOHN' },
      { en: 'The government', native: 'Le gouvernement', roman: 'luh goo-vair-nuh-MAHN' },
      { en: 'According to my sources', native: 'D\'apres mes sources', roman: 'da-PRAY may SOORS' },
    ],
  },
]

export const FRANCE_REAL_LIFE = {
  id: 'france-real-life',
  title: 'Real Life Conversation',
  icon: '\u{1F451}',
  description: 'No script, no cover story: hold a free-flowing French conversation and bring every mission together.',
  special: true,
  vocab: [
    { en: 'How are you?', native: 'Comment allez-vous?', roman: 'koh-mahn ta-lay VOO' },
    { en: 'I would like to talk with you', native: 'Je voudrais parler avec vous', roman: 'zhuh voo-DRAY par-LAY a-vek VOO' },
    { en: 'Can you repeat, please?', native: 'Pouvez-vous repeter, s\'il vous plait?', roman: 'poo-vay VOO ray-pay-TAY seel voo PLEH' },
    { en: 'It was a pleasure', native: 'C\'etait un plaisir', roman: 'say-TAY uhn play-ZEER' },
  ],
}

export const MEXICO_SCENARIOS = [
  {
    id: 'street-tacos',
    title: 'Street Tacos',
    icon: '🌮',
    description: 'Blend in at the taco stand while you wait for your contact to make the drop.',
    vocab: [
      { en: 'How much is it?', native: '¿Cuánto cuesta?', roman: 'KWAN-toh KWES-tah' },
      { en: 'Two tacos, please', native: 'Dos tacos, por favor', roman: 'dohs TAH-kohs pohr fah-VOHR' },
      { en: 'With everything', native: 'Con todo', roman: 'kohn TOH-doh' },
      { en: 'Spicy salsa', native: 'Salsa picante', roman: 'SAHL-sah pee-KAHN-teh' },
      { en: 'The check, please', native: 'La cuenta, por favor', roman: 'lah KWEN-tah pohr fah-VOHR' },
    ],
  },
  {
    id: 'mercado',
    title: 'Mercado',
    icon: '🛒',
    description: 'Haggle through the crowded market stalls to shake the tail following you.',
    vocab: [
      { en: 'Too expensive', native: 'Muy caro', roman: 'mooy KAH-roh' },
      { en: 'A discount?', native: '¿Un descuento?', roman: 'oon des-KWEN-toh' },
      { en: 'I am just looking', native: 'Solo estoy mirando', roman: 'SOH-loh es-TOY mee-RAHN-doh' },
      { en: 'Where is it?', native: '¿Dónde está?', roman: 'DOHN-deh es-TAH' },
      { en: 'I want this one', native: 'Quiero este', roman: 'kee-EH-roh ES-teh' },
    ],
  },
  {
    id: 'bus-station',
    title: 'Bus Station',
    icon: '🚌',
    description: 'Buy a ticket and slip out of the city before your cover is blown.',
    vocab: [
      { en: 'One ticket', native: 'Un boleto', roman: 'oon boh-LEH-toh' },
      { en: 'What time does it leave?', native: '¿A qué hora sale?', roman: 'ah keh OH-rah SAH-leh' },
      { en: 'Which platform?', native: '¿Cuál andén?', roman: 'kwahl ahn-DEN' },
      { en: 'Is it direct?', native: '¿Es directo?', roman: 'es dee-REK-toh' },
      { en: 'Round trip', native: 'Viaje redondo', roman: 'bee-AH-heh reh-DOHN-doh' },
    ],
  },
  {
    id: 'hotel-fiesta',
    title: 'Hotel Fiesta',
    icon: '🏨',
    description: 'Check into the hotel under an alias and secure a room with a clear exit.',
    vocab: [
      { en: 'I have a reservation', native: 'Tengo una reservación', roman: 'TEN-goh OO-nah reh-sehr-vah-see-OHN' },
      { en: 'A room for one night', native: 'Una habitación por una noche', roman: 'OO-nah ah-bee-tah-see-OHN pohr OO-nah NOH-cheh' },
      { en: 'What is the password?', native: '¿Cuál es la contraseña?', roman: 'kwahl es lah kohn-trah-SEH-nyah' },
      { en: 'The key, please', native: 'La llave, por favor', roman: 'lah YAH-veh pohr fah-VOHR' },
      { en: 'Is there another exit?', native: '¿Hay otra salida?', roman: 'eye OH-trah sah-LEE-dah' },
    ],
  },
  {
    id: 'lucha-libre-match',
    title: 'Lucha Libre Match',
    icon: '🤼',
    description: 'Use the roaring crowd at the wrestling arena to pass a coded message unseen.',
    vocab: [
      { en: 'Where are the seats?', native: '¿Dónde están los asientos?', roman: 'DOHN-deh es-TAHN lohs ah-see-EN-tohs' },
      { en: 'Who is winning?', native: '¿Quién va ganando?', roman: 'kee-EN vah gah-NAHN-doh' },
      { en: 'Watch out!', native: '¡Cuidado!', roman: 'kwee-DAH-doh' },
      { en: 'The mask', native: 'La máscara', roman: 'lah MAHS-kah-rah' },
      { en: 'Let me through', native: 'Déjame pasar', roman: 'DEH-hah-meh pah-SAHR' },
    ],
  },
  {
    id: 'newspaper-kiosk',
    title: 'Newspaper Kiosk',
    icon: '📰',
    description: 'Buy the morning paper that hides the microfilm tucked between its pages.',
    vocab: [
      { en: 'Do you have the newspaper?', native: '¿Tiene el periódico?', roman: 'tee-EH-neh el peh-ree-OH-dee-koh' },
      { en: 'Today\'s edition', native: 'La edición de hoy', roman: 'lah eh-dee-see-OHN deh oy' },
      { en: 'Any news?', native: '¿Alguna noticia?', roman: 'ahl-GOO-nah noh-TEE-see-ah' },
      { en: 'Keep the change', native: 'Quédese con el cambio', roman: 'KEH-deh-seh kohn el KAHM-bee-oh' },
      { en: 'A map of the city', native: 'Un mapa de la ciudad', roman: 'oon MAH-pah deh lah see-oo-DAHD' },
    ],
  },
  {
    id: 'cartel-negotiation',
    title: 'Cartel Negotiation',
    icon: '💼',
    description: 'Keep your nerve and your accent steady as you bluff your way through the deal.',
    vocab: [
      { en: 'We have a deal', native: 'Tenemos un trato', roman: 'teh-NEH-mohs oon TRAH-toh' },
      { en: 'I do not trust you', native: 'No confío en ti', roman: 'noh kohn-FEE-oh en tee' },
      { en: 'Where is the money?', native: '¿Dónde está el dinero?', roman: 'DOHN-deh es-TAH el dee-NEH-roh' },
      { en: 'Calm down', native: 'Cálmate', roman: 'KAHL-mah-teh' },
      { en: 'No tricks', native: 'Sin trucos', roman: 'seen TROO-kohs' },
    ],
  },
  {
    id: 'presidential-rally',
    title: 'Presidential Rally',
    icon: '🎤',
    description: 'Work the cheering political crowd to get close to your high-value target.',
    vocab: [
      { en: 'Long live Mexico!', native: '¡Viva México!', roman: 'VEE-vah MEH-hee-koh' },
      { en: 'Where is the president?', native: '¿Dónde está el presidente?', roman: 'DOHN-deh es-TAH el preh-see-DEN-teh' },
      { en: 'I support you', native: 'Lo apoyo', roman: 'loh ah-POH-yoh' },
      { en: 'It is an honor', native: 'Es un honor', roman: 'es oon oh-NOHR' },
      { en: 'May I take a photo?', native: '¿Puedo tomar una foto?', roman: 'PWEH-doh toh-MAHR OO-nah FOH-toh' },
    ],
  },
]

export const MEXICO_REAL_LIFE = {
  id: 'mexico-real-life',
  title: 'Real Life Conversation',
  icon: '\u{1F451}',
  description: 'No script, no safety net: hold a free-flowing conversation that ties every mission together.',
  special: true,
  vocab: [
    { en: 'Nice to meet you', native: 'Mucho gusto', roman: 'MOO-choh GOOS-toh' },
    { en: 'Where are you from?', native: '¿De dónde eres?', roman: 'deh DOHN-deh EH-res' },
    { en: 'Can we talk?', native: '¿Podemos hablar?', roman: 'poh-DEH-mohs ah-BLAHR' },
    { en: 'See you later', native: 'Hasta luego', roman: 'AHS-tah loo-EH-goh' },
  ],
}

export const EGYPT_SCENARIOS = [
  {
    id: 'bazaar-haggling',
    title: 'Bazaar Haggling',
    icon: '\u{1F6D2}',
    description: 'Slip into the Khan el-Khalili crowds and barter for a hidden contact behind the spice stalls.',
    vocab: [
      { en: 'How much?', native: 'بكام؟', roman: 'bekam' },
      { en: 'Too expensive', native: 'غالي قوي', roman: 'ghali awi' },
      { en: 'Lower the price', native: 'رخصلي', roman: 'rakhkhasli' },
      { en: 'I want this', native: 'عايز ده', roman: 'aayez da' },
      { en: 'Last price', native: 'اخر سعر', roman: 'akher seer' },
    ],
  },
  {
    id: 'pyramid-tour',
    title: 'Pyramid Tour',
    icon: '\u{1F3FA}',
    description: 'Pose as a curious tourist at Giza while scouting the guarded passage to a sealed chamber.',
    vocab: [
      { en: 'Pyramid', native: 'هرم', roman: 'haram' },
      { en: 'Ancient', native: 'قديم', roman: 'adeem' },
      { en: 'Tomb', native: 'مقبرة', roman: 'maabara' },
      { en: 'Entrance', native: 'مدخل', roman: 'madkhal' },
      { en: 'Guide', native: 'مرشد', roman: 'murshid' },
    ],
  },
  {
    id: 'felucca-boat',
    title: 'Felucca Boat',
    icon: '\u{26F5}',
    description: 'Charter a sail down the Nile at dusk to reach a meeting point the roads cannot.',
    vocab: [
      { en: 'Boat', native: 'مركب', roman: 'markib' },
      { en: 'River', native: 'نهر', roman: 'nahr' },
      { en: 'Sail', native: 'شراع', roman: 'shiraa' },
      { en: 'Slow down', native: 'بالراحة', roman: 'bel raha' },
      { en: 'The other shore', native: 'الضفة التانية', roman: 'el daffa el tanya' },
    ],
  },
  {
    id: 'desert-camp',
    title: 'Desert Camp',
    icon: '\u{1F3D5}\u{FE0F}',
    description: 'Share tea with Bedouin guides and trade rumors about ruins buried in the dunes.',
    vocab: [
      { en: 'Tent', native: 'خيمة', roman: 'kheima' },
      { en: 'Camel', native: 'جمل', roman: 'gamal' },
      { en: 'Water', native: 'مية', roman: 'mayya' },
      { en: 'Fire', native: 'نار', roman: 'naar' },
      { en: 'Which way?', native: 'انهي طريق؟', roman: 'anhi taree' },
    ],
  },
  {
    id: 'hieroglyph-reading',
    title: 'Hieroglyph Reading',
    icon: '\u{1F4DC}',
    description: 'Decode the carved symbols on a temple wall that point to a forgotten vault.',
    vocab: [
      { en: 'Symbol', native: 'رمز', roman: 'ramz' },
      { en: 'Wall', native: 'حيطة', roman: 'heeta' },
      { en: 'Meaning', native: 'معنى', roman: 'maana' },
      { en: 'Secret', native: 'سر', roman: 'serr' },
      { en: 'Read it for me', native: 'اقراهولي', roman: 'eraahooli' },
    ],
  },
  {
    id: 'cairo-cafe',
    title: 'Cairo Cafe',
    icon: '\u{2615}',
    description: 'Linger over mint tea in a downtown ahwa where an informant whispers the next clue.',
    vocab: [
      { en: 'Coffee', native: 'قهوة', roman: 'ahwa' },
      { en: 'Tea', native: 'شاي', roman: 'shaay' },
      { en: 'Sit down', native: 'اتفضل اقعد', roman: 'etfaddal oad' },
      { en: 'The bill', native: 'الحساب', roman: 'el hesaab' },
      { en: 'A quiet word', native: 'كلمة على جنب', roman: 'kelma ala genb' },
    ],
  },
  {
    id: 'archaeological-dig',
    title: 'Archaeological Dig',
    icon: '\u{26CF}\u{FE0F}',
    description: 'Join the excavation crew and quietly catalog artifacts before rivals can smuggle them out.',
    vocab: [
      { en: 'Dig', native: 'حفر', roman: 'hafr' },
      { en: 'Artifact', native: 'اثر', roman: 'asar' },
      { en: 'Be careful', native: 'خد بالك', roman: 'khod baalak' },
      { en: 'Gold', native: 'دهب', roman: 'dahab' },
      { en: 'We found something', native: 'لقينا حاجة', roman: 'laeena haga' },
    ],
  },
  {
    id: 'pharaohs-court',
    title: "Pharaoh's Court",
    icon: '\u{1F451}',
    description: 'Step into a restored throne hall where the final inscription names the keeper of the tomb.',
    vocab: [
      { en: 'King', native: 'ملك', roman: 'malik' },
      { en: 'Throne', native: 'عرش', roman: 'arsh' },
      { en: 'Power', native: 'سلطة', roman: 'solta' },
      { en: 'Treasure', native: 'كنز', roman: 'kanz' },
      { en: 'Where is it hidden?', native: 'مخبي فين؟', roman: 'mekhabbi feen' },
    ],
  },
]

export const EGYPT_REAL_LIFE = {
  id: 'egypt-real-life',
  title: 'Real Life Conversation',
  icon: '\u{1F451}',
  description: 'Drop the script and improvise a full conversation, weaving every clue together to claim the tomb.',
  special: true,
  vocab: [
    { en: 'Welcome', native: 'اهلا وسهلا', roman: 'ahlan wa sahlan' },
    { en: 'I understand', native: 'انا فاهم', roman: 'ana fahem' },
    { en: 'Can you help me?', native: 'ممكن تساعدني؟', roman: 'momken tesaaedni' },
    { en: 'Thank you very much', native: 'شكرا جزيلا', roman: 'shokran gazeelan' },
  ],
}

export const BRAZIL_SCENARIOS = [
  {
    id: 'street-carnival',
    title: 'Street Carnival',
    icon: '\u{1F483}',
    description: 'Slip through the dancing crowd and pass a coded message to your contact unnoticed.',
    vocab: [
      { en: 'Party / Carnival', native: 'Festa', roman: 'FES-tah' },
      { en: 'Let’s dance', native: 'Vamos dançar', roman: 'VAH-moos dahn-SAR' },
      { en: 'Costume', native: 'Fantasia', roman: 'fahn-tah-ZEE-ah' },
      { en: 'Drums', native: 'Tambores', roman: 'tahm-BOH-rees' },
      { en: 'Watch out', native: 'Cuidado', roman: 'kwee-DAH-doo' },
    ],
  },
  {
    id: 'favela-market',
    title: 'Favela Market',
    icon: '\u{1F6D2}',
    description: 'Blend in among the stalls while quietly tracking the cartel’s supply runner.',
    vocab: [
      { en: 'How much?', native: 'Quanto custa?', roman: 'KWAN-too KOOS-tah' },
      { en: 'Too expensive', native: 'Muito caro', roman: 'MOY-too KAH-roo' },
      { en: 'Cheap', native: 'Barato', roman: 'bah-RAH-too' },
      { en: 'I’ll take it', native: 'Vou levar', roman: 'voh leh-VAR' },
      { en: 'Change (money)', native: 'Troco', roman: 'TROH-koo' },
    ],
  },
  {
    id: 'bus-terminal',
    title: 'Bus Terminal',
    icon: '\u{1F68C}',
    description: 'Buy a ticket and shadow your target onto the right bus without raising suspicion.',
    vocab: [
      { en: 'Ticket', native: 'Passagem', roman: 'pah-SAH-zhayn' },
      { en: 'What time?', native: 'Que horas?', roman: 'keh OH-rahs' },
      { en: 'Platform', native: 'Plataforma', roman: 'plah-tah-FOR-mah' },
      { en: 'Where to?', native: 'Para onde?', roman: 'PAH-rah ON-jee' },
      { en: 'Next bus', native: 'Próximo ônibus', roman: 'PROH-see-moo OH-nee-boos' },
    ],
  },
  {
    id: 'beach-volleyball',
    title: 'Beach Volleyball',
    icon: '\u{1F3D0}',
    description: 'Join a casual match on Copacabana to earn the trust of a well-connected informant.',
    vocab: [
      { en: 'Ball', native: 'Bola', roman: 'BOH-lah' },
      { en: 'Your turn', native: 'Sua vez', roman: 'SOO-ah vays' },
      { en: 'Nice play', native: 'Boa jogada', roman: 'BOH-ah zho-GAH-dah' },
      { en: 'Let’s play', native: 'Vamos jogar', roman: 'VAH-moos zho-GAR' },
      { en: 'Team', native: 'Time', roman: 'TEE-mee' },
    ],
  },
  {
    id: 'capoeira-match',
    title: 'Capoeira Match',
    icon: '\u{1F94B}',
    description: 'Step into the roda and trade moves while listening for whispered intel in the circle.',
    vocab: [
      { en: 'Game / Match', native: 'Jogo', roman: 'ZHOH-goo' },
      { en: 'Be careful', native: 'Tenha cuidado', roman: 'TEH-nyah kwee-DAH-doo' },
      { en: 'Strong', native: 'Forte', roman: 'FOR-chee' },
      { en: 'Master', native: 'Mestre', roman: 'MES-tree' },
      { en: 'Circle (roda)', native: 'Roda', roman: 'HOH-dah' },
    ],
  },
  {
    id: 'soccer-stadium',
    title: 'Soccer Stadium',
    icon: '\u{26BD}',
    description: 'Lose yourself in the roaring crowd to make a clean handoff during the match.',
    vocab: [
      { en: 'Goal!', native: 'Gol!', roman: 'GOW' },
      { en: 'The team', native: 'O time', roman: 'oo TEE-mee' },
      { en: 'Referee', native: 'Juiz', roman: 'zhoo-EES' },
      { en: 'Who’s winning?', native: 'Quem está ganhando?', roman: 'kayn es-TAH gah-NYAHN-doo' },
      { en: 'Final score', native: 'Placar final', roman: 'plah-KAR fee-NOW' },
    ],
  },
  {
    id: 'business-district',
    title: 'Business District',
    icon: '\u{1F3E2}',
    description: 'Pose as a foreign investor to slip into a meeting with a corrupt executive.',
    vocab: [
      { en: 'Meeting', native: 'Reunião', roman: 'heh-oo-nee-OWN' },
      { en: 'Business card', native: 'Cartão de visita', roman: 'kar-TOWN jee vee-ZEE-tah' },
      { en: 'Deal / Agreement', native: 'Acordo', roman: 'ah-KOR-doo' },
      { en: 'Pleased to meet you', native: 'Prazer em conhecer', roman: 'prah-ZAYR ayn ko-nyeh-SAYR' },
      { en: 'Contract', native: 'Contrato', roman: 'kon-TRAH-too' },
    ],
  },
  {
    id: 'senate-speech',
    title: 'Senate Speech',
    icon: '\u{1F3DB}\u{FE0F}',
    description: 'Decode a senator’s public address for the cartel ties hidden between the lines.',
    vocab: [
      { en: 'Government', native: 'Governo', roman: 'go-VER-noo' },
      { en: 'Law', native: 'Lei', roman: 'lay' },
      { en: 'The people', native: 'O povo', roman: 'oo POH-voo' },
      { en: 'Corruption', native: 'Corrupção', roman: 'ko-hoop-SOWN' },
      { en: 'The truth', native: 'A verdade', roman: 'ah ver-DAH-jee' },
    ],
  },
]

export const BRAZIL_REAL_LIFE = {
  id: 'brazil-real-life',
  title: 'Real Life Conversation',
  icon: '\u{1F451}',
  description: 'No script, no cover story, just hold a free-flowing chat in Portuguese and put every skill to the test.',
  special: true,
  vocab: [
    { en: 'How are you?', native: 'Tudo bem?', roman: 'TOO-doo bayn' },
    { en: 'I’m from abroad', native: 'Sou de fora', roman: 'soh jee FOH-rah' },
    { en: 'Can you help me?', native: 'Pode me ajudar?', roman: 'POH-jee mee ah-zhoo-DAR' },
    { en: 'Thank you very much', native: 'Muito obrigado', roman: 'MOY-too oh-bree-GAH-doo' },
  ],
}

export const SCENARIOS_BY_COUNTRY = {
  China:  CHINA_SCENARIOS,
  Japan:  JAPAN_SCENARIOS,
  France: FRANCE_SCENARIOS,
  Mexico: MEXICO_SCENARIOS,
  Egypt:  EGYPT_SCENARIOS,
  Brazil: BRAZIL_SCENARIOS,
}

export const SPECIAL_SCENARIO_BY_COUNTRY = {
  China:  REAL_LIFE_SCENARIO,
  Japan:  JAPAN_REAL_LIFE,
  France: FRANCE_REAL_LIFE,
  Mexico: MEXICO_REAL_LIFE,
  Egypt:  EGYPT_REAL_LIFE,
  Brazil: BRAZIL_REAL_LIFE,
}

// DiceBear "micah" cartoon avatar per country (Playground avatar system).
const DICEBEAR = (seed, facialHair = 0) =>
  `https://api.dicebear.com/7.x/micah/svg?seed=${seed}&backgroundColor=transparent&facialHairProbability=${facialHair}`

export const AGENT_AVATARS = {
  China:  DICEBEAR('Jasmine'),
  Japan:  DICEBEAR('Kenji'),
  France: DICEBEAR('Chloe'),
  Mexico: DICEBEAR('Mateo', 100),
  Egypt:  DICEBEAR('Amira'),
  Brazil: DICEBEAR('Tiago', 100),
}

// Per-country accent palette [primary, secondary, tertiary] and field-op flavor text.
export const COUNTRY_THEMES = {
  China:  { accents: ['#C9A84C', '#8B0000', '#E8C547'], flavor: 'INFILTRATION: Shanghai Sector' },
  Japan:  { accents: ['#E0383B', '#F5F0E8', '#E0383B'], flavor: 'STEALTH OPERATION: Tokyo Sector' },
  France: { accents: ['#2A6BD6', '#F5F0E8', '#E0334B'], flavor: 'COVERT OPERATION: Paris Sector' },
  Mexico: { accents: ['#2BA45A', '#E0334B', '#E8C547'], flavor: 'UNDERCOVER MISSION: Mexico City Sector' },
  Egypt:  { accents: ['#D9B45A', '#22C7C0', '#E8C547'], flavor: 'ANCIENT SECRETS: Cairo Sector' },
  Brazil: { accents: ['#16A34A', '#F5D000', '#16A34A'], flavor: 'JUNGLE OPERATION: Rio Sector' },
}

export const UNLOCK_COST = 100
export const REWARD_TOKENS = 150

export function levelForCompleted(completed) {
  return 1 + Math.floor(completed / 2)
}
