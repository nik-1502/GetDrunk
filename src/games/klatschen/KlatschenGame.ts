import './klatschen.css'
import { defaultProfileIconMarkup } from '../../profiles.ts'
import { klatschenCardMap, klatschenCards, type KlatschenCard } from './klatschenCards.ts'

export type KlatschenPlayerSetup = { id?: string; name: string; avatar: string; avatarColor: string }
export type KlatschenPlayer = KlatschenPlayerSetup & { id: string; drinks: number; heldCards: string[]; partnerPlayerId: string | null; activeRuleLabels: Record<string, string> }
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
  selectedRuleMode: 'own' | 'suggested' | null
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
  const players = setups.map((player, index) => ({ ...player, id: player.id ?? `${index}-${player.name}`, drinks: 0, heldCards: [], partnerPlayerId: null, activeRuleLabels: {} }))
  return {
    phase: 'rule',
    players,
    currentPlayerIndex: 0,
    deck: shuffle(klatschenCards.map((card) => card.id)),
    drawIndex: 0,
    remainingSlots: klatschenCards.map((_, index) => index),
    currentCardId: null,
    drawnSlot: null,
    selectedTargetIndex: null,
    openedHeldCardId: null,
    selectedRuleMode: null,
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
  const angle = (slot / klatschenCards.length) * 360
  const present = state.remainingSlots.includes(slot)
  return `<div class="klatschen-circle-slot ${present ? '' : 'is-empty'}" style="--slot-angle:${angle}deg" aria-hidden="${present ? 'false' : 'true'}">${present ? `<div class="klatschen-card-back"><span><i>B</i>B</span></div>` : ''}</div>`
}

function circleMarkup() {
  return `<div class="klatschen-card-circle" aria-label="Kartenkreis">${klatschenCards.map((_, slot) => cardBackMarkup(slot)).join('')}</div>`
}

function playerTurnMarkup() {
  const player = currentPlayer()
  const nameSizeClass = player.name.length > 18 ? 'is-very-long' : player.name.length > 11 ? 'is-long' : ''
  return `<div class="klatschen-turn" style="--current-player-color:${player.avatarColor}">${avatarMarkup(player)}<strong class="${nameSizeClass}">${escapeHtml(player.name)}</strong></div>`
}

function heldCardsMarkup() {
  const player = currentPlayer()
  if (!canControl() || (!player.heldCards.length && !player.partnerPlayerId)) return ''
  const partner = player.partnerPlayerId ? state.players.find((item) => item.id === player.partnerPlayerId) : undefined
  const partnerStatus = partner && !player.heldCards.includes('clap-partner')
    ? `<button type="button" class="klatschen-held-preview" data-klatschen-held="partner-status">${avatarMarkup(partner, 'klatschen-status-avatar')}<strong>Blobb-Partner</strong><small>Verbunden mit ${escapeHtml(partner.name)}</small></button>`
    : ''
  return `<section class="klatschen-held-cards" aria-label="Aktive Blobb-Karten und Zustände"><h2>Deine aktiven Blobb-Karten</h2><div>${player.heldCards.map((cardId) => {
    const card = klatschenCardMap.get(cardId)
    if (!card) return ''
    const partnerName = card.id === 'clap-partner' && partner ? `Verbunden mit ${escapeHtml(partner.name)}` : ''
    const ruleLabel = player.activeRuleLabels[card.id] ? escapeHtml(player.activeRuleLabels[card.id]!) : ''
    return `<button type="button" class="klatschen-held-preview" data-klatschen-held="${escapeHtml(card.id)}"><span>${card.symbol}</span><strong>${escapeHtml(card.title)}</strong>${partnerName || ruleLabel ? `<small>${partnerName || ruleLabel}</small>` : ''}</button>`
  }).join('')}${partnerStatus}</div></section>`
}

function heldCardDialogMarkup() {
  const cardId = state.openedHeldCardId === 'partner-status' ? 'clap-partner' : state.openedHeldCardId
  const card = cardId ? klatschenCardMap.get(cardId) : undefined
  if (!card) return ''
  const rule = currentPlayer().activeRuleLabels[card.id]
  return `<div class="klatschen-held-dialog-backdrop" data-klatschen-action="cancel-held"><article class="klatschen-held-dialog" role="dialog" aria-modal="true" aria-labelledby="held-card-title"><h2 id="held-card-title">Blobb-Karte entfernen?</h2><span>${card.symbol}</span><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(rule ?? card.description)}</p><div><button class="game-button" data-klatschen-action="cancel-held">Nein</button><button class="game-button primary" data-klatschen-action="remove-held">Ja</button></div></article></div>`
}

