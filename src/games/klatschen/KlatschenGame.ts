import './klatschen.css'
import { defaultProfileIconMarkup } from '../../profiles.ts'
import { getSoundSettings, playSound } from '../../audio/audioManager.ts'
import { klatschenCardMap, klatschenCards, type KlatschenCard } from './klatschenCards.ts'
import blobbenCardDealUrl from '../../assets/audio/blobben-card-deal.mp3'
import thumbEffectIconUrl from '../../assets/smileys/processed/thumb.png'
import noseEffectIconUrl from '../../assets/smileys/processed/nose.png'
import doubleEffectIconUrl from '../../assets/smileys/processed/double.png'
import partnerEffectIconUrl from '../../assets/smileys/processed/partner.png'
import questionMasterEffectIconUrl from '../../assets/smileys/processed/question-master.png'

export type KlatschenPlayerSetup = { id?: string; name: string; avatar: string; avatarColor: string }
export type KlatschenPlayer = KlatschenPlayerSetup & { id: string; drinks: number; heldCards: string[]; partnerIds: string[] }
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
let dealTimer: number | undefined
let dealAnimationActive = false
let lastSoundedDrawIndex = 0
let lastAnimatedDrawIndex = 0
let playersDialogOpen = false
const dealAudio = new Audio(blobbenCardDealUrl)
dealAudio.preload = 'auto'
dealAudio.setAttribute('playsinline', '')

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

function playerNameColor(player: KlatschenPlayer) {
  return `style="--player-name-color:${escapeHtml(player.avatarColor)}"`
}

function createState(setups: KlatschenPlayerSetup[]): KlatschenGameState {
  const players = setups.map((player, index) => ({ ...player, id: player.id ?? `${index}-${player.name}`, drinks: 0, heldCards: [], partnerIds: [] }))
  const partnerCardCount = Math.max(0, players.length - 2)
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
  const layer = slot === 0 ? 0 : state.deck.length - slot + 1
  return `<div class="klatschen-circle-slot ${present ? '' : 'is-empty'}" style="--slot-angle:${angle}deg;--slot-layer:${layer}" aria-hidden="${present ? 'false' : 'true'}">${present ? `<div class="klatschen-card-back"><span><i>B</i>B</span></div>` : ''}</div>`
}

function circleMarkup() {
  const seam = state.remainingSlots.includes(0)
    ? `<div class="klatschen-circle-slot klatschen-circle-seam" style="--slot-angle:0deg;--slot-layer:${state.deck.length + 2}" aria-hidden="true"><div class="klatschen-card-back"><span><i>B</i>B</span></div></div>`
    : ''
  return `<div class="klatschen-card-circle${dealAnimationActive ? ' is-dealing' : ''}" aria-label="Kartenkreis">${state.deck.map((_, slot) => cardBackMarkup(slot)).join('')}${seam}</div>`
}

function playerTurnMarkup() {
  const player = currentPlayer()
  const nameSizeClass = player.name.length > 18 ? 'is-very-long' : player.name.length > 11 ? 'is-long' : ''
  return `<div class="klatschen-turn" style="--current-player-color:${player.avatarColor}">${avatarMarkup(player)}<strong class="${nameSizeClass}">${escapeHtml(player.name)}</strong></div>`
}

function heldCardLabel(card: KlatschenCard) {
  if (card.title === 'Nasen-Blobb') return 'Nasen...'
  if (card.title === 'Daumen-Blobb') return 'Daumen...'
  if (card.title === 'Fragenmeister') return 'FragenM...'
  if (card.title === 'Doppel-Blobb') return 'Doppel...'
  return card.title
}

type EffectIconName = 'thumb' | 'nose' | 'double' | 'partner' | 'question-master'

const effectIcons: Record<EffectIconName, string> = {
  thumb: thumbEffectIconUrl,
  nose: noseEffectIconUrl,
  double: doubleEffectIconUrl,
  partner: partnerEffectIconUrl,
  'question-master': questionMasterEffectIconUrl,
}

