import './busfahrer.css'

type CardColor = 'red' | 'blue'
type SuitId = 'heart' | 'diamond' | 'star' | 'moon'
type Card = { id: string; value: number; label: string; color: CardColor; suit: SuitId; suitLabel: string; symbol: string; numericValue: number }
type FeedbackKind = 'success' | 'error' | 'info'

const suits: Array<Pick<Card, 'suit' | 'suitLabel' | 'symbol' | 'color'>> = [
  { suit: 'heart', suitLabel: 'Herz', symbol: '♥', color: 'red' },
  { suit: 'diamond', suitLabel: 'Karo', symbol: '◆', color: 'red' },
  { suit: 'star', suitLabel: 'Stern', symbol: '★', color: 'blue' },
  { suit: 'moon', suitLabel: 'Mond', symbol: '●', color: 'blue' },
]
const values = [
  { value: 7, label: '7' }, { value: 8, label: '8' }, { value: 9, label: '9' },
  { value: 10, label: '10' }, { value: 11, label: 'B' }, { value: 12, label: 'D' },
  { value: 13, label: 'K' }, { value: 14, label: 'A' },
]
const questions = [
  { title: 'Rot oder Blau?', options: [['Rot', 'red'], ['Blau', 'blue']] },
  { title: 'Höher, gleich oder tiefer?', options: [['Höher', 'higher'], ['Gleich', 'equal'], ['Tiefer', 'lower']] },
  { title: 'Innen oder außen?', options: [['Innen', 'inside'], ['Außen', 'outside']] },
  { title: 'Welche Kartenfarbe?', options: [['♥', 'heart'], ['◆', 'diamond'], ['★', 'star'], ['●', 'moon']] },
]
const choiceNames: Record<string, string> = { heart: 'Herz', diamond: 'Karo', star: 'Stern', moon: 'Mond' }
const pyramidOrder = [6, 7, 8, 9, 3, 4, 5, 1, 2, 0]
const busRoundLength = 5

let deck: Card[] = []
let phase: 'questions' | 'pyramid' | 'bus' = 'questions'
let questionIndex = 0
let hand: Card[] = []
let questionResults: boolean[] = []
let answered = false
let feedback = { text: '', kind: 'info' as FeedbackKind }
let pyramidCards: Card[] = []
let pyramidProgress = 0
let pyramidHits = new Set<number>()
let busCards: Card[] = []
let busProgress = 0
let busFailed = false
let busLost = false
let busFeedbackPending = false
let busfahrerUsedCards: Card[] = []
let gameRoot: HTMLElement | null = null
let advanceTimer: number | undefined

function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target]!, result[index]!]
  }
  return result
}

function createDeck(): Card[] {
  return shuffle(suits.flatMap((suit) => values.map((item) => ({
    id: `${suit.suit}-${item.value}`, ...item, ...suit, numericValue: item.value,
  }))))
}

function drawCard() {
  if (!deck.length) deck = createDeck()
  return deck.pop()!
}

function drawBusCard() {
  const card = deck.pop()!
  busfahrerUsedCards.push(card)
  return card
}

function cardMarkup(card: Card, revealed = true, extraClass = '') {
  const face = `<span class="card-value">${card.label}</span><span class="card-symbol">${card.symbol}</span>`
  return `<div class="playing-card ${revealed ? 'is-revealed' : ''} ${extraClass}" aria-label="${revealed ? `${card.label} ${card.suitLabel}` : 'Verdeckte Karte'}">
    <div class="card-inner"><div class="card-back"><span>GD</span></div><div class="card-front card-${card.color}">
      <span class="card-corner top"><strong>${card.label}</strong><small>${card.symbol}</small></span>
      <span class="card-center">${face}</span>
      <span class="card-corner bottom"><strong>${card.label}</strong><small>${card.symbol}</small></span>
    </div></div></div>`
}

function phaseHeader(current: number, subtitle: string) {
  return `<div class="game-progress"><span>Phase ${current} von 3</span><div class="progress-track"><i style="width:${current / 3 * 100}%"></i></div><span>${subtitle}</span></div>`
}

