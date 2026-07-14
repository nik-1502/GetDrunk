import './klatschen.css'
import { defaultProfileIconMarkup } from '../../profiles.ts'
import { playSound } from '../../audio/audioManager.ts'
import { klatschenCardMap, klatschenCards, type KlatschenCard } from './klatschenCards.ts'

export type KlatschenPlayerSetup = { id?: string; name: string; avatar: string; avatarColor: string }
export type KlatschenPlayer = KlatschenPlayerSetup & { id: string; drinks: number; heldCards: string[]; partnerPlayerId: string | null }
export type KlatschenPhase = 'rule' | 'turn' | 'card' | 'finished'

export type KlatschenGameState = {
  phase: KlatschenPhase
  players: KlatschenPlayer[]
  currentPlayerIndex: number
  deck: string[]
  drawIndex: number
  remainingSlots: number[]
  currentCardId: string | null
  drawnSlot: number | null
  selectedTargetIndex: number | null
  openedHeldCardId: string | null
  openedHeldCardOwnerId: string | null
}

type KlatschenOptions = {
  localPlayerId?: string
  initialState?: KlatschenGameState | null
  onStateChange?: (state: KlatschenGameState) => void
  onLeave?: () => void
}

let root: HTMLElement | null = null
let state: KlatschenGameState
let options: KlatschenOptions = {}
let revealTimer: number | undefined

function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target]!, result[index]!]
  }
  return result
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function createState(setups: KlatschenPlayerSetup[]): KlatschenGameState {
  const players = setups.map((player, index) => ({ ...player, id: player.id ?? `${index}-${player.name}`, drinks: 0, heldCards: [], partnerPlayerId: null }))
  const partnerCardCount = Math.floor(players.length / 2)
  const deck = klatschenCards.filter((card) => card.id !== 'clap-partner').map((card) => card.id)
  deck.push(...Array.from({ length: partnerCardCount }, () => 'clap-partner'))
  return {
    phase: 'rule',
    players,
    currentPlayerIndex: 0,
    deck: shuffle(deck),
    drawIndex: 0,
    remainingSlots: deck.map((_, index) => index),
    currentCardId: null,
    drawnSlot: null,
    selectedTargetIndex: null,
    openedHeldCardId: null,
    openedHeldCardOwnerId: null,
  }
}

function currentPlayer() {
  return state.players[state.currentPlayerIndex]!
}

function canControl() {
  return !options.localPlayerId || currentPlayer().id === options.localPlayerId
}

function avatarMarkup(player: KlatschenPlayer, className = 'klatschen-avatar') {
  const avatar = player.avatar ? `<img src="${player.avatar}" alt="Profilbild von ${escapeHtml(player.name)}">` : defaultProfileIconMarkup()
  return `<span class="${className} ${player.avatar ? '' : 'is-default'}" style="--avatar-ring:${player.avatarColor}">${avatar}</span>`
}

function publish() {
  options.onStateChange?.(structuredClone(state))
}

function cardBackMarkup(slot: number) {
  const angle = (slot / state.deck.length) * 360
  const present = state.remainingSlots.includes(slot)
  return `<div class="klatschen-circle-slot ${present ? '' : 'is-empty'}" style="--slot-angle:${angle}deg" aria-hidden="${present ? 'false' : 'true'}">${present ? `<div class="klatschen-card-back"><span><i>B</i>B</span></div>` : ''}</div>`
}

function circleMarkup() {
  return `<div class="klatschen-card-circle" aria-label="Kartenkreis">${state.deck.map((_, slot) => cardBackMarkup(slot)).join('')}</div>`
}

function playerTurnMarkup() {
  const player = currentPlayer()
  const nameSizeClass = player.name.length > 18 ? 'is-very-long' : player.name.length > 11 ? 'is-long' : ''
  return `<div class="klatschen-turn" style="--current-player-color:${player.avatarColor}">${avatarMarkup(player)}<strong class="${nameSizeClass}">${escapeHtml(player.name)}</strong></div>`
}

function heldCardLabel(card: KlatschenCard) {
  if (card.title === 'Nasen-Blobb') return 'Nasen...'
  if (card.title === 'Daumen-Blobb') return 'Daumen...'
  if (card.title === 'Fragenmeister') return 'Regel...'
  if (card.title === 'Doppel-Blobb') return 'Doppel...'
  return card.title
}

