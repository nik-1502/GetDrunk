import './busfahrer.css'
import { defaultProfileIconMarkup } from './profiles.ts'
import { playActionSound, playSound } from './audio/audioManager.ts'

type CardColor = 'red' | 'blue'
type SuitId = 'heart' | 'diamond' | 'star' | 'moon'
type Card = { id: string; value: number; label: string; color: CardColor; suit: SuitId; suitLabel: string; symbol: string; numericValue: number }
type FeedbackKind = 'success' | 'error' | 'info'
type FeedbackState = { text: string; kind: FeedbackKind; playerName?: string; drinks?: number }
type Phase = 'player-intro' | 'questions' | 'pyramid' | 'summary' | 'bus' | 'final'
type GamePlayer = { id: string; name: string; avatar: string; avatarColor: string; hand: Card[]; questionResults: boolean[]; drinks: number }
export type PlayerSetup = { id?: string; name: string; avatar: string; avatarColor: string }
type PyramidDecision = { cardId: string; label: string; drinks: number; step: 'offer' | 'target' }
export type BusfahrerGameState = {
  deck: Card[]
  phase: Phase
  gamePlayers: GamePlayer[]
  currentPlayerIndex: number
  busDriverIndex: number
  finalResult: string
  questionIndex: number
  hand: Card[]
  questionResults: boolean[]
  answered: boolean
  feedback: FeedbackState
  pyramidCards: Card[]
  pyramidProgress: number
  pyramidHits: number[]
  pyramidDecision: PyramidDecision | null
  busCards: Card[]
  busProgress: number
  busFailed: boolean
  busLost: boolean
  busFeedbackPending: boolean
  busfahrerUsedCards: Card[]
}
type OnlineGameOptions = {
  localPlayerId?: string
  initialState?: BusfahrerGameState | null
  onStateChange?: (state: BusfahrerGameState) => void
  onLeave?: () => void
}

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
let phase: Phase = 'player-intro'
let configuredPlayers: PlayerSetup[] = [{ name: 'Nick', avatar: '', avatarColor: '#dda15e' }]
let gamePlayers: GamePlayer[] = []
let currentPlayerIndex = 0
let busDriverIndex = 0
let finalResult = ''
let questionIndex = 0
let hand: Card[] = []
let questionResults: boolean[] = []
let answered = false
let feedback: FeedbackState = { text: '', kind: 'info' }
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
let onlineOptions: OnlineGameOptions = {}
let suppressStatePublish = false

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

function playerNameColor(player: GamePlayer) {
  return `style="--player-name-color:${escapeHtml(player.avatarColor)}"`
}

function playerNameInText(text: string) {
  const player = gamePlayers.find((candidate) => text.includes(candidate.name))
  if (!player) return escapeHtml(text)
  const nameIndex = text.indexOf(player.name)
  return `${escapeHtml(text.slice(0, nameIndex))}<span class="player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</span>${escapeHtml(text.slice(nameIndex + player.name.length))}`
}

function cardMarkup(card: Card, revealed = true, extraClass = '') {
  const face = `<span class="card-value">${card.label}</span><span class="card-symbol">${card.symbol}</span>`
  return `<div class="playing-card ${revealed ? 'is-revealed' : ''} ${extraClass}" aria-label="${revealed ? `${card.label} ${card.suitLabel}` : 'Verdeckte Karte'}">
    <div class="card-inner"><div class="card-back"><span><span class="card-back-mirror">B</span><span>B</span></span></div><div class="card-front card-${card.color}">
      <span class="card-center">${face}</span>
    </div></div></div>`
}

function phaseHeader(current: number, subtitle: string) {
  const [name, detail] = subtitle.split(' · ')
  const hasPlayerName = Boolean(detail) && gamePlayers.some((player) => player.name === name)
  const subtitleMarkup = `<span>${escapeHtml(hasPlayerName ? detail! : subtitle)}</span>`
  return `<div class="game-progress"><span>Phase ${current} von 3</span><div class="progress-track"><i style="width:${current / 3 * 100}%"></i></div>${subtitleMarkup}</div>`
}

