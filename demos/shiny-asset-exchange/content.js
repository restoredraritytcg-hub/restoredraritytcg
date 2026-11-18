// Page copy from shinyassetexchange.com (Nov 2026), kept word for word.
export const CARE_GUIDE = 'https://drive.google.com/file/d/1HQhMAhzNln8iEf8QJR_akNt1qFYft5A8/view?usp=sharing';
export const NON_LIABILITY = 'https://drive.google.com/file/d/1DmJhsXqYwpbgt_VzDW_ntO2UB9uT491I/preview';
const MAIL = 'shinyassetexchange@gmail.com';
const mail = `<a href="mailto:${MAIL}">${MAIL}</a>`;

export const FAQ = [
  { group: 'What Can and Can\'t Be Fixed', intro: 'Read this before submitting. Not all damage can be improved.', items: [
    ['Will this remove damage completely?', 'We aim to get your card as close to fully restored as possible, but every card is different. What we guarantee is improvement, not perfection — the level of results depends on the extent of the damage and how it occurred originally.'],
    ['Can you fix whitening?', 'Whitening happens when pigment is lost from the card surface, most commonly along the edges. While we understand how frustrating this can be, the processes used to address whitening carry a high risk of further damaging the card and compromising both its structural integrity and original artwork. Out of respect for your card and its value, this is not a service we offer.'],
    ['Can you fix scratches?', 'It depends where they are. Scratches on the holographic area can usually be reduced significantly, and sometimes eliminated entirely, as long as they haven\'t gone completely white. Deep scratches through the text area are riskier because attempting them often means removing paint along with the scratch, so we don\'t recommend it. Scratches and scuffs on the back of the card may improve, but more often than not they\'re permanent.'],
    ['Can creases be removed?', 'Creases on the front of a card can typically be improved by about 90%, leaving what we\'d describe as a scar rather than a crease. Creases caused by water damage, or creases on the back of the card, sometimes come out completely.'],
    ['Can indents be removed?', 'Often yes, but not always. If the indent is shallow we can usually work it out. If it\'s deep enough that the card\'s fibers have been broken, the damage is structural and there\'s nothing to lift. It\'s genuinely case by case.'],
    ['Can you make print lines go away?', 'Usually not. Print lines are a manufacturing characteristic rather than surface damage, which means there\'s nothing sitting on top of the card to remove. We\'re able to improve them maybe five to ten percent of the time.'],
    ['Can you correct paint or material loss?', 'No. Once material is physically gone from the card, there\'s no way to put it back.'],
    ['Can you remove a recolor or fix a recolored card?', 'It depends on the card. Recoloring processes typically use inks that bleed into the card\'s fibers, making them difficult or impossible to fully remove. If you\'d like us to try, send your card in and we\'ll do our best — just know that results are not guaranteed and the service fee applies regardless of outcome.'],
    ['Not sure what you\'re dealing with?', 'We recommend a Card Review before submitting for full restoration. For $5 per card we\'ll assess it and tell you honestly what\'s possible. Nothing is ever guaranteed, but we\'ll always give you a straight answer before you commit.'],
  ] },
  { group: 'Process & Ordering', items: [
    ['How long will the process take?', 'Once we receive your cards, restoration typically takes 7 business days. All new orders enter the queue on Mondays, so your timeline depends on when your cards arrive. Cards received by Sunday are included in that week\'s queue and ship back the following Monday. Cards received after Sunday move to the next week\'s queue. Please account for shipping time to us when planning your timeline.'],
    ['Will you ship my card to grade for me?', 'Yes — we offer direct shipping to the grading company of your choice for $20 per submission. You\'ll need to complete the grading company\'s paperwork yourself and include it with your cards when you send them to us. If you have multiple cards in the same order all going to the same grading company, they ship together as one bundle under a single $20 submission fee.'],
    ['Do you do bulk pricing?', 'Every card receives the same level of individual attention and care regardless of how many you send in, so our pricing remains consistent across all orders. Restoration is a hands-on process — each card gets the time it deserves.'],
  ] },
  { group: 'Products & Learning', items: [
    ['Will you teach me how to fix cards?', 'Card restoration is a proprietary process and the details of our technique aren\'t something we\'re able to share. That said, we genuinely want to support the collector community — we recommend checking out the Discord groups Card Care Academy and The Cardboard Alchemist for card care tips and community knowledge. You can also follow our YouTube channel where we post weekly videos of card care in action.'],
    ['Do you have instructions for using the card care kit and refills?', `Yes — every product comes with our Card Care Guide, which walks you through step-by-step instructions for each item in the kit. You can <a href="${CARE_GUIDE}" target="_blank" rel="noopener">download it here</a>, and it's also linked on every product page so you can pull it up anytime. We're building out a library of how-to videos on our YouTube channel too, so check back there for new tutorials and other card care content.`],
  ] },
];
export const FAQ_INTRO = `Answers to the questions we get most. If you don't find what you're looking for here, email us at ${mail} and we'll get back to you.`;
export const FAQ_OUTRO = `<h3>Still have a question?</h3><p>Email us at ${mail} and we'll get back to you as soon as we can.</p>`;