function renderRule() {
  return `<section class="klatschen-rule-screen"><p class="eyebrow">Grundregel</p><h2>Ab jetzt darf das Wort „trinken“ nicht mehr gesagt werden.</h2><p>Stattdessen muss immer <strong>„blobben“</strong> gesagt werden.</p><button class="game-button primary" data-klatschen-action="start">Verstanden – Spiel starten</button></section>`
}

function renderTurn() {
  return `<section class="klatschen-play-screen">${circleMarkup()}<div class="klatschen-center-controls">${playerTurnMarkup()}<button class="game-button primary klatschen-draw-button" data-klatschen-action="draw">Karte ziehen</button></div>${heldCardsMarkup()}${heldCardDialogMarkup()}</section>`
}

function drawnCardMarkup(card: KlatschenCard) {
  const angle = ((state.drawnSlot ?? 0) / klatschenCards.length) * 360
  return `<article class="klatschen-drawn-card" style="--draw-angle:${angle}deg;--draw-counter-angle:${-angle}deg"><div class="klatschen-drawn-inner"><div class="klatschen-drawn-back"><span><i>B</i>B</span></div><div class="klatschen-drawn-front"><h2>${escapeHtml(card.title)}</h2><span class="klatschen-card-symbol" aria-hidden="true">${card.symbol}</span><p>${escapeHtml(card.description)}</p>${card.suggestedRule ? `<small>Vorschlag: ${escapeHtml(card.suggestedRule)}</small>` : ''}${card.amount ? `<strong class="klatschen-amount">${card.amount} Schluck${card.amount === 1 ? '' : 'e'}</strong>` : ''}</div></div></article>`
}

function needsTarget(card: KlatschenCard) {
  return card.type === 'choose-player' || card.type === 'distribute' || (card.id === 'clap-partner' && state.players.length > 1)
}

function targetMarkup(card: KlatschenCard) {
  if (!needsTarget(card)) return ''
  return `<div class="klatschen-targets" aria-label="Spieler auswählen">${state.players.map((player, index) => `<button class="game-button klatschen-target ${state.selectedTargetIndex === index ? 'is-selected' : ''}" data-klatschen-target="${index}" ${card.id === 'clap-partner' && index === state.currentPlayerIndex ? 'disabled' : ''}>${avatarMarkup(player)}<span>${escapeHtml(player.name)}</span></button>`).join('')}</div>`
}

function ruleChoiceMarkup(card: KlatschenCard) {
  if (card.type !== 'temporary-rule') return ''
  return `<div class="klatschen-rule-choices"><button class="game-button ${state.selectedRuleMode === 'own' ? 'is-selected' : ''}" data-klatschen-rule="own">Eigene Regel wählen</button><button class="game-button ${state.selectedRuleMode === 'suggested' ? 'is-selected' : ''}" data-klatschen-rule="suggested">Vorgeschlagene Regel verwenden</button><p>Vorschlag: ${escapeHtml(card.suggestedRule ?? '')}</p></div>`
}

function renderCard() {
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (!card) return renderTurn()
  const actionPending = (needsTarget(card) && state.selectedTargetIndex === null) || (card.type === 'temporary-rule' && state.selectedRuleMode === null)
  return `<section class="klatschen-card-screen">${circleMarkup()}${drawnCardMarkup(card)}<div class="klatschen-card-actions">${targetMarkup(card)}${ruleChoiceMarkup(card)}<div class="klatschen-standard-actions"><button class="game-button primary klatschen-next-button" data-klatschen-action="next" ${actionPending ? 'disabled' : ''}>Weiter</button></div></div></section>`
}

function renderFinished() {
  const sorted = [...state.players].sort((left, right) => right.drinks - left.drinks)
  return `<section class="klatschen-summary"><h2>Alle Karten wurden gezogen</h2><div class="klatschen-stats">${sorted.map((player) => `<div>${avatarMarkup(player)}<strong>${escapeHtml(player.name)}</strong><span>${player.drinks} Schluck${player.drinks === 1 ? '' : 'e'}</span></div>`).join('')}</div><div class="klatschen-summary-actions"><button class="game-button primary" data-klatschen-action="restart">Neustarten</button><button class="game-button" data-klatschen-action="exit">Beenden</button></div></section>`
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
  if (partner?.partnerPlayerId === player.id) partner.partnerPlayerId = null
  player.partnerPlayerId = null
}