function feedbackMarkup() {
  return feedback.text ? `<div class="feedback feedback-${feedback.kind}" aria-live="polite">${feedback.text}</div>` : '<div class="feedback is-empty" aria-live="polite"></div>'
}

function handMarkup() {
  return `<section class="player-hand"><h3>Deine Karten</h3><div class="hand-cards">${hand.length ? hand.map((card, index) => cardMarkup(card, true, questionResults[index] ? 'answer-correct' : 'answer-wrong')).join('') : '<p>Noch keine Karten gezogen.</p>'}</div></section>`
}

function busUsedCardsMarkup() {
  const grouped = new Map<number, Card[]>()
  for (const card of busfahrerUsedCards) grouped.set(card.value, [...(grouped.get(card.value) ?? []), card])
  const stacks = values.map(({ value, label }) => {
    const cards = grouped.get(value) ?? []
    return `<div class="used-card-stack ${cards.length ? '' : 'is-empty'}" aria-label="${cards.length ? `Gezogene ${label}-Karten` : `Noch keine gezogene ${label}-Karte`}">
      ${cards.length
        ? cards.map((_, index) => `<span class="mini-used-card" style="--stack-index:${index}">${label}</span>`).join('')
        : `<span class="placeholder-card">${label}</span>`}
    </div>`
  }).join('')
  return `<section class="used-cards" aria-label="Gezogene Karten"><h3>Gezogene Karten</h3><div class="used-card-list">${stacks}</div></section>`
}

function renderQuestions() {
  const question = questions[questionIndex]!
  const preview = deck.at(-1) ?? createDeck()[0]!
  return `${phaseHeader(1, `Frage ${questionIndex + 1} von 4`)}<section class="question-panel">
    <h2>Fragenrunde</h2>
    <div class="question-card-slot">${answered ? cardMarkup(hand.at(-1)!, true, questionResults.at(-1) ? 'answer-correct' : 'answer-wrong') : cardMarkup(preview, false)}</div>
    <div class="phase-one-feedback-zone">${answered ? feedbackMarkup() : `<p class="phase-one-prompt">${question.title}</p>`}</div>
    <div class="choice-grid ${question.options.length === 4 ? 'four-choices' : ''} ${question.options.length === 3 ? 'three-choices' : ''}">
      ${question.options.map(([label, choice]) => `<button class="game-button choice-${choice}" data-choice="${choice}" aria-label="${choiceNames[choice] ?? label}" ${answered ? 'disabled' : ''}>${label}</button>`).join('')}
    </div>
    </section>${handMarkup()}`
}

function evaluateQuestion(choice: string, card: Card) {
  if (questionIndex === 0) return choice === card.color
  if (questionIndex === 1) return choice === 'higher' ? card.value > hand[0]!.value : choice === 'lower' ? card.value < hand[0]!.value : card.value === hand[0]!.value
  if (questionIndex === 2) {
    const low = Math.min(hand[0]!.value, hand[1]!.value)
    const high = Math.max(hand[0]!.value, hand[1]!.value)
    return choice === 'inside' ? card.value > low && card.value < high : card.value < low || card.value > high
  }
  return choice === card.suit
}

function answerQuestion(choice: string) {
  if (answered) return
  const card = drawCard()
  const correct = evaluateQuestion(choice, card)
  hand.push(card)
  questionResults.push(correct)
  answered = true
  feedback = correct ? { text: 'Richtig!', kind: 'success' } : { text: 'Falsch – trinken.', kind: 'error' }
  renderGame()
  window.clearTimeout(advanceTimer)
  advanceTimer = window.setTimeout(() => {
    if (phase === 'questions' && answered) nextQuestion()
  }, 1450)
}