const amz = id => `https://www.amazon.com/dp/${id}`;
export const TOOLS = {
  intro: ['These are the tools we actually use in the studio. We get asked about our setup constantly, so here it is — everything organized by what it\'s for.',
    'A quick note on the two methods below. The heat press method uses controlled heat and pressure to flatten warps and reduce creases. The hydro pump method uses moisture and slow, sustained pressure instead. Different problems call for different approaches, and some of the gear overlaps.'],
  groups: [
    { name: 'Heat Press Method', sub: 'For flattening warps and reducing creases with controlled heat and pressure.', items: [
      ['Topdeep Pro Heat Press 15x12', amz('B0CSDCRPCN'), 'The press itself. The 15x12 plate size gives you room to work and, more importantly, delivers even heat across the whole surface. Uneven heat is what ruins cards, so plate quality matters more than any other feature here.'],
      ['EVA Foam — Heat Press', 'https://a.co/d/0iRFB1bl', 'Sits between the press plate and your card. The foam distributes pressure evenly instead of concentrating it on high points, which is what prevents new indents while you\'re trying to remove old ones.'],
      ['Aluminum Sheets', 'https://a.co/d/02b7pcaS', 'Aluminum conducts heat evenly and holds temperature steady through the press cycle. It also gives you a perfectly flat rigid surface, which is the whole point of pressing in the first place.'],
      ['Katbite Unbleached Parchment, 400 Pcs', amz('B0BC1QRV6K'), 'Your barrier layer. Parchment keeps the card from touching hot metal directly and stops anything from sticking to the surface. Unbleached is the right call — you don\'t want bleaching agents anywhere near a card under heat. Buy the big pack, you go through these fast.'],
    ] },
    { name: 'Hydro Pump Method', sub: 'For working with moisture and slow, sustained pressure rather than heat.', items: [
      ['VEVOR Book Press 12x8.6', amz('B0C6TH591C'), 'Holds your stacked hydro pumps under steady, even pressure over time. A screw press lets you dial in exactly how much force you want and walk away — that slow sustained pressure is what makes this method work.'],
      ['AMZQNART EVA Foam 5mm, 2 Pcs', amz('B0C9N3F5YD'), 'The 5mm thickness gives you enough cushion to distribute pressure across the card without letting it shift under load. Same principle as the heat press foam, different thickness for a different job.'],
      ['Zzbakress Clear Acrylic Rounds, 30 Pcs', amz('B0D2K53H4F'), 'Rigid flat discs that go into the stack. Clear acrylic means you can see what\'s happening in there without breaking down the whole setup, and it stays flat under sustained pressure where thinner material would bow.'],
      ['Katbite Parchment Rounds, 6 Inch, 200 Pcs', amz('B07L9X9XXX'), 'Pre-cut rounds sized to match the acrylic discs. Keeps moisture where you want it and prevents anything from sticking to the card as it sits. Having these pre-cut saves a genuinely annoying amount of time.'],
    ] },
    { name: 'Inspection & Setup', sub: 'Useful no matter which method you\'re working with.', items: [
      ['Green LED Work Light, 7W Dimmable', amz('B0B7NV5KLZ'), 'This one\'s the sleeper pick. Green light at a low angle makes dust, debris, and fine surface scratches jump out in a way white light never will. If you\'ve ever cleaned a card, sleeved it, and then spotted a speck you missed, this solves that. The dimmable part matters too — you want to be able to dial it down and change the angle.'],
    ] },
  ],
  warning: ['Every one of these methods carries risk. Heat, moisture, and pressure can all permanently damage a card if you get the variables wrong, and there\'s no undo button.',
    'Practice on cards you don\'t care about. A lot of them. Then practice some more before you go near anything valuable.'],
};