function applyAutomaticDrinks(card: KlatschenCard) {
  const amount = card.amount ?? 0
  if (card.type === 'drink-self') addDrinks(state.currentPlayerIndex, amount)
  if (card.id === 'all-1') state.players.forEach((_, index) => { addDrinks(index, amount) })
  if (card.id === 'all-except') state.players.forEach((_, index) => { if (index !== state.currentPlayerIndex) addDrinks(index, amount) })
  if (card.id === 'left') addDrinks((state.currentPlayerIndex - 1 + state.players.length) % state.players.length, amount)
  if (card.id === 'right') addDrinks((state.currentPlayerIndex + 1) % state.players.length, amount)
  if ((card.type === 'collectible-action' || card.keepUntilUsed) && !currentPlayer().heldCards.includes(card.id)) currentPlayer().heldCards.push(card.id)
}

function drawCard() {
  if (!canControl() || state.phase !== 'turn' || !state.remainingSlots.length) return
  const slotPosition = Math.floor(Math.random() * state.remainingSlots.length)
  state.drawnSlot = state.remainingSlots[slotPosition]!
  state.remainingSlots.splice(slotPosition, 1)
  state.currentCardId = state.deck[state.drawIndex++] ?? null
  state.selectedTargetIndex = null
  state.selectedRuleMode = null
  state.phase = 'card'
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (card) applyAutomaticDrinks(card)
  render()
  publish()
}

function selectTarget(index: number) {
  if (!canControl() || state.phase !== 'card' || state.selectedTargetIndex !== null || !state.players[index]) return
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (!card || !needsTarget(card)) return
  if (card.id === 'clap-partner' && index === state.currentPlayerIndex) return
  state.selectedTargetIndex = index
  if (card.id === 'clap-partner') {
    const owner = currentPlayer()
    const partner = state.players[index]!
    clearPartnership(owner)
    clearPartnership(partner)
    owner.partnerPlayerId = partner.id
    partner.partnerPlayerId = owner.id
  } else addDrinks(index, card.amount ?? 0)
  render()
  publish()
}

function selectRule(mode: 'own' | 'suggested') {
  if (!canControl() || state.phase !== 'card' || state.selectedRuleMode !== null) return
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (!card || card.type !== 'temporary-rule') return
  state.selectedRuleMode = mode
  if (!currentPlayer().heldCards.includes(card.id)) currentPlayer().heldCards.push(card.id)
  currentPlayer().activeRuleLabels[card.id] = mode === 'own' ? 'Eigene Blobb-Regel aktiv' : (card.suggestedRule ?? 'Vorgeschlagene Blobb-Regel aktiv')
  render()
  publish()
}

function nextTurn() {
  if (!canControl() || state.phase !== 'card') return
  if (!state.remainingSlots.length) state.phase = 'finished'
  else {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
    state.phase = 'turn'
  }
  state.currentCardId = null
  state.drawnSlot = null
  state.selectedTargetIndex = null
  state.selectedRuleMode = null
  render()
  publish()
}

