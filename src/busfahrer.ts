import './busfahrer.css'

type CardColor = 'red' | 'blue'
type SuitId = 'heart' | 'diamond' | 'star' | 'moon'
type Card = { id: string; value: number; label: string; color: CardColor; suit: SuitId; suitLabel: string; symbol: string; numericValue: number }
type FeedbackKind = 'success' | 'error' | 'info'
type GamePlayer = { id: string; name: string; hand: Card[]; questionResults: boolean[]; drinks: number }
type PyramidDecision = { cardId: string; label: string; drinks: number; step: 'offer' | 'target' }

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
const questionPrompts = [
  '<span class="prompt-red">Rot</span> oder <span class="prompt-blue">Blau</span>?',
  '<span class="prompt-red">Höher</span>, <span class="prompt-purple">Gleich</span> oder <span class="prompt-blue">Tiefer</span>?',
  '<span class="prompt-red">Innen</span> oder <span class="prompt-blue">Außen</span>?',
  'Welche <span class="prompt-purple">Kartenfarbe</span>?',
]
const choiceNames: Record<string, string> = { heart: 'Herz', diamond: 'Karo', star: 'Stern', moon: 'Mond' }
const pyramidOrder = [6, 7, 8, 9, 3, 4, 5, 1, 2, 0]
const busRoundLength = 5

let deck: Card[] = []
let phase: 'player-intro' | 'questions' | 'pyramid' | 'summary' | 'bus' | 'final' = 'player-intro'
let configuredPlayerNames = ['Nick']
let gamePlayers: GamePlayer[] = []
let currentPlayerIndex = 0
let busDriverIndex = 0
let finalResult = ''
let questionIndex = 0
let hand: Card[] = []
let questionResults: boolean[] = []
let answered = false
let feedback = { text: '', kind: 'info' as FeedbackKind }
let pyramidCards: Card[] = []
let pyramidProgress = 0
let pyramidHits = new Set<number>()
let pyramidDecision: PyramidDecision | null = null
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

function createDeck(deckCount = 1): Card[] {
  return shuffle(Array.from({ length: deckCount }, (_, deckIndex) => suits.flatMap((suit) => values.map((item) => ({
    id: `${deckIndex}-${suit.suit}-${item.value}`, ...item, ...suit, numericValue: item.value,
  })))).flat())
}

function drawCard() {
  if (!deck.length) throw new Error('Das gemeinsame Kartendeck ist aufgebraucht.')
  return deck.pop()!
}