function heldCardsMarkup() {
  const cards: string[] = []
  state.players.forEach((player) => {
    const stacks = player.heldCards.reduce<Array<{ card: KlatschenCard; count: number }>>((result, cardId) => {
      const card = klatschenCardMap.get(cardId)
      if (!card || card.id === 'clap-partner') return result
      const stack = result.find((item) => item.card.title === card.title)
      if (stack) stack.count += 1
      else result.push({ card, count: 1 })
      return result
    }, [])
    stacks.forEach(({ card, count }) => {
      cards.push(`<button type="button" class="klatschen-held-preview" data-klatschen-held="${escapeHtml(card.id)}" data-klatschen-owner="${escapeHtml(player.id)}">${count > 1 ? `<b class="klatschen-held-count" aria-label="${count} Karten">${count}</b>` : ''}<span>${card.symbol}</span><strong>${escapeHtml(heldCardLabel(card))}</strong></button>`)
    })
  })
  const renderedPairs = new Set<string>()
  state.players.forEach((player) => {
    const partner = player.partnerPlayerId ? state.players.find((item) => item.id === player.partnerPlayerId) : undefined
    if (!partner) return
    const pairKey = [player.id, partner.id].sort().join('|')
    if (renderedPairs.has(pairKey)) return
    renderedPairs.add(pairKey)
    cards.push(`<button type="button" class="klatschen-held-preview" data-klatschen-held="partner-status" data-klatschen-owner="${escapeHtml(player.id)}"><span>🤝</span><strong>Blobb-Partner</strong></button>`)
  })
  if (!cards.length) return ''
  return `<section class="klatschen-held-cards" aria-label="Aktive Blobb-Karten und Zustände"><div>${cards.join('')}</div></section>`
}

function heldCardDialogMarkup() {
  const cardId = state.openedHeldCardId === 'partner-status' ? 'clap-partner' : state.openedHeldCardId
  const card = cardId ? klatschenCardMap.get(cardId) : undefined
  if (!card) return ''
  return `<div class="klatschen-held-dialog-backdrop" data-klatschen-action="cancel-held"><article class="klatschen-held-dialog" role="dialog" aria-modal="true" aria-labelledby="held-card-title"><h2 id="held-card-title">Blobb-Karte entfernen?</h2><span>${card.symbol}</span><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description)}</p><div><button class="game-button klatschen-cancel-remove" data-klatschen-action="cancel-held">Nein</button><button class="game-button primary" data-klatschen-action="remove-held">Ja</button></div></article></div>`
}

function renderRule() {
  return `<section class="klatschen-rule-screen"><p class="eyebrow">Grundregel</p><h2>Ab jetzt darf das Wort „trinken“ nicht mehr gesagt werden.</h2><p>Stattdessen muss immer <strong>„blobben“</strong> gesagt werden.</p><button class="game-button primary" data-klatschen-action="start">Verstanden – Spiel starten</button></section>`
}

function renderTurn() {
  return `<section class="klatschen-play-screen">${circleMarkup()}<div class="klatschen-center-controls">${playerTurnMarkup()}<button class="game-button primary klatschen-draw-button" data-klatschen-action="draw">Nächste Karte ziehen</button></div>${heldCardsMarkup()}${heldCardDialogMarkup()}</section>`
}

function drawnCardMarkup(card: KlatschenCard) {
  const angle = ((state.drawnSlot ?? 0) / state.deck.length) * 360
  return `<article class="klatschen-drawn-card" style="--draw-angle:${angle}deg;--draw-counter-angle:${-angle}deg"><div class="klatschen-drawn-inner"><div class="klatschen-drawn-back"><span><i>B</i>B</span></div><div class="klatschen-drawn-front"><h2>${escapeHtml(card.title)}</h2><span class="klatschen-card-symbol" aria-hidden="true">${card.symbol}</span><p>${escapeHtml(card.description)}</p>${card.suggestedRule ? `<small>Vorschlag: ${escapeHtml(card.suggestedRule)}</small>` : ''}${card.amount ? `<strong class="klatschen-amount">${card.amount} Schluck${card.amount === 1 ? '' : 'e'}</strong>` : ''}</div></div></article>`
}