export const RECS = {
  intro: 'We get asked what we use. This is the short list of things worth your money.',
  affiliate: 'Some links on this page are affiliate links, which means we may earn a commission if you buy through them. It costs you nothing extra, and we only list gear we actually use.',
  pick: { name: 'True Clarity Box', sub: 'Card inspection lighting box', url: 'https://www.trueclaritybox.com/?ref=SHINYASSETEXCHANGE', code: 'SHINYASSET10',
    body: ['If you buy or sell cards, this is the single most useful thing you can put on your desk. Poor lighting hides surface flaws, scratches, whitening, and print lines, and that costs people money on both sides of a sale. The True Clarity Box gives you a controlled, consistent lighting environment so you can actually see what you\'re looking at instead of guessing under whatever light happens to be in the room.',
      'It doubles as a photo booth, so your listing photos show the card honestly rather than flattering it. Fewer disputes, fewer returns, fewer people overpaying or underpricing.',
      'Built by collectors who got tired of show lighting hiding problems. That\'s the same reason we care about it.'] },
  why: ['Most of the cards people send us could have been assessed correctly before money changed hands. Whitening, print lines, and surface material loss are all things we can\'t fix, and all things that are easy to miss under bad lighting or in a seller\'s photos.',
    'Seeing a card clearly before you commit saves more money than any tool we could recommend.'],
};

export const PRIVACY = [
  'As described in our Privacy Policy, we collect personal information from your interactions with us and our website, including through cookies and similar technologies. We may also share this personal information with third parties, including advertising partners. We do this in order to show you ads on other websites that are more relevant to your interests and for other reasons outlined in our privacy policy.',
  'Sharing of personal information for targeted advertising based on your interaction on different websites may be considered "sales", "sharing", or "targeted advertising" under certain U.S. state privacy laws. Depending on where you live, you may have the right to opt out of these activities. If you would like to exercise this opt-out right, please follow the instructions below.',
  'If you visit our website with the Global Privacy Control opt-out preference signal enabled, depending on where you are, we will treat this as a request to opt-out of activity that may be considered a “sale” or “sharing” of personal information or other uses that may be considered targeted advertising for the device and browser you used to visit our website.',
];

// The "Free Card Review" quiz: same questions, rules and wording as their Restoration Assessment page.
// Fees come from the saved prices so the quiz stays in step with the Pricing page.
export const ASSESS = {
  RESTORABLE: ['crease', 'indent', 'warp', 'scratch', 'ink'],
  BLOCKING: ['white', 'print', 'loss'],
  VAL: {
    v1: { mid: 250, value: 250, label: '$1 to $499', over1k: false },
    v2: { mid: 750, value: 750, label: '$500 to $999', over1k: false },
    v3: { mid: 1500, value: 1500, label: '$1,000 to $2,000', over1k: true },
    v4: { mid: 3500, value: 3500, label: 'over $2,000', over1k: true },
  },
  UP: { same: [0, 0], u1: [10, 25], u2: [25, 50], u3: [50, 100], u4: [100, 900], unsure: null },
  Q: [
    { k: 'val', q: "Roughly what's the card worth right now, as is?", sub: "Look it up on TCGplayer if you're not sure.", a: [['Under $500', 'v1'], ['$500 to $999', 'v2'], ['$1,000 to $2,000', 'v3'], ['Over $2,000', 'v4']] },
    { k: 'dmg', q: "What's wrong with the card?", sub: 'Select everything that applies.', multi: true, a: [
      ['Crease, bend or fold', 'crease'], ['Indent or pressure mark', 'indent'], ['Warping', 'warp'], ['Scratches on the surface', 'scratch'],
      ['Ink, sharpie, sticker or adhesive', 'ink'], ['Dirt, grime or fingerprints', 'dirt'], ['Whitening on edges or corners', 'white'],
      ['Print lines from the factory', 'print'], ['Surface material actually missing', 'loss'], ['Someone recolored it previously', 'recolor']] },
    { k: 'wsev', q: 'How much whitening does it have?', only: a => (a.dmg || []).includes('white'), a: [
      ['Light. You have to look for it', 'light'], ['Moderate. Noticeable on the edges', 'mod'], ['Heavy. Significant white showing', 'heavy'], ['Not sure', 'unsure']] },
    { k: 'goal', q: 'What are you hoping to get out of this?', a: [
      ["Sell it for more than it's worth now", 'profit'], ['Trade it or make it easier to move', 'trade'], ['Submit it for grading', 'grade'],
      ['Keep this exact copy and have it look better', 'cosmetic'], ['Not sure yet', 'unsure']] },
    { k: 'uplift', q: "What do you think it'd be worth restored?", sub: "Your best guess is fine. We're checking whether the numbers work.",
      only: a => ['profit', 'trade', 'grade'].includes(a.goal), a: [
      ['About the same', 'same'], ['Maybe 10 to 25% more', 'u1'], ['Around 25 to 50% more', 'u2'], ['50 to 100% more', 'u3'], ['More than double', 'u4'], ['No idea', 'unsure']] },
    { k: 'repl', q: 'How hard would it be to just buy a cleaner copy instead?', only: a => a.goal === 'profit', a: [
      ["Easy. They're readily available", 'easy'], ['Possible but expensive or slow', 'hard'], ['Very hard. This card is scarce', 'scarce']] },
    { k: 'exp', q: 'What would make this worth it to you?', a: [
      ["Noticeable improvement. I know it won't be perfect", 'accept'], ['It needs to be fully resolved', 'perfect'], ['It needs to hit a specific grade', 'gradereq'],
      ['It needs to make me a specific amount of money', 'money'], ['I want to know the odds before I commit', 'odds']] },
  ],
};