function effectIconMarkup(cardId: string) {
  const name: EffectIconName = cardId.startsWith('thumb-clapper')
    ? 'thumb'
    : cardId.startsWith('nose-clapper')
      ? 'nose'
      : cardId.startsWith('double-clap')
        ? 'double'
        : cardId.startsWith('question-rule')
          ? 'question-master'
          : 'partner'
  return `<img class="klatschen-effect-icon" src="${effectIcons[name]}" alt="" aria-hidden="true" draggable="false">`
}

function effectCardPriority(cardId: string) {
  if (cardId.startsWith('nose-clapper')) return 0
  if (cardId.startsWith('thumb-clapper')) return 1
  if (cardId.startsWith('double-clap')) return 2
  if (cardId === 'clap-partner' || cardId === 'partner-status') return 3
  if (cardId.startsWith('question-rule')) return 4
  return 5
}

function heldCardsMarkup() {
  const cards: Array<{ priority: number; markup: string }> = []
  const visiblePlayers = [currentPlayer()]
  visiblePlayers.forEach((player) => {
    const stacks = player.heldCards.reduce<Array<{ card: KlatschenCard; count: number }>>((result, cardId) => {
      const card = klatschenCardMap.get(cardId)
      if (!card || card.id === 'clap-partner') return result
      const stack = result.find((item) => item.card.title === card.title)
      if (stack) stack.count += 1
      else result.push({ card, count: 1 })
      return result
    }, [])
    stacks.forEach(({ card, count }) => {
      cards.push({ priority: effectCardPriority(card.id), markup: `<button type="button" class="klatschen-held-preview" data-klatschen-held="${escapeHtml(card.id)}" data-klatschen-owner="${escapeHtml(player.id)}" aria-label="${escapeHtml(heldCardLabel(card))}${count > 1 ? `, ${count} Karten` : ''}">${count > 1 ? `<b class="klatschen-held-count" aria-hidden="true">${count}</b>` : ''}${effectIconMarkup(card.id)}</button>` })
    })
  })
  const renderedPairs = new Set<string>()
  visiblePlayers.forEach((player) => {
    const partners = player.partnerIds.map((id) => state.players.find((item) => item.id === id)).filter((item): item is KlatschenPlayer => Boolean(item))
    if (!partners.length) return
    const groupKey = [player.id, ...partners.map((partner) => partner.id)].sort().join('|')
    if (renderedPairs.has(groupKey)) return
    renderedPairs.add(groupKey)
    const partnerNames = partners.map((partner) => partner.name).join(', ')
    cards.push({ priority: effectCardPriority('partner-status'), markup: `<button type="button" class="klatschen-held-preview" data-klatschen-held="partner-status" data-klatschen-owner="${escapeHtml(player.id)}" aria-label="Blobb-Partner: ${escapeHtml(partnerNames)}"><b class="klatschen-held-count" aria-hidden="true">${partners.length}</b>${effectIconMarkup('clap-partner')}</button>` })
  })
  if (!cards.length) return ''
  cards.sort((a, b) => a.priority - b.priority)
  return `<section class="klatschen-held-cards" aria-label="Aktive Blobb-Karten und Zustände"><div>${cards.map((card) => card.markup).join('')}</div></section>`
}