function nextQuestion() {
  if (!answered) return
  if (questionIndex < 3) {
    questionIndex += 1; answered = false; feedback = { text: '', kind: 'info' }
  } else {
    phase = 'pyramid'
    const heldCardIds = new Set(hand.map((card) => card.id))
    deck = deck.filter((card) => !heldCardIds.has(card.id))
    pyramidCards = Array.from({ length: 10 }, drawCard)
    feedback = { text: '', kind: 'info' }
  }
  renderGame()
}

function renderPyramid() {
  const rows = [[0], [1, 2], [3, 4, 5], [6, 7, 8, 9]]
  const complete = pyramidProgress === 10
  return `${phaseHeader(2, `${pyramidProgress} von 10 Karten`)}<section class="pyramid-panel">
    <h2>Pyramide</h2><div class="pyramid">${rows.map((row, rowIndex) =>
      `<div class="pyramid-row" data-drinks="${4 - rowIndex} Schluck${rowIndex === 3 ? '' : 'e'}">${row.map((index) => cardMarkup(pyramidCards[index]!, pyramidOrder.slice(0, pyramidProgress).includes(index), pyramidHits.has(index) ? 'pyramid-hit' : '')).join('')}</div>`).join('')}</div>
    ${feedbackMarkup()}<button class="game-button primary" data-action="${complete ? 'start-bus' : 'reveal-pyramid'}">${complete ? 'Weiter zur Busfahrer-Runde' : 'Nächste Karte aufdecken'}</button>
    </section>${handMarkup()}`
}

function revealPyramid() {
  if (pyramidProgress >= 10) return
  const index = pyramidOrder[pyramidProgress]!
  const card = pyramidCards[index]!
  const match = hand.some((heldCard) => heldCard.value === card.value)
  if (match) pyramidHits.add(index)
  const drinks = index >= 6 ? 1 : index >= 3 ? 2 : index >= 1 ? 3 : 4
  feedback = match ? { text: `Treffer! Wert gefunden – ${drinks} Schluck${drinks === 1 ? '' : 'e'}.`, kind: 'success' } : { text: 'Kein Treffer.', kind: 'info' }
  pyramidProgress += 1
  renderGame()
}

function startBus() {
  deck = createDeck()
  phase = 'bus'; busCards = []; busProgress = 0; busFailed = false; busLost = false; busFeedbackPending = false; busfahrerUsedCards = []
  feedback = { text: '', kind: 'info' }
  renderGame()
}

function renderBus() {
  if (busLost) {
    return `<section class="bus-panel lost-screen"><h2>Deck aufgebraucht – Verloren</h2>
      <div class="end-actions"><button class="game-button" data-action="restart">Erneut spielen</button><button class="game-button" data-action="back">Spiel beenden</button></div>
    </section>`
  }
  const complete = busProgress === busCards.length
    && busProgress === busRoundLength
  const first = busProgress === 0
  const choicePrompt = first ? 'Rot oder Blau?' : 'Höher, gleich oder tiefer?'
  const busDisabled = busFeedbackPending ? ' disabled' : ''
  const busAction = complete
    ? '<button class="game-button primary" data-action="restart">Neu starten</button>'
    : busFailed
      ? '<button class="game-button primary" data-action="retry-bus">Zurück zum Anfang</button>'
      : `<div class="choice-grid">${first
        ? `<button class="game-button choice-red" data-bus-choice="red"${busDisabled}>Rot</button><button class="game-button choice-blue" data-bus-choice="blue"${busDisabled}>Blau</button>`
        : `<div class="three-choices"><button class="game-button" data-bus-choice="higher"${busDisabled}>Höher</button><button class="game-button" data-bus-choice="equal"${busDisabled}>Gleich</button><button class="game-button" data-bus-choice="lower"${busDisabled}>Tiefer</button></div>`}</div>`
  return `${phaseHeader(3, complete ? 'Ziel erreicht' : `Karte ${busProgress + 1} von ${busCards.length}`)}<section class="bus-panel">
    <h2>${complete ? 'Geschafft!' : 'Busfahrer'}</h2>
    <div class="bus-card-row">${Array.from({ length: busRoundLength }, (_, index) => {
      const card = busCards[index]
      return card ? cardMarkup(card, true, index === busProgress ? 'current-card' : '') : cardMarkup(deck.at(-1) ?? createDeck()[0]!, false, index === busProgress ? 'current-card' : '')
    }).join('')}</div>
    <div class="bus-dashed-line" aria-hidden="true"></div>
    ${complete ? feedbackMarkup() : `<div class="bus-prompt-zone">${feedback.text ? feedbackMarkup() : `<p>${choicePrompt}</p>`}</div>`}
    ${busAction}
    </section>`
}