function needsTarget(card: KlatschenCard) {
  return card.id === 'clap-partner' && state.players.length > 1
}

function targetMarkup(card: KlatschenCard) {
  if (!needsTarget(card)) return ''
  return `<div class="klatschen-targets" aria-label="Spieler auswählen">${state.players.map((player, index) => `<button class="game-button klatschen-target ${state.selectedTargetIndex === index ? 'is-selected' : ''}" data-klatschen-target="${index}" ${card.id === 'clap-partner' && index === state.currentPlayerIndex ? 'disabled' : ''}>${avatarMarkup(player)}<span>${escapeHtml(player.name)}</span></button>`).join('')}</div>`
}

function renderCard() {
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (!card) return renderTurn()
  const actionPending = needsTarget(card) && state.selectedTargetIndex === null
  return `<section class="klatschen-card-screen">${circleMarkup()}${drawnCardMarkup(card)}${heldCardsMarkup()}${heldCardDialogMarkup()}<div class="klatschen-card-actions">${targetMarkup(card)}</div><button class="game-button primary klatschen-next-button" data-klatschen-action="next" ${actionPending ? 'disabled' : ''}>Weiter</button></section>`
}

function renderFinished() {
  const sorted = [...state.players].sort((left, right) => right.drinks - left.drinks)
  return `<section class="klatschen-summary"><h2>Alle Karten wurden gezogen</h2><div class="klatschen-stats">${sorted.map((player) => `<div>${avatarMarkup(player)}<strong>${escapeHtml(player.name)}</strong><span>${player.drinks} Schluck${player.drinks === 1 ? '' : 'e'}</span></div>`).join('')}</div><div class="klatschen-summary-actions"><button class="game-button primary ipad-pwa-end-button" data-klatschen-action="exit">Beenden</button><button class="game-button primary ipad-pwa-end-button" data-klatschen-action="restart">Neustarten</button></div></section>`
}

function addDrinks(playerIndex: number, amount: number, includePartner = true) {
  const player = state.players[playerIndex]
  if (!player || amount <= 0) return
  player.drinks += amount
  if (!includePartner || !player.partnerPlayerId) return
  const partnerIndex = state.players.findIndex((item) => item.id === player.partnerPlayerId)
  if (partnerIndex >= 0 && partnerIndex !== playerIndex) state.players[partnerIndex]!.drinks += amount
}

function clearPartnership(player: KlatschenPlayer) {
  if (!player.partnerPlayerId) return
  const partner = state.players.find((item) => item.id === player.partnerPlayerId)
  player.heldCards = player.heldCards.filter((cardId) => cardId !== 'clap-partner')
  if (partner?.partnerPlayerId === player.id) {
    partner.partnerPlayerId = null
    partner.heldCards = partner.heldCards.filter((cardId) => cardId !== 'clap-partner')
  }
  player.partnerPlayerId = null
}

function applyAutomaticDrinks(card: KlatschenCard) {
  const amount = card.amount ?? 0
  if (card.type === 'drink-self') addDrinks(state.currentPlayerIndex, amount)
  if (card.id === 'all-1') state.players.forEach((_, index) => { addDrinks(index, amount) })
  if (card.id === 'all-except') state.players.forEach((_, index) => { if (index !== state.currentPlayerIndex) addDrinks(index, amount) })
  if (card.id === 'left') addDrinks((state.currentPlayerIndex - 1 + state.players.length) % state.players.length, amount)
  if (card.id === 'right') addDrinks((state.currentPlayerIndex + 1) % state.players.length, amount)
  if (card.exclusiveRole) {
    const existingOwner = state.players.find((player) => player.heldCards.some((cardId) => klatschenCardMap.get(cardId)?.exclusiveRole === card.exclusiveRole))
    if (existingOwner?.id === currentPlayer().id) return
    state.players.forEach((player) => {
      player.heldCards = player.heldCards.filter((cardId) => klatschenCardMap.get(cardId)?.exclusiveRole !== card.exclusiveRole)
    })
    currentPlayer().heldCards.push(card.id)
    return
  }
  if (card.id !== 'clap-partner' && (card.type === 'collectible-action' || card.keepUntilUsed)) currentPlayer().heldCards.push(card.id)
}