function feedbackMarkup() {
  if (!feedback.text) return '<div class="feedback is-empty" aria-live="polite"></div>'
  if (feedback.playerName && feedback.drinks) {
    const player = gamePlayers.find((candidate) => candidate.name === feedback.playerName)
    return `<div class="feedback feedback-${feedback.kind} feedback-drinks" aria-live="polite"><strong class="player-name-color" ${player ? playerNameColor(player) : ''}>${escapeHtml(feedback.playerName)}</strong><span>${feedback.drinks} Schluck${feedback.drinks === 1 ? '' : 'e'}</span></div>`
  }
  return `<div class="feedback feedback-${feedback.kind}" aria-live="polite">${escapeHtml(feedback.text)}</div>`
}

function currentPlayer() {
  return gamePlayers[currentPlayerIndex]!
}

function localCanControl() {
  if (!onlineOptions.localPlayerId) return true
  return currentPlayer()?.id === onlineOptions.localPlayerId
}

function snapshotGameState(): BusfahrerGameState {
  return {
    deck, phase, gamePlayers, currentPlayerIndex, busDriverIndex, finalResult, questionIndex, hand, questionResults,
    answered, feedback, pyramidCards, pyramidProgress, pyramidHits: [...pyramidHits], pyramidDecision, busCards,
    busProgress, busFailed, busLost, busFeedbackPending, busfahrerUsedCards,
  }
}

function applyGameState(state: BusfahrerGameState) {
  deck = state.deck
  phase = state.phase
  gamePlayers = state.gamePlayers
  currentPlayerIndex = Math.min(state.currentPlayerIndex, Math.max(0, gamePlayers.length - 1))
  busDriverIndex = Math.min(state.busDriverIndex, Math.max(0, gamePlayers.length - 1))
  finalResult = state.finalResult
  questionIndex = state.questionIndex
  hand = state.hand
  questionResults = state.questionResults
  answered = state.answered
  feedback = state.feedback
  pyramidCards = state.pyramidCards
  pyramidProgress = state.pyramidProgress
  pyramidHits = new Set(state.pyramidHits)
  pyramidDecision = state.pyramidDecision
  busCards = state.busCards
  busProgress = state.busProgress
  busFailed = state.busFailed
  busLost = state.busLost
  busFeedbackPending = state.busFeedbackPending
  busfahrerUsedCards = state.busfahrerUsedCards
}

export function getBusfahrerState() {
  return snapshotGameState()
}

export function applyBusfahrerState(state: BusfahrerGameState) {
  const previous = gameRoot ? snapshotGameState() : null
  suppressStatePublish = true
  applyGameState(state)
  renderGame()
  suppressStatePublish = false
  if (!previous) return
  const drewCard = state.pyramidProgress > previous.pyramidProgress
  if (drewCard) playSound('pyramid-card-reveal')
  if (state.feedback.text !== previous.feedback.text && state.feedback.kind !== 'info') playSound(state.feedback.kind === 'success' ? 'correct' : 'wrong')
  if (state.currentPlayerIndex !== previous.currentPlayerIndex) playSound('player-change')
  if (state.phase === 'final' && previous.phase !== 'final') playSound('game-finish')
}

function publishState() {
  if (suppressStatePublish || !onlineOptions.onStateChange) return
  onlineOptions.onStateChange(snapshotGameState())
}

function syncCurrentPlayerCards() {
  currentPlayer().hand = hand
  currentPlayer().questionResults = questionResults
}

function handMarkup() {
  return `<section class="player-hand" data-question-hand-title="${escapeHtml(`${currentPlayer().name} – Deine Karten`)}"><div class="player-hand-caption"><strong class="player-name-color" ${playerNameColor(currentPlayer())}>${escapeHtml(currentPlayer().name)}</strong><span> – Deine Karten</span></div><h3><strong class="hand-player-name player-name-color" ${playerNameColor(currentPlayer())}>${escapeHtml(currentPlayer().name)}</strong><span class="hand-title-colon">:</span> <span class="hand-title-label">Deine Karten</span></h3><div class="hand-cards">${hand.length ? hand.map((card, index) => cardMarkup(card, true, questionResults[index] ? 'answer-correct' : 'answer-wrong')).join('') : '<p>Noch keine Karten gezogen.</p>'}</div></section>`
}