function answerBus(choice: string) {
  if (busFailed || busLost || busFeedbackPending) return
  const previousCard = busCards[busProgress - 1]
  const card = drawBusCard()
  busCards.push(card)
  const correct = busProgress === 0
    ? choice === card.color
    : choice === 'higher'
      ? card.numericValue > previousCard!.numericValue
      : choice === 'lower'
        ? card.numericValue < previousCard!.numericValue
        : card.numericValue === previousCard!.numericValue
  if (!correct) {
    feedback = { text: 'Falsch – trinken.', kind: 'error' }
    busFailed = true; renderGame(); return
  }
  busProgress += 1
  feedback = busProgress === busRoundLength
    ? { text: 'Geschafft! Du bist aus dem Bus.', kind: 'success' }
    : { text: 'Richtig!', kind: 'success' }
  busFeedbackPending = busProgress < busRoundLength
  renderGame()
  if (busFeedbackPending) {
    window.clearTimeout(advanceTimer)
    advanceTimer = window.setTimeout(() => {
      if (phase !== 'bus' || !busFeedbackPending) return
      busFeedbackPending = false
      feedback = { text: '', kind: 'info' }
      renderGame()
    }, 1100)
  }
}

function resetGame() {
  window.clearTimeout(advanceTimer)
  advanceTimer = undefined
  deck = createDeck(); phase = 'questions'; questionIndex = 0; hand = []; questionResults = []; answered = false
  feedback = { text: '', kind: 'info' }; pyramidCards = []; pyramidProgress = 0; pyramidHits = new Set<number>(); busCards = []; busProgress = 0; busFailed = false; busLost = false; busFeedbackPending = false; busfahrerUsedCards = []
}

function renderGame() {
  if (!gameRoot) return
  const content = phase === 'questions' ? renderQuestions() : phase === 'pyramid' ? renderPyramid() : renderBus()
  gameRoot.innerHTML = `<div class="busfahrer-shell"><header class="busfahrer-header">
    <button class="back-button bus-back" type="button" data-action="back">← Zurück</button><div><p>GetDrunk präsentiert</p><h1>Busfahrer</h1></div>
    <button class="restart-button" type="button" data-action="restart">Neu starten</button></header>
    <p class="responsibility-note">Trink verantwortungsvoll. Dieses Spiel ist nur für Erwachsene.</p><div class="game-stage">${content}${phase === 'bus' ? busUsedCardsMarkup() : ''}</div></div>`
}

function handleClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.dataset.choice) answerQuestion(button.dataset.choice)
  if (button.dataset.busChoice) answerBus(button.dataset.busChoice)
  if (button.dataset.action === 'reveal-pyramid') revealPyramid()
  if (button.dataset.action === 'start-bus') startBus()
  if (button.dataset.action === 'retry-bus') {
    if (deck.length < busRoundLength) {
      busLost = true; feedback = { text: '', kind: 'info' }
    } else {
      busCards = []; busProgress = 0; busFailed = false; busFeedbackPending = false
      feedback = { text: '', kind: 'info' }
    }
    renderGame()
  }
  if (button.dataset.action === 'restart') { resetGame(); renderGame() }
  if (button.dataset.action === 'back') window.location.hash = ''
}

export function mountBusfahrer(root: HTMLElement) {
  gameRoot = root; resetGame(); root.addEventListener('click', handleClick); renderGame()
  return () => { window.clearTimeout(advanceTimer); root.removeEventListener('click', handleClick); gameRoot = null }
}
