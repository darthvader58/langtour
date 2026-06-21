const fs = require('fs');
const code = fs.readFileSync('gameData.js', 'utf8');

// I need to manually map the empty strings back to the correct icon names.
const mapping = [
  // Characters
  { search: /type: 'Spy',\s*icon: '',/, replace: "type: 'Spy',\n    icon: 'VenetianMask'," },
  { search: /type: 'Bollywood Actor',\s*icon: '',/, replace: "type: 'Bollywood Actor',\n    icon: 'Clapperboard'," },
  { search: /type: 'Art Thief',\s*icon: '',/, replace: "type: 'Art Thief',\n    icon: 'Image'," },
  { search: /type: 'Treasure Hunter',\s*icon: '',/, replace: "type: 'Treasure Hunter',\n    icon: 'Map'," },
  { search: /type: 'Archaeologist',\s*icon: '',/, replace: "type: 'Archaeologist',\n    icon: 'Amphora'," },
  { search: /type: 'Undercover Journalist',\s*icon: '',/, replace: "type: 'Undercover Journalist',\n    icon: 'Mic'," },

  // China Scenarios
  { search: /id: 'street-market',\s*title: 'Street Market',\s*icon: '',/, replace: "id: 'street-market',\n    title: 'Street Market',\n    icon: 'Store'," },
  { search: /id: 'restaurant',\s*title: 'Restaurant',\s*icon: '',/, replace: "id: 'restaurant',\n    title: 'Restaurant',\n    icon: 'Utensils'," },
  { search: /id: 'train-station',\s*title: 'Train Station',\s*icon: '',/, replace: "id: 'train-station',\n    title: 'Train Station',\n    icon: 'TrainFront'," },
  { search: /id: 'taxi-ride',\s*title: 'Taxi Ride',\s*icon: '',/, replace: "id: 'taxi-ride',\n    title: 'Taxi Ride',\n    icon: 'CarTaxiFront'," },
  { search: /id: 'hotel-checkin',\s*title: 'Hotel Check-in',\s*icon: '',/, replace: "id: 'hotel-checkin',\n    title: 'Hotel Check-in',\n    icon: 'BellRing'," },
  { search: /id: 'newspaper-reading',\s*title: 'Newspaper Reading',\s*icon: '',/, replace: "id: 'newspaper-reading',\n    title: 'Newspaper Reading',\n    icon: 'Newspaper'," },
  { search: /id: 'business-meeting',\s*title: 'Business Meeting',\s*icon: '',/, replace: "id: 'business-meeting',\n    title: 'Business Meeting',\n    icon: 'Briefcase'," },
  { search: /id: 'politician-speech',\s*title: 'Politician Speech',\s*icon: '',/, replace: "id: 'politician-speech',\n    title: 'Politician Speech',\n    icon: 'Mic'," },

  // Real Life
  { search: /id: 'real-life-conversation',\s*title: 'Real Life Conversation',\s*icon: '',/, replace: "id: 'real-life-conversation',\n  title: 'Real Life Conversation',\n  icon: 'Crown'," },

  // India
  { search: /id: 'chai-stall',\s*title: 'Chai Stall',\s*icon: '',/, replace: "id: 'chai-stall',\n    title: 'Chai Stall',\n    icon: 'Coffee'," },
  { search: /id: 'rickshaw-ride',\s*title: 'Rickshaw Ride',\s*icon: '',/, replace: "id: 'rickshaw-ride',\n    title: 'Rickshaw Ride',\n    icon: 'CarTaxiFront'," },
  { search: /id: 'bollywood-set',\s*title: 'Bollywood Set',\s*icon: '',/, replace: "id: 'bollywood-set',\n    title: 'Bollywood Set',\n    icon: 'Clapperboard'," },
  { search: /id: 'spice-market',\s*title: 'Spice Market',\s*icon: '',/, replace: "id: 'spice-market',\n    title: 'Spice Market',\n    icon: 'Flame'," },
  { search: /id: 'yoga-ashram',\s*title: 'Yoga Ashram',\s*icon: '',/, replace: "id: 'yoga-ashram',\n    title: 'Yoga Ashram',\n    icon: 'Sun'," },
  { search: /id: 'indian-railway',\s*title: 'Indian Railway',\s*icon: '',/, replace: "id: 'indian-railway',\n    title: 'Indian Railway',\n    icon: 'TrainFront'," },
  { search: /id: 'tech-hub',\s*title: 'Tech Hub',\s*icon: '',/, replace: "id: 'tech-hub',\n    title: 'Tech Hub',\n    icon: 'Laptop'," },
  { search: /id: 'wedding-party',\s*title: 'Wedding Party',\s*icon: '',/, replace: "id: 'wedding-party',\n    title: 'Wedding Party',\n    icon: 'PartyPopper'," },

  // France
  { search: /id: 'cafe-terrace',\s*title: 'Café Terrace',\s*icon: '',/, replace: "id: 'cafe-terrace',\n    title: 'Café Terrace',\n    icon: 'Croissant'," },
  { search: /id: 'louvre-museum',\s*title: 'Louvre Museum',\s*icon: '',/, replace: "id: 'louvre-museum',\n    title: 'Louvre Museum',\n    icon: 'Image'," },
  { search: /id: 'metro-station',\s*title: 'Metro Station',\s*icon: '',/, replace: "id: 'metro-station',\n    title: 'Metro Station',\n    icon: 'TrainFront'," },
  { search: /id: 'bakery',\s*title: 'Bakery',\s*icon: '',/, replace: "id: 'bakery',\n    title: 'Bakery',\n    icon: 'Store'," },
  { search: /id: 'fashion-boutique',\s*title: 'Fashion Boutique',\s*icon: '',/, replace: "id: 'fashion-boutique',\n    title: 'Fashion Boutique',\n    icon: 'Shirt'," },
  { search: /id: 'vineyard',\s*title: 'Vineyard Tour',\s*icon: '',/, replace: "id: 'vineyard',\n    title: 'Vineyard Tour',\n    icon: 'Wine'," },
  { search: /id: 'eiffel-tower',\s*title: 'Eiffel Tower',\s*icon: '',/, replace: "id: 'eiffel-tower',\n    title: 'Eiffel Tower',\n    icon: 'Landmark'," },
  { search: /id: 'cheese-shop',\s*title: 'Cheese Shop',\s*icon: '',/, replace: "id: 'cheese-shop',\n    title: 'Cheese Shop',\n    icon: 'ShoppingCart'," },

  // Mexico
  { search: /id: 'taco-stand',\s*title: 'Taco Stand',\s*icon: '',/, replace: "id: 'taco-stand',\n    title: 'Taco Stand',\n    icon: 'Utensils'," },
  { search: /id: 'local-mercado',\s*title: 'Local Mercado',\s*icon: '',/, replace: "id: 'local-mercado',\n    title: 'Local Mercado',\n    icon: 'ShoppingBag'," },
  { search: /id: 'beach-resort',\s*title: 'Beach Resort',\s*icon: '',/, replace: "id: 'beach-resort',\n    title: 'Beach Resort',\n    icon: 'Umbrella'," },
  { search: /id: 'mariachi-plaza',\s*title: 'Mariachi Plaza',\s*icon: '',/, replace: "id: 'mariachi-plaza',\n    title: 'Mariachi Plaza',\n    icon: 'Guitar'," },
  { search: /id: 'cenote-swim',\s*title: 'Cenote Swim',\s*icon: '',/, replace: "id: 'cenote-swim',\n    title: 'Cenote Swim',\n    icon: 'Waves'," },
  { search: /id: 'ruins-tour',\s*title: 'Maya Ruins Tour',\s*icon: '',/, replace: "id: 'ruins-tour',\n    title: 'Maya Ruins Tour',\n    icon: 'Landmark'," },
  { search: /id: 'lucha-libre',\s*title: 'Lucha Libre',\s*icon: '',/, replace: "id: 'lucha-libre',\n    title: 'Lucha Libre',\n    icon: 'Swords'," },
  { search: /id: 'cantina',\s*title: 'Local Cantina',\s*icon: '',/, replace: "id: 'cantina',\n    title: 'Local Cantina',\n    icon: 'Beer'," },
];

let newCode = code;
mapping.forEach(m => {
  newCode = newCode.replace(m.search, m.replace);
});

fs.writeFileSync('gameData.js', newCode);
console.log('Fixed gameData.js icons');