function heldCardDialogMarkup() {
  if (state.openedHeldCardId === 'partner-status') {
    const owner = state.players.find((player) => player.id === state.openedHeldCardOwnerId)
    const partners = owner?.partnerIds.map((id) => state.players.find((player) => player.id === id)).filter((player): player is KlatschenPlayer => Boolean(player)) ?? []
    if (!owner || !partners.length) return ''
    const heading = partners.length === 1 ? 'Dein Blobb-Partner:' : 'Deine Blobb-Partner:'
    return `<div class="klatschen-held-dialog-backdrop" data-klatschen-action="cancel-held"><article class="klatschen-held-dialog klatschen-partner-dialog" role="dialog" aria-modal="true" aria-labelledby="partner-dialog-title"><span aria-hidden="true">🤝</span><h2 id="partner-dialog-title">${heading}</h2><div class="klatschen-partner-dialog-list">${partners.map((partner) => `<div>${avatarMarkup(partner)}<strong class="player-name-color" ${playerNameColor(partner)}>${escapeHtml(partner.name)}</strong></div>`).join('')}</div><button class="game-button primary" data-klatschen-action="cancel-held">Schließen</button></article></div>`
  }
  const cardId = state.openedHeldCardId === 'partner-status' ? 'clap-partner' : state.openedHeldCardId
  const card = cardId ? klatschenCardMap.get(cardId) : undefined
  if (!card) return ''
  return `<div class="klatschen-held-dialog-backdrop" data-klatschen-action="cancel-held"><article class="klatschen-held-dialog" role="dialog" aria-modal="true" aria-labelledby="held-card-title"><h2 id="held-card-title">Blobb-Karte entfernen?</h2><span>${card.symbol}</span><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description)}</p><div><button class="game-button klatschen-cancel-remove" data-klatschen-action="cancel-held">Nein</button><button class="game-button primary" data-klatschen-action="remove-held">Ja</button></div></article></div>`
}

function playersButtonMarkup() {
  return `<button type="button" class="game-button klatschen-players-button" data-klatschen-action="players">Mitspieler</button>`
}

function playersDialogMarkup() {
  if (!playersDialogOpen) return ''
  const rows = state.players.map((player) => {
    const cardCounts = player.heldCards.reduce<Map<string, { card: KlatschenCard; count: number }>>((result, cardId) => {
      const card = klatschenCardMap.get(cardId)
      if (!card || card.id === 'clap-partner') return result
      const existing = result.get(card.title)
      if (existing) existing.count += 1
      else result.set(card.title, { card, count: 1 })
      return result
    }, new Map())
    const cards = [...cardCounts.values()].map(({ card, count }) => `<span class="klatschen-player-card-symbol" aria-label="${escapeHtml(card.title)}${count > 1 ? `, ${count} Karten` : ''}"><span aria-hidden="true">${card.symbol}</span>${count > 1 ? `<b aria-hidden="true">${count}</b>` : ''}</span>`)
    const partners = player.partnerIds.map((id) => state.players.find((candidate) => candidate.id === id)).filter((candidate): candidate is KlatschenPlayer => Boolean(candidate))
    if (partners.length) cards.push(`<span class="klatschen-player-card-symbol" aria-label="${partners.length} Blobb-Partner"><span aria-hidden="true">🤝</span>${partners.length > 1 ? `<b aria-hidden="true">${partners.length}</b>` : ''}</span>`)
    return `<div class="klatschen-player-card-row"><div class="klatschen-player-card-person">${avatarMarkup(player)}<strong class="player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</strong></div><div class="klatschen-player-card-list">${cards.length ? cards.join('') : '<span class="is-empty">Keine Karte</span>'}</div></div>`
  }).join('')
  return `<div class="klatschen-players-backdrop" data-klatschen-action="close-players"><article class="klatschen-players-dialog" role="dialog" aria-modal="true" aria-labelledby="klatschen-players-title"><h2 id="klatschen-players-title">Mitspieler</h2><div class="klatschen-player-card-table">${rows}</div><button type="button" class="game-button primary" data-klatschen-action="close-players">Schließen</button></article></div>`
}

function renderRule() {
  return `<section class="klatschen-rule-screen"><p class="eyebrow">Grundregel</p><h2>Ab jetzt darf das Wort „trinken“ nicht mehr gesagt werden.</h2><p>Stattdessen muss immer <strong>„blobben“</strong> gesagt werden.</p><button class="game-button primary" data-klatschen-action="start">Verstanden – Spiel starten</button></section>`
}

function renderTurn() {
  return `<section class="klatschen-play-screen">${circleMarkup()}<div class="klatschen-center-controls">${playerTurnMarkup()}<button class="game-button primary klatschen-draw-button" data-klatschen-action="draw" ${dealAnimationActive ? 'disabled' : ''}>Nächste Karte ziehen</button></div>${playersButtonMarkup()}${heldCardsMarkup()}${heldCardDialogMarkup()}${playersDialogMarkup()}</section>`
}