function drawCard() {
  if (!canControl() || state.phase !== 'turn' || !state.remainingSlots.length) return
  const slotPosition = Math.floor(Math.random() * state.remainingSlots.length)
  state.drawnSlot = state.remainingSlots[slotPosition]!
  state.remainingSlots.splice(slotPosition, 1)
  state.currentCardId = state.deck[state.drawIndex++] ?? null
  state.selectedTargetIndex = null
  state.phase = 'card'
  const heldCardCount = currentPlayer().heldCards.length
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (card) applyAutomaticDrinks(card)
  playSound('card-draw')
  window.setTimeout(() => playSound('card-flip'), 640)
  if (currentPlayer().heldCards.length > heldCardCount) window.setTimeout(() => playSound('collect-card'), 900)
  render()
  publish()
}

function selectTarget(index: number) {
  if (!canControl() || state.phase !== 'card' || state.selectedTargetIndex !== null || !state.players[index]) return
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (!card || !needsTarget(card)) return
  if (card.id === 'clap-partner' && index === state.currentPlayerIndex) return
  state.selectedTargetIndex = index
  const owner = currentPlayer()
  const partner = state.players[index]!
  clearPartnership(owner)
  clearPartnership(partner)
  owner.partnerPlayerId = partner.id
  partner.partnerPlayerId = owner.id
  owner.heldCards.push('clap-partner')
  render()
  publish()
}

function nextTurn() {
  if (!canControl() || state.phase !== 'card') return
  if (!state.remainingSlots.length) {
    state.phase = 'finished'
    playSound('game-finish')
  }
  else {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
    state.phase = 'turn'
    playSound('player-change')
  }
  state.currentCardId = null
  state.drawnSlot = null
  state.selectedTargetIndex = null
  render()
  publish()
}

function handleClick(event: Event) {
  const target = event.target as HTMLElement
  if (target.classList.contains('klatschen-held-dialog-backdrop')) {
    state.openedHeldCardId = null
    state.openedHeldCardOwnerId = null
    render(); publish(); return
  }
  const button = target.closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.dataset.klatschenHeld) {
    const owner = state.players.find((player) => player.id === button.dataset.klatschenOwner)
    const isPartnerStatus = button.dataset.klatschenHeld === 'partner-status' && Boolean(owner?.partnerPlayerId)
    if (!canControl() || !owner || (!isPartnerStatus && !owner.heldCards.includes(button.dataset.klatschenHeld))) return
    state.openedHeldCardId = button.dataset.klatschenHeld
    state.openedHeldCardOwnerId = owner.id
    render(); publish(); return
  }
  if (button.dataset.klatschenTarget !== undefined) return selectTarget(Number(button.dataset.klatschenTarget))
  const action = button.dataset.klatschenAction
  if (action === 'start' && canControl()) { playSound('game-start'); state.phase = 'turn'; render(); publish() }
  if (action === 'draw') drawCard()
  if (action === 'next') nextTurn()
  if (action === 'cancel-held') { state.openedHeldCardId = null; state.openedHeldCardOwnerId = null; render(); publish() }
  if (action === 'remove-held' && canControl() && state.openedHeldCardId) {
    const owner = state.players.find((player) => player.id === state.openedHeldCardOwnerId)
    if (!owner) return
    const cardId = state.openedHeldCardId === 'partner-status' ? 'clap-partner' : state.openedHeldCardId
    if (cardId === 'clap-partner') {
      clearPartnership(owner)
    } else {
      const heldCardIndex = owner.heldCards.indexOf(cardId)
      if (heldCardIndex >= 0) owner.heldCards.splice(heldCardIndex, 1)
    }
    state.openedHeldCardId = null
    state.openedHeldCardOwnerId = null
    playSound('remove-card')
    render(); publish()
  }
  if (action === 'restart') { playSound('ui-back'); options.onLeave?.(); window.location.hash = 'klatschen-menu' }
  if (action === 'exit') { playSound('ui-back'); options.onLeave?.(); window.location.hash = '' }
  if (button.dataset.action === 'back') { playSound('ui-back'); options.onLeave?.(); window.location.hash = '' }
}

function applyControls() {
  if (!options.localPlayerId || canControl()) return
  root?.querySelectorAll<HTMLButtonElement>('[data-klatschen-action], [data-klatschen-target], [data-klatschen-held]').forEach((button) => { button.disabled = true })
}

