// Pass-1 classifier: keyword match against product title (lowercase).
// First category whose keywords hit wins. No hit -> 'other'.
//
// Order matters: more specific categories first (baby before health, etc.)
// so a "baby thermometer" lands in baby, not health.

const RULES = [
  ['baby',        ['diaper', 'pampers', 'formula milk', 'stroller', 'bib', 'baby ', 'infant', 'toddler', 'pacifier', 'baby food', 'baby wipe', 'babies', 'kid ', 'kids ', 'nursing', 'breast pump']],
  ['electronics', ['headphone', 'earbud', 'earphone', 'airpod', 'speaker', 'soundbar', 'laptop', 'macbook', 'monitor', 'charger', 'cable', 'usb', 'usb-c', 'mouse', 'keyboard', 'smartwatch', ' watch ', 'tv ', 'television', 'ssd', 'hdd', 'nvme', 'gpu', 'graphics card', 'ram ', 'router', 'modem', 'drone', 'camera', 'iphone', 'samsung galaxy', 'xiaomi', 'redmi', 'oppo', 'realme', 'tablet', 'ipad', 'kindle', 'projector', 'powerbank', 'power bank', 'console', 'playstation', 'ps5', 'xbox', 'nintendo', 'gaming', 'mic ', 'microphone', 'webcam', 'fan ', 'lcd', 'led ', 'oled', 'hdmi', 'wifi', 'bluetooth', 'wireless']],
  ['beauty',      ['shampoo', 'conditioner', 'perfume', 'cologne', 'makeup', 'lipstick', 'mascara', 'foundation', 'eyeliner', 'lotion', 'serum', 'cream', 'moistur', 'deodorant', 'body wash', 'face wash', 'cleanser', 'sunscreen', 'spf', 'eau de', 'fragrance', 'hair color', 'hair dye', 'nail polish', 'face mask', 'beauty', 'skincare', 'cosmetic', 'concealer', 'blush', 'eye shadow']],
  ['fashion',     ['shirt', 't-shirt', 'tshirt', 'dress', 'jacket', 'coat', 'jeans', 'pants', 'trouser', 'short', 'sneaker', 'shoe', 'boot', 'sandal', 'slipper', 'flip flop', 'handbag', 'wallet', 'belt', 'hat', 'cap ', 'sunglass', 'scarf', 'glove', 'sock', 'underwear', 'bra ', 'lingerie', 'pajama', 'hoodie', 'sweater', 'blouse', 'skirt', 'abaya', 'hijab', 'jewellery', 'jewelry', 'ring ', 'necklace', 'earring', 'bracelet']],
  ['food',        ['tea', 'coffee', 'snack', 'chocolate', 'candy', 'sweet', 'cookie', 'biscuit', 'cracker', 'chip', 'oil ', 'olive oil', 'rice', 'pasta', 'noodle', 'sauce', 'ketchup', 'mayonnaise', 'jam ', 'honey', 'cereal', 'oat', 'flour', 'sugar', 'salt', 'spice', 'nuts', 'almond', 'cashew', 'peanut', 'protein bar', 'energy bar', 'juice', 'soda', 'water bottle', 'mineral water', 'cooking', 'beverage']],
  ['health',      ['vitamin', 'supplement', 'protein powder', 'whey', 'collagen', 'omega', 'multivitamin', 'thermometer', 'mask ', 'bandage', 'first aid', 'medical', 'blood pressure', 'glucometer', 'pulse oximeter', 'inhaler', 'syringe', 'pill', 'tablet ', 'capsule', 'painkiller', 'paracetamol', 'ibuprofen']],
  ['sports',      ['yoga', 'dumbbell', 'barbell', 'kettlebell', 'bicycle', 'bike ', 'treadmill', 'elliptical', 'rowing', 'football', 'soccer', 'basketball', 'tennis', 'racket', 'gym ', 'fitness', 'workout', 'resistance band', 'jump rope', 'protein shaker', 'running', 'sportswear', 'tracksuit', 'cricket', 'boxing', 'helmet']],
  ['home',        ['vacuum', 'kettle', 'blender', 'mixer', 'microwave', 'oven', 'toaster', 'air fryer', 'fryer', 'fan', 'air conditioner', ' ac ', 'heater', 'iron', 'washing machine', 'dryer', 'fridge', 'refrigerator', 'mattress', 'sheet ', 'pillow', 'blanket', 'duvet', 'sofa', 'chair', 'desk', 'lamp', 'light ', 'bulb', 'cookware', 'pan ', 'pot ', 'plate', 'cup', 'bowl', 'cutlery', 'knife', 'fork', 'spoon', 'storage', 'organizer', 'curtain', 'rug ', 'carpet', 'broom', 'mop ', 'detergent', 'cleaner', 'dish soap', 'laundry', 'tissue', 'toilet paper', 'kitchen', 'cookie cutter', 'food container', 'thermos', 'flask']],
]

export function classify(title) {
  if (!title) return 'other'
  // pad with spaces so word-boundary tokens like ' watch ' still match start/end
  const t = ` ${title.toLowerCase()} `
  for (const [cat, kws] of RULES) {
    for (const kw of kws) {
      if (t.includes(kw)) return cat
    }
  }
  return 'other'
}