function handleClick(event: Event) {
  const target = event.target as HTMLElement
  if (target.classList.contains('klatschen-held-dialog-backdrop')) {
    state.openedHeldCardId = null
    render(); publish(); return
  }
  const button = target.closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.dataset.klatschenHeld) {
    const isPartnerStatus = button.dataset.klatschenHeld === 'partner-status' && Boolean(currentPlayer().partnerPlayerId)
    if (!canControl() || (!isPartnerStatus && !currentPlayer().heldCards.includes(button.dataset.klatschenHeld))) return
    state.openedHeldCardId = button.dataset.klatschenHeld
    render(); publish(); return
  }
  if (button.dataset.klatschenTarget !== undefined) return selectTarget(Number(button.dataset.klatschenTarget))
  if (button.dataset.klatschenRule === 'own' || button.dataset.klatschenRule === 'suggested') return selectRule(button.dataset.klatschenRule)
  const action = button.dataset.klatschenAction
  if (action === 'start' && canControl()) { state.phase = 'turn'; render(); publish() }
  if (action === 'draw') drawCard()
  if (action === 'next') nextTurn()
  if (action === 'cancel-held') { state.openedHeldCardId = null; render(); publish() }
  if (action === 'remove-held' && canControl() && state.openedHeldCardId) {
    const cardId = state.openedHeldCardId === 'partner-status' ? 'clap-partner' : state.openedHeldCardId
    if (cardId === 'clap-partner') {
      clearPartnership(currentPlayer())
      state.players.forEach((player) => { player.heldCards = player.heldCards.filter((heldCardId) => heldCardId !== 'clap-partner') })
    } else {
      currentPlayer().heldCards = currentPlayer().heldCards.filter((heldCardId) => heldCardId !== cardId)
      delete currentPlayer().activeRuleLabels[cardId]
    }
    state.openedHeldCardId = null
    render(); publish()
  }
  if (action === 'restart') { options.onLeave?.(); window.location.hash = 'klatschen-menu' }
  if (action === 'exit') { options.onLeave?.(); window.location.hash = '' }
  if (button.dataset.action === 'back') { options.onLeave?.(); window.location.hash = '' }
}

function applyControls() {
  if (!options.localPlayerId || canControl()) return
  root?.querySelectorAll<HTMLButtonElement>('[data-klatschen-action], [data-klatschen-target], [data-klatschen-rule], [data-klatschen-held]').forEach((button) => { button.disabled = true })
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
  const buttonTop = ((freeBottomTop + screenRect.bottom) / 2) - screenRect.top - (drawButton.getBoundingClientRect().height / 2)
  drawButton.style.top = `${buttonTop}px`
}

function updateMiddleLayout() {
  fitCurrentPlayerDisplay()
  positionMiddleLayout()
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
  root.innerHTML = `<div class="busfahrer-shell klatschen-shell"><header class="busfahrer-header"><button class="back-button bus-back" type="button" data-action="back">Beenden</button><div><p>GetDrunk präsentiert</p><h1>BLOBBEN</h1></div><button class="restart-button" type="button" data-klatschen-action="restart">Neu starten</button></header><div class="klatschen-global-rule">Sag nicht „trinken“ – sag „blobben“.</div><div class="klatschen-stage">${content}</div></div>`
  updateMiddleLayout()
  positionDrawAnimation()
  removeRevealedCardBack()
  applyControls()
}

export function getKlatschenState() {
  return structuredClone(state)
}

export function applyKlatschenState(nextState: KlatschenGameState) {
  state = structuredClone(nextState)
  state.players.forEach((player) => {
    player.heldCards ??= []
    player.partnerPlayerId ??= null
    player.activeRuleLabels ??= {}
    Object.entries(player.activeRuleLabels).forEach(([cardId, label]) => {
      if (label === 'Eigene Regel aktiv') player.activeRuleLabels[cardId] = 'Eigene Blobb-Regel aktiv'
      if (label === 'Vorgeschlagene Regel aktiv') player.activeRuleLabels[cardId] = 'Vorgeschlagene Blobb-Regel aktiv'
    })
  })
  state.openedHeldCardId ??= null
  state.selectedRuleMode ??= null
  render()
}

export function mountKlatschen(target: HTMLElement, players: KlatschenPlayerSetup[], gameOptions: KlatschenOptions = {}) {
  root = target
  options = gameOptions
  state = gameOptions.initialState ? structuredClone(gameOptions.initialState) : createState(players)
  state.players.forEach((player) => {
    player.heldCards ??= []
    player.partnerPlayerId ??= null
    player.activeRuleLabels ??= {}
    Object.entries(player.activeRuleLabels).forEach(([cardId, label]) => {
      if (label === 'Eigene Regel aktiv') player.activeRuleLabels[cardId] = 'Eigene Blobb-Regel aktiv'
      if (label === 'Vorgeschlagene Regel aktiv') player.activeRuleLabels[cardId] = 'Vorgeschlagene Blobb-Regel aktiv'
    })
  })
  state.openedHeldCardId ??= null
  state.selectedRuleMode ??= null
  root.addEventListener('click', handleClick)
  window.addEventListener('resize', updateMiddleLayout)
  render()
  return () => { window.clearTimeout(revealTimer); root?.removeEventListener('click', handleClick); window.removeEventListener('resize', updateMiddleLayout); root = null; options = {} }
}