function drawnCardMarkup(card: KlatschenCard) {
  const angle = ((state.drawnSlot ?? 0) / state.deck.length) * 360
  const settled = state.drawIndex <= lastAnimatedDrawIndex
  return `<article class="klatschen-drawn-card" style="--draw-angle:${angle}deg;--draw-counter-angle:${-angle}deg"><div class="klatschen-drawn-inner${settled ? ' is-settled' : ''}"><div class="klatschen-drawn-back" aria-hidden="true"></div><div class="klatschen-drawn-front"><h2>${escapeHtml(card.title)}</h2><span class="klatschen-card-symbol" aria-hidden="true">${card.symbol}</span><p>${escapeHtml(card.description)}</p>${card.suggestedRule ? `<small>Vorschlag: ${escapeHtml(card.suggestedRule)}</small>` : ''}${card.amount ? `<strong class="klatschen-amount">${card.amount} Schluck${card.amount === 1 ? '' : 'e'}</strong>` : ''}</div></div></article>`
}

function needsTarget(card: KlatschenCard) {
  return card.id === 'clap-partner'
}

function targetMarkup(card: KlatschenCard) {
  void card
  return ''
}

function renderPartnerTargetScreen() {
  const owner = currentPlayer()
  return `<section class="klatschen-partner-target-screen"><p class="eyebrow">Blobb-Partner</p><h2>Wer soll dein Blobb-Partner sein?</h2><div class="klatschen-partner-player-list" aria-label="Partner auswählen">${state.players.map((player, index) => {
    const isSelf = index === state.currentPlayerIndex
    const isExistingPartner = owner.partnerIds.includes(player.id)
    const unavailable = isSelf || isExistingPartner
    const unavailableLabel = isSelf ? 'Du kannst dich nicht selbst wählen' : `${player.name} ist bereits dein Blobb-Partner`
    return `<button class="game-button${unavailable ? ' is-unavailable' : ''}" data-klatschen-target="${index}" ${unavailable ? `disabled aria-label="${escapeHtml(unavailableLabel)}"` : ''}>${avatarMarkup(player)}<span class="player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</span></button>`
  }).join('')}</div></section>`
}

function renderCard() {
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (!card) return renderTurn()
  if (card.id === 'clap-partner' && state.selectedTargetIndex === -1) return renderPartnerTargetScreen()
  const nextButton = needsTarget(card)
    ? '<button class="game-button primary klatschen-next-button klatschen-partner-select-button" data-klatschen-action="choose-partner">Partner wählen</button>'
    : '<button class="game-button primary klatschen-next-button" data-klatschen-action="next">Weiter</button>'
  return `<section class="klatschen-card-screen">${circleMarkup()}${drawnCardMarkup(card)}${playersButtonMarkup()}${heldCardsMarkup()}${heldCardDialogMarkup()}${playersDialogMarkup()}<div class="klatschen-card-actions">${targetMarkup(card)}</div>${nextButton}</section>`
}

function renderFinished() {
  const sorted = [...state.players].sort((left, right) => right.drinks - left.drinks)
  return `<section class="klatschen-summary"><h2>Alle Karten wurden gezogen</h2><div class="klatschen-stats">${sorted.map((player) => `<div>${avatarMarkup(player)}<strong class="player-name-color" ${playerNameColor(player)}>${escapeHtml(player.name)}</strong><span>${player.drinks} Schluck${player.drinks === 1 ? '' : 'e'}</span></div>`).join('')}</div><div class="klatschen-summary-actions"><button class="game-button primary ipad-pwa-end-button" data-klatschen-action="exit">Beenden</button><button class="game-button primary ipad-pwa-end-button" data-klatschen-action="restart">Neustarten</button></div></section>`
}

function addDrinks(playerIndex: number, amount: number, includePartner = true) {
  const player = state.players[playerIndex]
  if (!player || amount <= 0) return
  player.drinks += amount
  if (!includePartner) return
  new Set(player.partnerIds).forEach((partnerId) => {
    const partner = state.players.find((item) => item.id === partnerId)
    if (partner && partner.id !== player.id) partner.drinks += amount
  })
}

function normalizePartnerGroups(players: KlatschenPlayer[]) {
  const playerIds = new Set(players.map((player) => player.id))
  const connections = new Map(players.map((player) => [player.id, new Set<string>()]))
  players.forEach((player) => {
    const legacyPartnerId = (player as KlatschenPlayer & { partnerPlayerId?: string | null }).partnerPlayerId
    const storedPartnerIds = Array.isArray(player.partnerIds) ? player.partnerIds : []
    ;[...storedPartnerIds, legacyPartnerId].filter((id): id is string => Boolean(id && playerIds.has(id) && id !== player.id)).forEach((id) => {
      connections.get(player.id)?.add(id)
      connections.get(id)?.add(player.id)
    })
    delete (player as KlatschenPlayer & { partnerPlayerId?: string | null }).partnerPlayerId
  })
  const visited = new Set<string>()
  players.forEach((player) => {
    if (visited.has(player.id)) return
    const groupIds: string[] = []
    const queue = [player.id]
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      groupIds.push(id)
      connections.get(id)?.forEach((connectedId) => { if (!visited.has(connectedId)) queue.push(connectedId) })
    }
    groupIds.forEach((id) => {
      const member = players.find((candidate) => candidate.id === id)
      if (member) member.partnerIds = groupIds.filter((partnerId) => partnerId !== id)
    })
  })
}

function mergePartnerGroups(owner: KlatschenPlayer, selected: KlatschenPlayer) {
  const memberIds = new Set([owner.id, selected.id, ...owner.partnerIds, ...selected.partnerIds])
  const members = state.players.filter((player) => memberIds.has(player.id))
  members.forEach((member) => {
    member.partnerIds = members.filter((partner) => partner.id !== member.id).map((partner) => partner.id)
  })
  if (!owner.heldCards.includes('clap-partner')) {
    owner.heldCards.push('clap-partner')
  }
}

function applyAutomaticDrinks(card: KlatschenCard) {
  const amount = card.amount ?? 0
  if (card.type === 'drink-self') addDrinks(state.currentPlayerIndex, amount)
  if (card.id === 'all-1') state.players.forEach((_, index) => { addDrinks(index, amount) })
  if (card.id === 'all-except') state.players.forEach((_, index) => { if (index !== state.currentPlayerIndex) addDrinks(index, amount) })
  if (card.id === 'left') addDrinks((state.currentPlayerIndex - 1 + state.players.length) % state.players.length, amount)
  if (card.id === 'right') addDrinks((state.currentPlayerIndex + 1) % state.players.length, amount)
  if (card.exclusiveRole) {
    state.players.forEach((player) => {
      player.heldCards = player.heldCards.filter((cardId) => klatschenCardMap.get(cardId)?.exclusiveRole !== card.exclusiveRole)
    })
    currentPlayer().heldCards.push(card.id)
    return
  }
  if (card.id !== 'clap-partner' && (card.type === 'collectible-action' || card.keepUntilUsed)) currentPlayer().heldCards.push(card.id)
}

function playDrawSoundOnce() {
  if (state.drawIndex <= lastSoundedDrawIndex) return
  lastSoundedDrawIndex = state.drawIndex
  playSound('blobben-card-draw')
}

function drawCard() {
  if (!canControl() || dealAnimationActive || state.phase !== 'turn' || !state.remainingSlots.length) return
  const slotPosition = Math.floor(Math.random() * state.remainingSlots.length)
  state.drawnSlot = state.remainingSlots[slotPosition]!
  state.remainingSlots.splice(slotPosition, 1)
  state.currentCardId = state.deck[state.drawIndex++] ?? null
  state.selectedTargetIndex = null
  state.phase = 'card'
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (card) applyAutomaticDrinks(card)
  playDrawSoundOnce()
  render()
  publish()
}

function selectTarget(index: number) {
  if (!canControl() || state.phase !== 'card' || state.selectedTargetIndex !== -1 || !state.players[index]) return
  const card = state.currentCardId ? klatschenCardMap.get(state.currentCardId) : undefined
  if (!card || !needsTarget(card)) return
  if (card.id === 'clap-partner' && index === state.currentPlayerIndex) return
  if (currentPlayer().partnerIds.includes(state.players[index]!.id)) return
  state.selectedTargetIndex = index
  const owner = currentPlayer()
  const partner = state.players[index]!
  mergePartnerGroups(owner, partner)
  nextTurn()
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

function startDealVisual(duration: number) {
  const circle = root?.querySelector<HTMLElement>('.klatschen-card-circle.is-dealing')
  const cards = circle?.querySelectorAll<HTMLElement>('.klatschen-circle-slot:not(.klatschen-circle-seam) .klatschen-card-back')
  if (!circle || !cards?.length) return
  const totalDuration = Number.isFinite(duration) && duration > 0 ? duration : .648
  const cardDuration = Math.min(.14, totalDuration / Math.max(2, cards.length / 2))
  const interval = cards.length > 1 ? (totalDuration - cardDuration) / (cards.length - 1) : 0
  cards.forEach((card, index) => {
    card.style.setProperty('--deal-delay', `${index * interval}s`)
    card.style.setProperty('--deal-card-duration', `${cardDuration}s`)
  })
  const seamCard = circle.querySelector<HTMLElement>('.klatschen-circle-seam .klatschen-card-back')
  if (seamCard) {
    seamCard.style.setProperty('--deal-delay', '0s')
    seamCard.style.setProperty('--deal-card-duration', `${cardDuration}s`)
  }
  requestAnimationFrame(() => circle.classList.add('is-dealing-active'))
  window.clearTimeout(dealTimer)
  dealTimer = window.setTimeout(() => {
    dealAnimationActive = false
    circle.classList.remove('is-dealing', 'is-dealing-active')
    circle.querySelectorAll<HTMLElement>('.klatschen-card-back').forEach((card) => {
      card.style.removeProperty('--deal-delay')
      card.style.removeProperty('--deal-card-duration')
    })
    root?.querySelector<HTMLButtonElement>('.klatschen-draw-button')?.removeAttribute('disabled')
  }, Math.ceil(totalDuration * 1000) + 20)
}

function playDealSequence() {
  const startVisual = () => startDealVisual(dealAudio.duration)
  const sound = getSoundSettings()
  if (!sound.enabled) {
    startVisual()
    return
  }
  dealAudio.pause()
  dealAudio.currentTime = 0
  dealAudio.muted = false
  dealAudio.volume = sound.volume
  void dealAudio.play().then(startVisual).catch((error) => {
    if (import.meta.env.DEV) console.warn('[Audio] Blobben-Austeilsound konnte nicht abgespielt werden.', error)
    startVisual()
  })
}

function startGameWithDeal() {
  if (!canControl() || state.phase !== 'rule') return
  dealAnimationActive = true
  state.phase = 'turn'
  render()
  publish()
  playDealSequence()
}

function handleClick(event: Event) {
  const target = event.target as HTMLElement
  if (target.classList.contains('klatschen-players-backdrop')) {
    playersDialogOpen = false
    render(); return
  }
  if (target.classList.contains('klatschen-held-dialog-backdrop')) {
    state.openedHeldCardId = null
    state.openedHeldCardOwnerId = null
    render(); publish(); return
  }
  const button = target.closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.dataset.klatschenHeld) {
    const owner = state.players.find((player) => player.id === button.dataset.klatschenOwner)
    const isPartnerStatus = button.dataset.klatschenHeld === 'partner-status' && Boolean(owner?.partnerIds.length)
    if (!canControl() || !owner || (!isPartnerStatus && !owner.heldCards.includes(button.dataset.klatschenHeld))) return
    state.openedHeldCardId = button.dataset.klatschenHeld
    state.openedHeldCardOwnerId = owner.id
    render(); publish(); return
  }
  if (button.dataset.klatschenTarget !== undefined) return selectTarget(Number(button.dataset.klatschenTarget))
  const action = button.dataset.klatschenAction
  if (action === 'players') { playSound('ui-click'); playersDialogOpen = true; render(); return }
  if (action === 'close-players') { playSound('ui-back'); playersDialogOpen = false; render(); return }
  if (action === 'start') startGameWithDeal()
  if (action === 'draw') drawCard()
  if (action === 'next') nextTurn()
  if (action === 'choose-partner' && canControl() && state.phase === 'card' && state.currentCardId === 'clap-partner') {
    state.selectedTargetIndex = -1
    render(); publish()
  }
  if (action === 'cancel-held') { state.openedHeldCardId = null; state.openedHeldCardOwnerId = null; render(); publish() }
  if (action === 'remove-held' && canControl() && state.openedHeldCardId) {
    const owner = state.players.find((player) => player.id === state.openedHeldCardOwnerId)
    if (!owner) return
    const cardId = state.openedHeldCardId
    if (cardId === 'partner-status') return
    const heldCardIndex = owner.heldCards.indexOf(cardId)
    if (heldCardIndex >= 0) owner.heldCards.splice(heldCardIndex, 1)
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
  root?.querySelectorAll<HTMLButtonElement>('[data-klatschen-action], [data-klatschen-target], [data-klatschen-held]').forEach((button) => {
    if (button.dataset.klatschenAction === 'players' || button.dataset.klatschenAction === 'close-players') return
    button.disabled = true
  })
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
  const circle = screen?.querySelector<HTMLElement>('.klatschen-card-circle')
  const turn = screen?.querySelector<HTMLElement>('.klatschen-turn')
  const avatar = turn?.querySelector<HTMLElement>(':scope > .klatschen-avatar')
  const name = turn?.querySelector<HTMLElement>(':scope > strong')
  const drawButton = screen?.querySelector<HTMLElement>('.klatschen-draw-button')
  const heldCards = screen?.querySelector<HTMLElement>('.klatschen-held-cards')
  const slots = screen?.querySelectorAll<HTMLElement>('.klatschen-circle-slot')
  if (!screen || !circle || !turn || !avatar || !name || !drawButton || !slots?.length) return

  circle.style.removeProperty('top')
  avatar.style.removeProperty('width')
  avatar.style.removeProperty('height')
  const screenRect = screen.getBoundingClientRect()
  let slotRects = [...slots].map((slot) => slot.getBoundingClientRect())
  let circleTop = Math.min(...slotRects.map((rect) => rect.top))
  let circleBottom = Math.max(...slotRects.map((rect) => rect.bottom))

  const buttonHeight = drawButton.getBoundingClientRect().height
  const freeBottomTop = Math.min(screenRect.bottom, circleBottom)
  const buttonTop = ((freeBottomTop + screenRect.bottom) / 2) - screenRect.top - (buttonHeight / 2) - (buttonHeight * .4)
  drawButton.style.top = `${buttonTop}px`

  const effectCardsBottom = heldCards?.getBoundingClientRect().bottom ?? screenRect.top
  const circleHeight = circleBottom - circleTop
  const drawButtonTop = screenRect.top + buttonTop
  const centeredCircleTop = effectCardsBottom + ((drawButtonTop - effectCardsBottom - circleHeight) / 2)
  const circleShift = centeredCircleTop - circleTop
  const currentCircleCenter = circle.getBoundingClientRect().top - screenRect.top
  circle.style.top = `${currentCircleCenter + circleShift}px`

  slotRects = [...slots].map((slot) => slot.getBoundingClientRect())
  circleTop = Math.min(...slotRects.map((rect) => rect.top))
  circleBottom = Math.max(...slotRects.map((rect) => rect.bottom))

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

function positionPlayersButton() {
  const screen = root?.querySelector<HTMLElement>('.klatschen-play-screen, .klatschen-card-screen')
  const primaryButton = screen?.querySelector<HTMLElement>('.klatschen-draw-button, .klatschen-next-button')
  const playersButton = screen?.querySelector<HTMLElement>('.klatschen-players-button')
  if (!screen || !primaryButton || !playersButton) return
  const screenRect = screen.getBoundingClientRect()
  const primaryRect = primaryButton.getBoundingClientRect()
  const buttonHeight = playersButton.getBoundingClientRect().height
  const freeTop = primaryRect.bottom - screenRect.top
  const freeHeight = screenRect.height - freeTop
  playersButton.style.top = `${freeTop + Math.max(0, (freeHeight - buttonHeight) / 2)}px`
}

function updateMiddleLayout() {
  fitCurrentPlayerDisplay()
  positionMiddleLayout()
  positionNextButton()
  positionPlayersButton()
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
  root.innerHTML = `<div class="busfahrer-shell klatschen-shell"><header class="busfahrer-header"><button class="back-button bus-back ipad-pwa-header-button" type="button" data-action="back">Beenden</button><div><p>BLOBBA präsentiert</p><h1>BLOBBEN</h1></div><button class="restart-button ipad-pwa-header-button" type="button" data-klatschen-action="restart">Neu starten</button></header><div class="klatschen-global-rule">Sag nicht „trinken“ – sag „blobben“.</div><div class="klatschen-stage">${content}</div></div>`
  updateMiddleLayout()
  positionDrawAnimation()
  removeRevealedCardBack()
  applyControls()
  if (state.phase === 'card') lastAnimatedDrawIndex = Math.max(lastAnimatedDrawIndex, state.drawIndex)
}

export function getKlatschenState() {
  return structuredClone(state)
}

export function applyKlatschenState(nextState: KlatschenGameState) {
  const previous = root ? structuredClone(state) : null
  const startsDeal = previous?.phase === 'rule' && nextState.phase === 'turn'
  if (startsDeal) dealAnimationActive = true
  state = structuredClone(nextState)
  state.players.forEach((player) => {
    player.heldCards ??= []
    player.partnerIds ??= []
  })
  normalizePartnerGroups(state.players)
  state.openedHeldCardId ??= null
  state.openedHeldCardOwnerId ??= null
  render()
  if (!previous) return
  if (startsDeal) playDealSequence()
  if (state.drawIndex > previous.drawIndex) {
    playDrawSoundOnce()
  }
  const heldCount = state.players.reduce((sum, player) => sum + player.heldCards.length, 0)
  const previousHeldCount = previous.players.reduce((sum, player) => sum + player.heldCards.length, 0)
  if (heldCount > previousHeldCount && state.drawIndex === previous.drawIndex) playSound('collect-card')
  if (state.currentPlayerIndex !== previous.currentPlayerIndex) playSound('player-change')
  if (state.phase === 'finished' && previous.phase !== 'finished') playSound('game-finish')
}

export function mountKlatschen(target: HTMLElement, players: KlatschenPlayerSetup[], gameOptions: KlatschenOptions = {}) {
  root = target
  playersDialogOpen = false
  options = gameOptions
  dealAnimationActive = false
  state = gameOptions.initialState ? structuredClone(gameOptions.initialState) : createState(players)
  state.players.forEach((player) => {
    player.heldCards ??= []
    player.partnerIds ??= []
  })
  normalizePartnerGroups(state.players)
  state.openedHeldCardId ??= null
  state.openedHeldCardOwnerId ??= null
  lastSoundedDrawIndex = state.drawIndex
  lastAnimatedDrawIndex = state.phase === 'card' ? state.drawIndex : 0
  root.addEventListener('click', handleClick)
  window.addEventListener('resize', updateMiddleLayout)
  render()
  return () => { window.clearTimeout(revealTimer); window.clearTimeout(dealTimer); dealAudio.pause(); dealAudio.currentTime = 0; dealAnimationActive = false; root?.removeEventListener('click', handleClick); window.removeEventListener('resize', updateMiddleLayout); root = null; options = {} }
}