function renderPlayerIntro() {
  const player = currentPlayer()
  const avatar = player.avatar ? `<img src="${player.avatar}" alt="Profilbild von ${escapeHtml(player.name)}">` : defaultProfileIconMarkup()
  const playerImage = `<span class="player-turn-avatar ${player.avatar ? '' : 'is-default'}" style="--avatar-ring:${player.avatarColor}">${avatar}</span>`
  return `<div class="player-turn-wrap"><section class="player-turn-screen">${playerImage}<h2><strong class="turn-player-name player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</strong></h2>
    <p class="player-turn-prompt">Du bist dran</p>
    <div class="player-turn-actions"><button class="game-button primary" data-action="start-player-round">Jetzt starten</button></div></section></div>`
}

function playerTargetAvatarMarkup(player: GamePlayer) {
  const avatar = player.avatar ? `<img src="${player.avatar}" alt="Profilbild von ${escapeHtml(player.name)}">` : defaultProfileIconMarkup()
  return `<span class="pyramid-target-avatar ${player.avatar ? '' : 'is-default'}" style="--avatar-ring:${player.avatarColor}">${avatar}</span>`
}

function currentPlayerFooterMarkup() {
  const isActiveGameScreen = phase === 'player-intro'
    || phase === 'questions'
    || phase === 'bus'
    || (phase === 'pyramid' && pyramidDecision?.step !== 'target')
  if (!isActiveGameScreen) return ''
  const player = currentPlayer()
  return `<div class="current-player-footer">${playerTargetAvatarMarkup(player)}<strong class="player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</strong></div>`
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
  return `<section class="used-cards" aria-label="Gezogene Karten"><h3><strong class="hand-player-name player-name-color" ${playerNameColor(currentPlayer())}>${escapeHtml(currentPlayer().name)}</strong><span class="hand-title-colon">:</span> <span class="hand-title-label">Gezogene Karten</span></h3><div class="used-card-list">${stacks}</div></section>`
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
  playSound(correct ? 'correct' : 'wrong')
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
  if (pyramidDecision?.step === 'target') {
    return `${phaseHeader(2, `${currentPlayer().name} · Spieler auswählen`)}<section class="pyramid-target-screen"><p class="eyebrow">Pyramide</p><h2>Wer soll <span class="drink-count-highlight">${pyramidDecision.drinks}</span> Schluck${pyramidDecision.drinks === 1 ? '' : 'e'} trinken?</h2>
      <div class="pyramid-player-list">${gamePlayers.map((player, index) => `<button class="game-button" data-pyramid-target="${index}">${playerTargetAvatarMarkup(player)}<span class="player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</span></button>`).join('')}</div></section>`
  }
  const rows = [[0], [1, 2], [3, 4, 5], [6, 7, 8, 9]]
  const complete = pyramidProgress === 10
  const pyramidAction = pyramidDecision?.step === 'offer'
    ? `<div class="pyramid-offer"><button class="game-button choice-red pyramid-side-choice pyramid-choice-no" data-action="keep-pyramid-card">Nein</button><div class="pyramid-offer-question">Möchtest du die Karte ${escapeHtml(pyramidDecision.label)} setzen?</div><button class="game-button choice-blue pyramid-side-choice pyramid-choice-yes" data-action="use-pyramid-card">Ja</button></div>`
    : `<button class="game-button primary" data-action="${complete ? 'finish-player-pyramid' : 'reveal-pyramid'}">${complete ? `<span class="player-name-color" ${playerNameColor(currentPlayer())}>${escapeHtml(currentPlayer().name)}</span> ist fertig` : 'Nächste Karte aufdecken'}</button>`
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
  playSound('pyramid-card-reveal')
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
  feedback = { text: `${gamePlayers[targetIndex]!.name}: ${pyramidDecision.drinks} Schluck${pyramidDecision.drinks === 1 ? '' : 'e'}.`, kind: 'success', playerName: gamePlayers[targetIndex]!.name, drinks: pyramidDecision.drinks }
  pyramidDecision = null
  renderGame()
}