export function assessResult(A, prices) {
  const { RESTORABLE, BLOCKING, VAL, UP } = ASSESS;
  const has = (arr, v) => (arr || []).includes(v);
  const d = A.dmg || [], v = VAL[A.val];
  const tier = prices.tiers.find(t => v.value >= t.min && (t.max == null || v.value <= t.max)) || prices.tiers[0];
  const pct = !!tier.pct, fee = pct ? Math.round(v.mid * tier.pct / 100) : tier.price;
  const review = (prices.addons.find(a => a.key === 'review') || { price: 5 }).price;
  const notes = []; let verdict, cleaningOnly = false;
  const restorable = RESTORABLE.filter(x => has(d, x)), blocking = BLOCKING.filter(x => has(d, x));
  const cosmeticGoal = A.goal === 'cosmetic', profitOnly = A.goal === 'profit';

  if (!restorable.length && has(d, 'dirt') && !blocking.length && !has(d, 'recolor')) cleaningOnly = true;
  else if (!restorable.length) {
    verdict = 'no';
    if (has(d, 'white') && blocking.length === 1) notes.push('Whitening is pigment loss, not surface damage. There is nothing sitting on the card for us to remove, so restoration has nothing to work with.');
    else if (has(d, 'loss')) notes.push('Once surface material is physically gone, there is no way to put it back. Restoration works with what is still on the card.');
    else if (has(d, 'print')) notes.push('Print lines come from the manufacturing process rather than from anything that happened to the card. We improve them maybe five to ten percent of the time.');
    else notes.push('Nothing you selected is a defect our restoration process can meaningfully improve.');
  }
  if (!verdict && !cleaningOnly) {
    verdict = 'yes';
    if (A.exp === 'perfect') { verdict = 'diag'; notes.push('You mentioned it needs to be fully resolved. We guarantee improvement, not perfection, so we would rather look at photos and set a realistic expectation before you commit.'); }
    else if (A.exp === 'gradereq') { verdict = 'diag'; notes.push('We cannot promise a specific grade. That call belongs to the grading company, not us. A card review will tell you what condition improvement is realistic so you can decide.'); }
    else if (A.exp === 'money') { verdict = 'diag'; notes.push('We cannot promise a specific dollar return. A card review will give you a realistic read on the condition improvement so you can run your own numbers.'); }
    else if (A.exp === 'odds') { verdict = 'diag'; notes.push('We do not quote success odds. A card review is the closest thing to that, and it will tell you what we actually expect for your card.'); }
    if (verdict === 'yes') {
      let flags = 0;
      if (restorable.length >= 3) flags++; if (has(d, 'recolor')) flags++; if (A.uplift === 'unsure') flags++; if (A.goal === 'unsure') flags++;
      if (flags >= 2) { verdict = 'diag'; notes.push('There is enough going on here that the outcome is hard to predict from a description alone. A card review will narrow it down before you spend the full restoration fee.'); }
    }
    if (['profit', 'trade', 'grade'].includes(A.goal) && A.uplift && A.uplift !== 'unsure') {
      const band = UP[A.uplift], feePct = pct ? tier.pct : (fee / v.mid * 100);
      if (band) {
        if (band[1] < feePct) {
          if (A.repl === 'scarce') notes.push('The numbers are tight, but a scarce card is worth keeping in the best condition you can get it. That can justify restoration on its own.');
          else if (profitOnly && A.repl === 'easy') { verdict = 'no'; notes.push('The restoration cost outruns the likely value gain on a card worth ' + v.label + '. Since a cleaner copy is easy to find and you are focused on profit, buying a replacement is the better move.'); }
          else if (verdict !== 'no') { verdict = 'diag'; notes.push('The economics look thin based on what you have entered. A card review would tell you whether the condition bump is bigger than you are expecting.'); }
        } else if (band[0] < feePct) {
          if (verdict === 'yes') { verdict = 'diag'; notes.push('This one sits right around break-even on the numbers you gave us. A card review would tell you which side of the line it actually falls on.'); }
        } else notes.push('Based on the values you entered, the likely condition improvement should more than cover the restoration cost, and a cleaner card is usually easier to sell or trade.');
      }
    }
    if (has(d, 'white') && A.wsev === 'heavy') {
      if (profitOnly && verdict !== 'no') { verdict = 'no'; notes.push('Heavy whitening will keep this card in damaged territory no matter what else we fix. For a profit-focused goal, the remaining whitening caps the value gain too hard to justify the cost.'); }
      else if (cosmeticGoal) notes.push('Heavy whitening will still be there when you get the card back. We can improve everything else, but that edge wear is permanent.');
      else notes.push('Keep in mind the whitening stays. We can only improve the other issues.');
    } else if (has(d, 'white') && verdict !== 'no') notes.push('Whitening cannot be removed, so that will remain. Everything else you listed is workable.');
    if (cosmeticGoal && verdict === 'no') { verdict = 'yes'; notes.push('Since your goal is improving this specific copy rather than making money on it, breaking even is not the point. If you want this card to look better and you understand what will not change, restoration still makes sense.'); }
    if (has(d, 'print') && verdict !== 'no') notes.push('The print lines will most likely stay. Those are a manufacturing characteristic and we only improve them occasionally.');
    if (has(d, 'loss') && verdict !== 'no') notes.push('Any area where material is actually missing will not improve. Restoration works with what is physically still there.');
    if (has(d, 'recolor') && verdict !== 'no') notes.push('Previous recoloring bleeds into the card fibers and is difficult to fully remove. We will try, but results are not guaranteed and the fee applies either way.');
  }
  let head, sub, col, cta = true, price = '', service = 'restoration';
  if (cleaningOnly) {
    head = 'Cleaning Is All You Need'; col = 'ok'; service = 'cleaning';
    sub = 'Nothing you described needs restoration. Dirt, grime and fingerprints come off with a straightforward clean, and that is our most reliable service.';
    price = `Cleaning is $${prices.cleaning} per card, flat, regardless of what the card is worth.`;
  } else if (verdict === 'yes') {
    head = 'Restoration Recommended'; col = 'ok';
    sub = 'Restoration looks worthwhile based on the goals and condition you described. We cannot guarantee a specific grade, value increase, or full resolution, but there is a real reason to proceed here.';
    price = pct ? `Restoration on cards over $2,000 is ${tier.pct}% of the card’s current value, plus shipping.` : `Restoration at your card’s value is $${fee}, plus shipping.`;
  } else if (verdict === 'diag') {
    head = 'Start With a Card Review'; col = 'warn';
    sub = `This card may well be worth restoring, but the outcome is uncertain enough that we recommend a $${review} card review first. We will assess your photos and tell you honestly what’s possible before you commit to the full fee. A review is recommended, not required.`;
    price = pct ? `Card review is $${review}. Full restoration on cards over $2,000 is ${tier.pct}% of the card’s current value.` : `Card review is $${review}. Full restoration at your card’s value would be $${fee}.`;
  } else {
    head = 'We Would Not Recommend It'; col = 'bad'; cta = false;
    sub = 'Based on what you have told us, we would not recommend full restoration for this card. Either the likely improvement does not justify the cost for your goal, or the main issue is not something our process can resolve.';
  }
  return { head, sub, col, cta, price, notes, over1k: v.over1k, verdict: cleaningOnly ? 'clean' : verdict, service, value: v.value };
}