function positionDrawAnimation() {
  if (!root || state.phase !== 'card' || state.drawnSlot === null) return
  const source = root.querySelectorAll<HTMLElement>('.klatschen-circle-slot')[state.drawnSlot]
  const drawn = root.querySelector<HTMLElement>('.klatschen-drawn-card')
  if (!source || !drawn) return
  const sourceRect = source.getBoundingClientRect()
  const drawnRect = drawn.getBoundingClientRect()
  drawn.style.setProperty('--draw-x', `${sourceRect.left + (sourceRect.width / 2) - drawnRect.left - (drawnRect.width / 2)}px`)
  drawn.style.setProperty('--draw-y', `${sourceRect.top + (sourceRect.height / 2) - drawnRect.top - (drawnRect.height / 2)}px`)
  const scale = sourceRect.width / drawnRect.width
  drawn.style.setProperty('--draw-scale', `${scale}`)
  drawn.style.setProperty('--draw-lift-scale', `${scale * 1.12}`)
}

function fitCurrentPlayerDisplay() {
  const display = root?.querySelector<HTMLElement>('.klatschen-turn')
  const name = display?.querySelector<HTMLElement>(':scope > strong')
  if (!display || !name) return

  name.style.removeProperty('font-size')

  const nameFontSize = Number.parseFloat(window.getComputedStyle(name).fontSize)
  const contentWidth = name.scrollWidth
  const availableWidth = display.clientWidth
  if (!contentWidth || contentWidth <= availableWidth) return

  const scale = (availableWidth / contentWidth) * .98
  name.style.fontSize = `${nameFontSize * scale}px`
}

function positionMiddleLayout() {
  const screen = root?.querySelector<HTMLElement>('.klatschen-play-screen')
  const turn = screen?.querySelector<HTMLElement>('.klatschen-turn')
  const avatar = turn?.querySelector<HTMLElement>(':scope > .klatschen-avatar')
  const name = turn?.querySelector<HTMLElement>(':scope > strong')
  const drawButton = screen?.querySelector<HTMLElement>('.klatschen-draw-button')
  const slots = screen?.querySelectorAll<HTMLElement>('.klatschen-circle-slot')
  if (!screen || !turn || !avatar || !name || !drawButton || !slots?.length) return

  avatar.style.removeProperty('width')
  avatar.style.removeProperty('height')
  const screenRect = screen.getBoundingClientRect()
  const slotRects = [...slots].map((slot) => slot.getBoundingClientRect())
  const circleTop = Math.min(...slotRects.map((rect) => rect.top))
  const circleBottom = Math.max(...slotRects.map((rect) => rect.bottom))

  const turnStyle = window.getComputedStyle(turn)
  const turnGap = Number.parseFloat(turnStyle.rowGap || turnStyle.gap) || 0
  const naturalAvatarSize = avatar.getBoundingClientRect().width
  const previousNaturalAvatarSize = naturalAvatarSize / .8
  const freeCircleDiameter = turn.clientWidth
  const maximumPreviousAvatarSize = Math.max(34, freeCircleDiameter - name.getBoundingClientRect().height - turnGap - 12)
  const previousAvatarSize = Math.min(previousNaturalAvatarSize, maximumPreviousAvatarSize)
  const avatarSize = previousAvatarSize * .8
  avatar.style.width = `${avatarSize}px`
  avatar.style.height = `${avatarSize}px`

  const circleCenter = ((circleTop + circleBottom) / 2) - screenRect.top
  const previousTurnHeight = turn.getBoundingClientRect().height + (previousAvatarSize - avatarSize)
  const turnTop = circleCenter - (previousTurnHeight / 2)
  turn.style.top = `${turnTop}px`

  const freeBottomTop = Math.min(screenRect.bottom, circleBottom)
  const buttonHeight = drawButton.getBoundingClientRect().height
  const buttonTop = ((freeBottomTop + screenRect.bottom) / 2) - screenRect.top - (buttonHeight / 2) - (buttonHeight * .4)
  drawButton.style.top = `${buttonTop}px`
  positionHeldCards(screen, circleTop)
}