function finishPlayerPyramid() {
  if (pyramidProgress !== 10 || pyramidDecision) return
  if (currentPlayerIndex < gamePlayers.length - 1) {
    playSound('player-change')
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
  const sortedPlayers = gamePlayers
    .map((player, index) => ({ player, index }))
    .sort((left, right) => right.player.drinks - left.player.drinks || left.index - right.index)
  return `<div class="game-stats-table"><div class="game-stats-head"><span>Spieler</span><span>Schlücke</span></div>${sortedPlayers.map(({ player, index }) => `<div class="game-stats-row ${index === busDriverIndex ? 'is-bus-driver' : ''}"><div class="game-stats-player">${playerTargetAvatarMarkup(player)}<strong class="player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</strong></div><span>${player.drinks}</span></div>`).join('')}</div>`
}

function renderSummary(final = false) {
  const title = final ? finalResult : `${gamePlayers[busDriverIndex]!.name} ist BLOBB-FAHRER`
  return `${phaseHeader(final ? 3 : 2, final ? 'Endstand' : 'Auswertung')}<section class="game-summary-panel"><h2>${playerNameInText(title)}</h2>${playerStatsMarkup()}
    <button class="game-button primary${final ? ' blobba-nav-action' : ''}" data-action="${final ? 'restart' : 'start-bus'}">${final ? 'Neu starten' : 'Phase 3 starten'}</button></section>`
}

function renderBus() {
  if (busLost) {
    return `<section class="bus-panel lost-screen"><h2>Deck aufgebraucht – Verloren</h2>
      <div class="end-actions"><button class="game-button blobba-nav-action ipad-pwa-end-button" data-action="restart">Erneut spielen</button><button class="game-button blobba-nav-action ipad-pwa-end-button" data-action="back">Spiel beenden</button></div>
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
    <h2>${complete ? 'Geschafft!' : 'BLOBB-FAHRER'}</h2>
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
    playSound('wrong')
    feedback = { text: 'Falsch – trinken.', kind: 'error' }
    currentPlayer().drinks += 1
    busFailed = true; renderGame(); return
  }
  busProgress += 1
  playSound('correct')
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
  gamePlayers = configuredPlayers.map(({ id, name, avatar, avatarColor }, index) => ({ id: id ?? `${index}-${name}`, name, avatar, avatarColor, hand: [], questionResults: [], drinks: 0 }))
  currentPlayerIndex = 0; busDriverIndex = 0; finalResult = ''
  deck = createDeck(gamePlayers.length >= 6 ? 2 : 1); phase = 'player-intro'; questionIndex = 0; hand = gamePlayers[0]!.hand; questionResults = gamePlayers[0]!.questionResults; answered = false
  feedback = { text: '', kind: 'info' }; pyramidCards = []; pyramidProgress = 0; pyramidHits = new Set<number>(); pyramidDecision = null; busCards = []; busProgress = 0; busFailed = false; busLost = false; busFeedbackPending = false; busfahrerUsedCards = []
}

function alignPyramidOfferChoices() {
  const panel = gameRoot?.querySelector<HTMLElement>('.pyramid-panel')
  const offer = panel?.querySelector<HTMLElement>('.pyramid-offer')
  const noButton = offer?.querySelector<HTMLElement>('.pyramid-choice-no')
  const yesButton = offer?.querySelector<HTMLElement>('.pyramid-choice-yes')
  const secondRowCards = panel?.querySelectorAll<HTMLElement>('.pyramid-row:nth-child(2) .playing-card')
  if (!panel || !offer || !noButton || !yesButton || !secondRowCards?.length) return

  const panelRect = panel.getBoundingClientRect()
  const offerRect = offer.getBoundingClientRect()
  const firstCardRect = secondRowCards[0]!.getBoundingClientRect()
  const lastCardRect = secondRowCards[secondRowCards.length - 1]!.getBoundingClientRect()
  const panelStyle = window.getComputedStyle(panel)
  const innerLeft = panelRect.left + Number.parseFloat(panelStyle.borderLeftWidth)
  const innerRight = panelRect.right - Number.parseFloat(panelStyle.borderRightWidth)

  const noCenter = ((innerLeft + firstCardRect.left) / 2) - offerRect.left
  const yesCenter = ((lastCardRect.right + innerRight) / 2) - offerRect.left
  offer.style.setProperty('--pyramid-no-left', `${noCenter - (noButton.getBoundingClientRect().width / 2)}px`)
  offer.style.setProperty('--pyramid-yes-left', `${yesCenter - (yesButton.getBoundingClientRect().width / 2)}px`)
}

function renderGame() {
  if (!gameRoot) return
  const content = phase === 'player-intro' ? renderPlayerIntro() : phase === 'questions' ? renderQuestions() : phase === 'pyramid' ? renderPyramid() : phase === 'summary' ? renderSummary() : phase === 'final' ? renderSummary(true) : renderBus()
  gameRoot.innerHTML = `<div class="busfahrer-shell"><header class="busfahrer-header">
    <button class="back-button bus-back blobba-nav-action ipad-pwa-header-button" type="button" data-action="back">Beenden</button><div><p>BLOBBA präsentiert</p><h1>BLOBB-FAHRER</h1></div>
    <button class="restart-button blobba-nav-action ipad-pwa-header-button" type="button" data-action="restart">Neu starten</button></header>
    <p class="responsibility-note">Trink verantwortungsvoll. Dieses Spiel ist nur für Erwachsene.</p><div class="game-stage">${content}${phase === 'bus' ? busUsedCardsMarkup() : ''}${currentPlayerFooterMarkup()}</div></div>`
  gameRoot.querySelector('.responsibility-note')?.remove()
  alignPyramidOfferChoices()
  applyOnlineControls()
  publishState()
}

function applyOnlineControls() {
  if (!gameRoot || !onlineOptions.localPlayerId) return
  if (localCanControl()) return
  gameRoot.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (button.dataset.action === 'back') return
    button.disabled = true
  })
}

function handleClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.dataset.action === 'back') {
    playSound('ui-back')
    onlineOptions.onLeave?.()
    window.location.hash = ''
    return
  }
  if (!localCanControl()) return
  if (button.dataset.choice) answerQuestion(button.dataset.choice)
  if (button.dataset.busChoice) answerBus(button.dataset.busChoice)
  if (button.dataset.pyramidTarget) assignPyramidDrinks(Number(button.dataset.pyramidTarget))
  if (button.dataset.action === 'reveal-pyramid') revealPyramid()
  if (button.dataset.action === 'use-pyramid-card') { playActionSound('continue'); usePyramidCard() }
  if (button.dataset.action === 'keep-pyramid-card') { playActionSound('back'); keepPyramidCard() }
  if (button.dataset.action === 'finish-player-pyramid') finishPlayerPyramid()
  if (button.dataset.action === 'start-player-round') {
    playSound('player-change')
    phase = 'questions'
    feedback = { text: '', kind: 'info' }
    renderGame()
  }
  if (button.dataset.action === 'start-bus') startBus()
  if (button.dataset.action === 'show-final-summary') {
    playSound('game-finish')
    finalResult = `${currentPlayer().name} hat die BLOBB-FAHRER-Runde geschafft!`
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
  if (button.dataset.action === 'restart') {
    window.clearTimeout(advanceTimer)
    advanceTimer = undefined
    onlineOptions.onLeave?.()
    window.location.hash = onlineOptions.localPlayerId ? 'busfahrer-online' : 'busfahrer-offline'
  }
}

export function mountBusfahrer(root: HTMLElement, playerSetups: PlayerSetup[] = [{ name: 'Nick', avatar: '', avatarColor: '#dda15e' }], options: OnlineGameOptions = {}) {
  onlineOptions = options
  configuredPlayers = playerSetups.length ? playerSetups : [{ name: 'Nick', avatar: '', avatarColor: '#dda15e' }]
  gameRoot = root
  if (options.initialState) applyGameState(options.initialState)
  else resetGame()
  root.addEventListener('click', handleClick)
  window.addEventListener('resize', alignPyramidOfferChoices)
  renderGame()
  return () => { window.clearTimeout(advanceTimer); root.removeEventListener('click', handleClick); window.removeEventListener('resize', alignPyramidOfferChoices); gameRoot = null; onlineOptions = {} }
}