function drawBusCard() {
  const card = deck.pop()!
  busfahrerUsedCards.push(card)
  return card
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function cardMarkup(card: Card, revealed = true, extraClass = '') {
  const face = `<span class="card-value">${card.label}</span><span class="card-symbol">${card.symbol}</span>`
  return `<div class="playing-card ${revealed ? 'is-revealed' : ''} ${extraClass}" aria-label="${revealed ? `${card.label} ${card.suitLabel}` : 'Verdeckte Karte'}">
    <div class="card-inner"><div class="card-back"><span>GD</span></div><div class="card-front card-${card.color}">
      <span class="card-center">${face}</span>
    </div></div></div>`
}

function phaseHeader(current: number, subtitle: string) {
  return `<div class="game-progress"><span>Phase ${current} von 3</span><div class="progress-track"><i style="width:${current / 3 * 100}%"></i></div><span>${escapeHtml(subtitle)}</span></div>`
}

function feedbackMarkup() {
  return feedback.text ? `<div class="feedback feedback-${feedback.kind}" aria-live="polite">${escapeHtml(feedback.text)}</div>` : '<div class="feedback is-empty" aria-live="polite"></div>'
}

function currentPlayer() {
  return gamePlayers[currentPlayerIndex]!
}

function syncCurrentPlayerCards() {
  currentPlayer().hand = hand
  currentPlayer().questionResults = questionResults
}

function handMarkup() {
  return `<section class="player-hand"><h3><strong class="hand-player-name">${escapeHtml(currentPlayer().name)}:</strong> <span class="hand-title-label">Deine Karten</span></h3><div class="hand-cards">${hand.length ? hand.map((card, index) => cardMarkup(card, true, questionResults[index] ? 'answer-correct' : 'answer-wrong')).join('') : '<p>Noch keine Karten gezogen.</p>'}</div></section>`
}

function renderPlayerIntro() {
  return `<section class="player-turn-screen"><div class="player-turn-icon" aria-hidden="true">♠</div><p>Spieler ${currentPlayerIndex + 1} von ${gamePlayers.length}</p><h2><strong class="turn-player-name">${escapeHtml(currentPlayer().name)}</strong><span>ist dran</span></h2>
    <div class="player-turn-actions"><button class="game-button primary" data-action="start-player-round">Jetzt starten</button></div></section>`
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
  return `<section class="used-cards" aria-label="Gezogene Karten"><h3><strong class="hand-player-name">${escapeHtml(currentPlayer().name)}:</strong> <span class="hand-title-label">Gezogene Karten</span></h3><div class="used-card-list">${stacks}</div></section>`
}

function renderQuestions() {
  const question = questions[questionIndex]!
  const preview = deck.at(-1) ?? createDeck()[0]!
  return `${phaseHeader(1, `${currentPlayer().name} · Frage ${questionIndex + 1} von 4`)}<section class="question-panel">
    <h2>Fragenrunde</h2>
    <div class="question-card-slot">${answered ? cardMarkup(hand.at(-1)!, true, questionResults.at(-1) ? 'answer-correct' : 'answer-wrong') : cardMarkup(preview, false)}</div>
    <div class="phase-one-feedback-zone">${answered ? feedbackMarkup() : `<p class="phase-one-prompt">${questionPrompts[questionIndex]}</p>`}</div>
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
  if (!correct) currentPlayer().drinks += 1
  syncCurrentPlayerCards()
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
    if (!pyramidCards.length) pyramidCards = Array.from({ length: 10 }, drawCard)
    pyramidProgress = 0
    pyramidHits = new Set<number>()
    pyramidDecision = null
    feedback = { text: '', kind: 'info' }
  }
  renderGame()
}

function renderPyramid() {
  const rows = [[0], [1, 2], [3, 4, 5], [6, 7, 8, 9]]
  const complete = pyramidProgress === 10
  const pyramidAction = pyramidDecision?.step === 'offer'
    ? `<div class="pyramid-decision"><p>Möchtest du deine ${pyramidDecision.label} setzen?</p><div><button class="game-button primary" data-action="use-pyramid-card">Ja</button><button class="game-button" data-action="keep-pyramid-card">Nein</button></div></div>`
    : pyramidDecision?.step === 'target'
      ? `<div class="pyramid-decision"><p>Wer soll ${pyramidDecision.drinks} Schluck${pyramidDecision.drinks === 1 ? '' : 'e'} trinken?</p><div class="pyramid-targets">${gamePlayers.map((player, index) => `<button class="game-button" data-pyramid-target="${index}">${escapeHtml(player.name)}</button>`).join('')}</div></div>`
      : `<button class="game-button primary" data-action="${complete ? 'finish-player-pyramid' : 'reveal-pyramid'}">${complete ? `${currentPlayer().name} ist fertig` : 'Nächste Karte aufdecken'}</button>`
  return `${phaseHeader(2, `${currentPlayer().name} · ${pyramidProgress} von 10 Karten`)}<section class="pyramid-panel">
    <h2>Pyramide</h2><div class="pyramid">${rows.map((row, rowIndex) =>
      `<div class="pyramid-row" data-drinks="${4 - rowIndex} Schluck${rowIndex === 3 ? '' : 'e'}">${row.map((index) => cardMarkup(pyramidCards[index]!, pyramidOrder.slice(0, pyramidProgress).includes(index), pyramidHits.has(index) ? 'pyramid-hit' : '')).join('')}</div>`).join('')}</div>
    ${feedbackMarkup()}${pyramidAction}
    </section>${handMarkup()}`
}

function revealPyramid() {
  if (pyramidProgress >= 10 || pyramidDecision) return
  const index = pyramidOrder[pyramidProgress]!
  const card = pyramidCards[index]!
  const matchingCard = hand.find((heldCard) => heldCard.value === card.value)
  const match = Boolean(matchingCard)
  if (match) pyramidHits.add(index)
  const drinks = index >= 6 ? 1 : index >= 3 ? 2 : index >= 1 ? 3 : 4
  feedback = match ? { text: `Treffer: ${card.label}`, kind: 'success' } : { text: 'Kein Treffer.', kind: 'info' }
  if (matchingCard) pyramidDecision = { cardId: matchingCard.id, label: matchingCard.label, drinks, step: 'offer' }
  pyramidProgress += 1
  renderGame()
}

function usePyramidCard() {
  if (!pyramidDecision || pyramidDecision.step !== 'offer') return
  const cardIndex = hand.findIndex((card) => card.id === pyramidDecision!.cardId)
  if (cardIndex >= 0) {
    hand.splice(cardIndex, 1)
    questionResults.splice(cardIndex, 1)
    syncCurrentPlayerCards()
  }
  pyramidDecision.step = 'target'
  feedback = { text: '', kind: 'info' }
  renderGame()
}

function keepPyramidCard() {
  pyramidDecision = null
  feedback = { text: '', kind: 'info' }
  renderGame()
}

function assignPyramidDrinks(targetIndex: number) {
  if (!pyramidDecision || pyramidDecision.step !== 'target' || !gamePlayers[targetIndex]) return
  gamePlayers[targetIndex]!.drinks += pyramidDecision.drinks
  feedback = { text: `${gamePlayers[targetIndex]!.name}: ${pyramidDecision.drinks} Schluck${pyramidDecision.drinks === 1 ? '' : 'e'}.`, kind: 'success' }
  pyramidDecision = null
  renderGame()
}

function finishPlayerPyramid() {
  if (pyramidProgress !== 10 || pyramidDecision) return
  if (currentPlayerIndex < gamePlayers.length - 1) {
    currentPlayerIndex += 1
    hand = currentPlayer().hand
    questionResults = currentPlayer().questionResults
    questionIndex = 0
    answered = false
    pyramidProgress = 0
    pyramidHits = new Set<number>()
    pyramidDecision = null
    feedback = { text: '', kind: 'info' }
    phase = 'player-intro'
  } else {
    const mostCards = Math.max(...gamePlayers.map((player) => player.hand.length))
    const cardLeaders = gamePlayers.map((player, index) => ({ player, index })).filter(({ player }) => player.hand.length === mostCards)
    const mostDrinks = Math.max(...cardLeaders.map(({ player }) => player.drinks))
    const tiedLeaders = cardLeaders.filter(({ player }) => player.drinks === mostDrinks)
    busDriverIndex = tiedLeaders[Math.floor(Math.random() * tiedLeaders.length)]!.index
    phase = 'summary'
    feedback = { text: '', kind: 'info' }
  }
  renderGame()
}

function startBus() {
  currentPlayerIndex = busDriverIndex
  deck = createDeck(1)
  phase = 'bus'; busCards = []; busProgress = 0; busFailed = false; busLost = false; busFeedbackPending = false; busfahrerUsedCards = []
  feedback = { text: '', kind: 'info' }
  renderGame()
}

function playerStatsMarkup() {
  return `<div class="game-stats-table"><div class="game-stats-head"><span>Spieler</span><span>Schlücke</span></div>${gamePlayers.map((player, index) => `<div class="game-stats-row ${index === busDriverIndex ? 'is-bus-driver' : ''}"><strong>${escapeHtml(player.name)}</strong><span>${player.drinks}</span></div>`).join('')}</div>`
}

function renderSummary(final = false) {
  const title = final ? finalResult : `${gamePlayers[busDriverIndex]!.name} ist Busfahrer`
  return `${phaseHeader(final ? 3 : 2, final ? 'Endstand' : 'Auswertung')}<section class="game-summary-panel"><h2>${escapeHtml(title)}</h2>${playerStatsMarkup()}
    <button class="game-button primary" data-action="${final ? 'restart' : 'start-bus'}">${final ? 'Neu starten' : 'Phase 3 starten'}</button></section>`
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
  const choicePrompt = first ? questionPrompts[0] : questionPrompts[1]
  const busDisabled = busFeedbackPending ? ' disabled' : ''
  const busAction = complete
    ? '<button class="game-button primary" data-action="show-final-summary">Ergebnis anzeigen</button>'
    : busFailed
      ? '<button class="game-button primary" data-action="retry-bus">Zurück zum Anfang</button>'
      : `<div class="choice-grid">${first
        ? `<button class="game-button choice-red" data-bus-choice="red"${busDisabled}>Rot</button><button class="game-button choice-blue" data-bus-choice="blue"${busDisabled}>Blau</button>`
        : `<div class="three-choices"><button class="game-button choice-higher" data-bus-choice="higher"${busDisabled}>Höher</button><button class="game-button choice-equal" data-bus-choice="equal"${busDisabled}>Gleich</button><button class="game-button choice-lower" data-bus-choice="lower"${busDisabled}>Tiefer</button></div>`}</div>`
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
    currentPlayer().drinks += 1
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
  gamePlayers = configuredPlayerNames.map((name, index) => ({ id: `${index}-${name}`, name, hand: [], questionResults: [], drinks: 0 }))
  currentPlayerIndex = 0; busDriverIndex = 0; finalResult = ''
  deck = createDeck(gamePlayers.length >= 6 ? 2 : 1); phase = 'player-intro'; questionIndex = 0; hand = gamePlayers[0]!.hand; questionResults = gamePlayers[0]!.questionResults; answered = false
  feedback = { text: '', kind: 'info' }; pyramidCards = []; pyramidProgress = 0; pyramidHits = new Set<number>(); pyramidDecision = null; busCards = []; busProgress = 0; busFailed = false; busLost = false; busFeedbackPending = false; busfahrerUsedCards = []
}

function renderGame() {
  if (!gameRoot) return
  const content = phase === 'player-intro' ? renderPlayerIntro() : phase === 'questions' ? renderQuestions() : phase === 'pyramid' ? renderPyramid() : phase === 'summary' ? renderSummary() : phase === 'final' ? renderSummary(true) : renderBus()
  gameRoot.innerHTML = `<div class="busfahrer-shell"><header class="busfahrer-header">
    <button class="back-button bus-back" type="button" data-action="back">${phase === 'player-intro' ? 'Beenden' : '← Zurück'}</button><div><p>GetDrunk präsentiert</p><h1>Busfahrer</h1></div>
    <button class="restart-button" type="button" data-action="restart">Neu starten</button></header>
    <p class="responsibility-note">Trink verantwortungsvoll. Dieses Spiel ist nur für Erwachsene.</p><div class="game-stage">${content}${phase === 'bus' ? busUsedCardsMarkup() : ''}</div></div>`
}

function handleClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.dataset.choice) answerQuestion(button.dataset.choice)
  if (button.dataset.busChoice) answerBus(button.dataset.busChoice)
  if (button.dataset.pyramidTarget) assignPyramidDrinks(Number(button.dataset.pyramidTarget))
  if (button.dataset.action === 'reveal-pyramid') revealPyramid()
  if (button.dataset.action === 'use-pyramid-card') usePyramidCard()
  if (button.dataset.action === 'keep-pyramid-card') keepPyramidCard()
  if (button.dataset.action === 'finish-player-pyramid') finishPlayerPyramid()
  if (button.dataset.action === 'start-player-round') {
    phase = 'questions'
    feedback = { text: '', kind: 'info' }
    renderGame()
  }
  if (button.dataset.action === 'start-bus') startBus()
  if (button.dataset.action === 'show-final-summary') {
    finalResult = `${currentPlayer().name} hat die Busfahrer-Runde geschafft!`
    phase = 'final'
    renderGame()
  }
  if (button.dataset.action === 'retry-bus') {
    if (deck.length < busRoundLength) {
      finalResult = 'Deck aufgebraucht – verloren'
      phase = 'final'; busLost = true; feedback = { text: '', kind: 'info' }
    } else {
      busCards = []; busProgress = 0; busFailed = false; busFeedbackPending = false
      feedback = { text: '', kind: 'info' }
    }
    renderGame()
  }
  if (button.dataset.action === 'restart') { resetGame(); renderGame() }
  if (button.dataset.action === 'back') window.location.hash = 'busfahrer-offline'
}

export function mountBusfahrer(root: HTMLElement, playerNames: string[] = ['Nick']) {
  configuredPlayerNames = playerNames.length ? playerNames : ['Nick']
  gameRoot = root; resetGame(); root.addEventListener('click', handleClick); renderGame()
  return () => { window.clearTimeout(advanceTimer); root.removeEventListener('click', handleClick); gameRoot = null }
}