function positionHeldCards(screen: HTMLElement, circleTop: number) {
  const heldCards = screen.querySelector<HTMLElement>('.klatschen-held-cards')
  if (!heldCards) return
  const screenTop = screen.getBoundingClientRect().top
  heldCards.style.maxHeight = `${Math.max(0, circleTop - screenTop - 16)}px`
}

function positionNextButton() {
  const screen = root?.querySelector<HTMLElement>('.klatschen-card-screen')
  const nextButton = root?.querySelector<HTMLElement>('.klatschen-next-button')
  const slots = screen?.querySelectorAll<HTMLElement>('.klatschen-circle-slot')
  if (!screen || !nextButton || !slots?.length) return
  const screenRect = screen.getBoundingClientRect()
  const circleBottom = Math.max(...[...slots].map((slot) => slot.getBoundingClientRect().bottom))
  const circleTop = Math.min(...[...slots].map((slot) => slot.getBoundingClientRect().top))
  const freeBottomTop = Math.min(screenRect.bottom, circleBottom)
  const buttonHeight = nextButton.getBoundingClientRect().height
  const buttonTop = ((freeBottomTop + screenRect.bottom) / 2) - screenRect.top - (buttonHeight / 2) - (buttonHeight * .4)
  nextButton.style.top = `${buttonTop}px`
  positionHeldCards(screen, circleTop)
}

function updateMiddleLayout() {
  fitCurrentPlayerDisplay()
  positionMiddleLayout()
  positionNextButton()
}

function removeRevealedCardBack() {
  window.clearTimeout(revealTimer)
  if (state.phase !== 'card') return
  revealTimer = window.setTimeout(() => {
    root?.querySelector('.klatschen-drawn-back')?.remove()
  }, 900)
}

function render() {
  if (!root) return
  const content = state.phase === 'rule' ? renderRule() : state.phase === 'turn' ? renderTurn() : state.phase === 'card' ? renderCard() : renderFinished()
  root.innerHTML = `<div class="busfahrer-shell klatschen-shell"><header class="busfahrer-header"><button class="back-button bus-back ipad-pwa-header-button" type="button" data-action="back">Beenden</button><div><p>GetDrunk präsentiert</p><h1>BLOBBEN</h1></div><button class="restart-button ipad-pwa-header-button" type="button" data-klatschen-action="restart">Neu starten</button></header><div class="klatschen-global-rule">Sag nicht „trinken“ – sag „blobben“.</div><div class="klatschen-stage">${content}</div></div>`
  updateMiddleLayout()
  positionDrawAnimation()
  removeRevealedCardBack()
  applyControls()
}

export function getKlatschenState() {
  return structuredClone(state)
}

export function applyKlatschenState(nextState: KlatschenGameState) {
  const previous = root ? structuredClone(state) : null
  state = structuredClone(nextState)
  state.players.forEach((player) => {
    player.heldCards ??= []
    player.partnerPlayerId ??= null
  })
  state.openedHeldCardId ??= null
  state.openedHeldCardOwnerId ??= null
  render()
  if (!previous) return
  if (state.drawIndex > previous.drawIndex) {
    playSound('card-draw')
    window.setTimeout(() => playSound('card-flip'), 640)
  }
  const heldCount = state.players.reduce((sum, player) => sum + player.heldCards.length, 0)
  const previousHeldCount = previous.players.reduce((sum, player) => sum + player.heldCards.length, 0)
  if (heldCount > previousHeldCount) playSound('collect-card')
  if (state.currentPlayerIndex !== previous.currentPlayerIndex) playSound('player-change')
  if (state.phase === 'finished' && previous.phase !== 'finished') playSound('game-finish')
}

export function mountKlatschen(target: HTMLElement, players: KlatschenPlayerSetup[], gameOptions: KlatschenOptions = {}) {
  root = target
  options = gameOptions
  state = gameOptions.initialState ? structuredClone(gameOptions.initialState) : createState(players)
  state.players.forEach((player) => {
    player.heldCards ??= []
    player.partnerPlayerId ??= null
  })
  state.openedHeldCardId ??= null
  state.openedHeldCardOwnerId ??= null
  root.addEventListener('click', handleClick)
  window.addEventListener('resize', updateMiddleLayout)
  render()
  return () => { window.clearTimeout(revealTimer); root?.removeEventListener('click', handleClick); window.removeEventListener('resize', updateMiddleLayout); root = null; options = {} }
}
