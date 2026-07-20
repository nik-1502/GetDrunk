import './style.css'
import { applyBusfahrerState, getBusfahrerState, mountBusfahrer, type BusfahrerGameState } from './busfahrer.ts'
import { applyKlatschenState, getKlatschenState, mountKlatschen, type KlatschenGameState } from './games/klatschen/KlatschenGame.ts'
import { avatarColor, avatarOptions, avatarSource, avatarVisualMarkup } from './profiles.ts'
import { getSoundSettings, playActionSound, playSound, setSoundEffectsEnabled, setSoundEffectsVolume } from './audio/audioManager.ts'
import {
  createOnlineGroup,
  fetchGroupSnapshot,
  getSession,
  inviteUrl,
  joinOnlineGroup,
  leaveOnlineGroup,
  loadRemoteProfile,
  onAuthChanged,
  onlineAvailable,
  removeOnlineMember,
  saveRemoteProfile,
  signIn,
  signOut,
  signUp,
  subscribeToGroup,
  updateOnlineGameState,
  type OnlineGroup,
  type OnlineMember,
} from './online.ts'
import type { Session } from '@supabase/supabase-js'
import busfahrerGameImage from './assets/spielbild icons/91c70169-1e14-42c9-b836-6eacc3325af0.png'
import blobbenGameImage from './assets/spielbild icons/55490394-9fa1-45b5-adba-ce8260738e69.png'
import heroLogo from './assets/überschrift/ebe5baf7-8dca-44a0-a5bc-ba2f48425dc2.png'

const app = document.querySelector<HTMLDivElement>('#app')!
const PROFILE_STORAGE_KEY = 'blobba.profiles.v1'
const PREVIOUS_PROFILE_STORAGE_KEY = atob('Z2V0ZHJ1bmsucHJvZmlsZXMudjE=')
const FAVORITE_GAMES_STORAGE_KEY = 'blobbaFavoriteGames'
const MAX_PLAYERS = 9
const DEFAULT_AVATAR_ID = 'bier'
const HOME_GAME_CATEGORIES = ['Kartenspiele', 'Schnell', 'Klassiker', 'Lustig', 'Denkspiele', 'Verteilspiele', 'Teamspiele', 'Wettkampf'] as const
type HomeGameCategory = 'Alle' | typeof HOME_GAME_CATEGORIES[number]

const HOME_GAMES = [
  {
    id: 'blobfahrer',
    categories: ['Kartenspiele', 'Klassiker', 'Verteilspiele', 'Wettkampf'],
    searchTerms: ['blobfahrer', 'blobb-fahrer', 'busfahrer', 'bus', 'pyramide', 'karten'],
  },
  {
    id: 'blobben',
    categories: ['Kartenspiele', 'Lustig', 'Denkspiele', 'Teamspiele'],
    searchTerms: ['blobben', 'klatschen', 'klatsch', 'kartenkreis', 'regeln', 'aktionskarten'],
  },
] as const

let homeSearchQuery = ''
let favoritesOnly = false
let selectedHomeCategory: HomeGameCategory = 'Alle'
let categoryMenuOpen = false
const favoriteGameIds = loadFavoriteGameIds()

type StoredProfile = { id: string; name: string; avatarId: string | null }
type ProfileStore = { profiles: StoredProfile[]; activeProfileId: string; lastUsedProfileIds: string[] }
type SetupPlayer = { id: string; profileId: string; name: string; avatarId: string | null; avatar: string; avatarColor: string }
type ProfileEditorContext = { mode: 'primary' | 'new-player' | 'edit-player'; profileId?: string }
type SetupMode = 'offline' | 'online'
type GameKey = 'busfahrer' | 'klatschen'
type OnlineModal = 'create' | 'join' | 'invite' | null
type AuthModal = 'login' | 'register' | null
type SharedGameState = BusfahrerGameState | KlatschenGameState
type OnlineGroupState = { joined: boolean; isHost: boolean; inviteCode: string; groupId: string | null; gameKey: GameKey; status: 'lobby' | 'playing' | 'finished'; players: SetupPlayer[]; members: OnlineMember[]; gameState: SharedGameState | null }

let unmountCurrentPage: (() => void) | undefined
let profileStore = loadProfileStore()
let players = suggestedPlayers()
let gamePlayerSnapshot: SetupPlayer[] = []
let profileEditorContext: ProfileEditorContext = { mode: 'primary' }
let avatarEditorPlayerId: string | null = null
let editingPlayerId: string | null = null
let setupMode: SetupMode = 'offline'
let activeGame: GameKey = 'busfahrer'
let activeOnlineModal: OnlineModal = null
let onlineGroup: OnlineGroupState = { joined: false, isHost: false, inviteCode: 'BLOBBA-724', groupId: null, gameKey: 'busfahrer', status: 'lobby', players: [], members: [], gameState: null }
let authSession: Session | null = null
let authModal: AuthModal = null
let authNotice = ''
let onlineUnsubscribe: (() => void) | undefined
let pendingInviteCode: string | null = null
let onlineNotice = ''
let pendingKeyboardPositionCleanup: (() => void) | undefined

function updateIPadStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
  const hasIPadDimensions = window.innerWidth >= 768 && window.innerWidth <= 1366
  const isTouchTablet = navigator.maxTouchPoints > 1
  document.documentElement.classList.toggle('is-standalone', isStandalone)
  document.documentElement.classList.toggle('is-ipad-tablet', hasIPadDimensions && isTouchTablet)
  document.documentElement.classList.toggle('is-ipad-standalone', isStandalone && hasIPadDimensions && isTouchTablet)
}

updateIPadStandaloneMode()
window.addEventListener('resize', updateIPadStandaloneMode)

function preventDesktopZoom() {
  const isDesktopPointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
  window.addEventListener('wheel', (event) => {
    if (isDesktopPointer() && event.ctrlKey) event.preventDefault()
  }, { passive: false })
  window.addEventListener('keydown', (event) => {
    if (!isDesktopPointer() || (!event.ctrlKey && !event.metaKey)) return
    if (['+', '-', '=', '0'].includes(event.key)) event.preventDefault()
  })
  window.addEventListener('gesturestart', (event) => {
    if (isDesktopPointer()) event.preventDefault()
  }, { passive: false })
  window.addEventListener('gesturechange', (event) => {
    if (isDesktopPointer()) event.preventDefault()
  }, { passive: false })
}

preventDesktopZoom()

function constrainTouchZoom() {
  if (!window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints < 2) return
  const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!viewportMeta) return

  const scalableViewport = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, viewport-fit=cover'
  const resetViewport = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover'
  let gestureStartScale = 1
  let isPinching = false
  let resetScheduled = false

  const resetZoomToDefault = () => {
    if (resetScheduled || (window.visualViewport?.scale ?? 1) <= 1) return
    resetScheduled = true
    viewportMeta.content = resetViewport
    requestAnimationFrame(() => requestAnimationFrame(() => {
      viewportMeta.content = scalableViewport
      resetScheduled = false
    }))
  }

  document.addEventListener('gesturestart', (event) => {
    const gesture = event as Event & { scale?: number }
    gestureStartScale = window.visualViewport?.scale ?? gesture.scale ?? 1
    isPinching = true
  }, { passive: true })
  document.addEventListener('gesturechange', (event) => {
    const gesture = event as Event & { scale?: number }
    const relativeScale = gesture.scale ?? 1
    if (gestureStartScale * relativeScale < 1) event.preventDefault()
  }, { passive: false })
  document.addEventListener('gestureend', () => {
    isPinching = false
    resetZoomToDefault()
  }, { passive: true })
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) isPinching = true
  }, { passive: true })
  document.addEventListener('touchend', (event) => {
    if (!isPinching || event.touches.length !== 0) return
    isPinching = false
    resetZoomToDefault()
  }, { passive: true })
}

constrainTouchZoom()

function createId() {
  return crypto.randomUUID()
}

function createDefaultProfileStore(): ProfileStore {
  const profile = { id: createId(), name: '', avatarId: DEFAULT_AVATAR_ID }
  return { profiles: [profile], activeProfileId: profile.id, lastUsedProfileIds: [profile.id] }
}

function loadProfileStore(): ProfileStore {
  try {
    const storedProfiles = localStorage.getItem(PROFILE_STORAGE_KEY) ?? localStorage.getItem(PREVIOUS_PROFILE_STORAGE_KEY)
    if (storedProfiles && !localStorage.getItem(PROFILE_STORAGE_KEY)) localStorage.setItem(PROFILE_STORAGE_KEY, storedProfiles)
    const parsed = JSON.parse(storedProfiles ?? '') as Partial<ProfileStore>
    const validAvatarIds = new Set(avatarOptions.map((avatar) => avatar.id))
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.filter((profile): profile is StoredProfile => Boolean(profile && typeof profile.id === 'string' && typeof profile.name === 'string'))
        .map((profile) => ({ ...profile, avatarId: profile.avatarId && validAvatarIds.has(profile.avatarId) ? profile.avatarId : DEFAULT_AVATAR_ID }))
      : []
    if (!profiles.length) return createDefaultProfileStore()
    const activeProfileId = profiles.some((profile) => profile.id === parsed.activeProfileId) ? parsed.activeProfileId! : profiles[0]!.id
    const lastUsedProfileIds = Array.isArray(parsed.lastUsedProfileIds)
      ? parsed.lastUsedProfileIds.filter((id): id is string => typeof id === 'string' && profiles.some((profile) => profile.id === id))
      : []
    return { profiles, activeProfileId, lastUsedProfileIds: lastUsedProfileIds.length ? lastUsedProfileIds : [activeProfileId] }
  } catch {
    return createDefaultProfileStore()
  }
}

function saveProfileStore() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileStore))
}

function activeProfile() {
  return profileStore.profiles.find((profile) => profile.id === profileStore.activeProfileId) ?? profileStore.profiles[0]!
}

function setupPlayerFromProfile(profile: StoredProfile): SetupPlayer {
  return {
    id: createId(),
    profileId: profile.id,
    name: profile.name,
    avatarId: profile.avatarId,
    avatar: avatarSource(profile.avatarId),
    avatarColor: avatarColor(profile.avatarId),
  }
}

function createLocalPlayer(index: number): SetupPlayer {
  const usedAvatarIds = new Set(players.map((player) => player.avatarId).filter((avatarId): avatarId is string => Boolean(avatarId)))
  const availableAvatars = avatarOptions.filter((avatar) => !usedAvatarIds.has(avatar.id))
  const avatarId = availableAvatars.length
    ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)]!.id
    : DEFAULT_AVATAR_ID
  return {
    id: createId(),
    profileId: `local-${createId()}`,
    name: defaultPlayerName(index),
    avatarId,
    avatar: avatarSource(avatarId),
    avatarColor: avatarColor(avatarId),
  }
}

function defaultPlayerName(index: number) {
  return `Spieler ${index}`
}

function suggestedPlayers() {
  const profiles = profileStore.lastUsedProfileIds
    .map((id) => profileStore.profiles.find((profile) => profile.id === id))
    .filter((profile): profile is StoredProfile => Boolean(profile))
  return (profiles.length ? profiles : [activeProfile()]).map(setupPlayerFromProfile)
}

function syncSetupPlayers(profile: StoredProfile) {
  players = players.map((player) => player.profileId === profile.id
    ? { ...player, name: profile.name, avatarId: profile.avatarId, avatar: avatarSource(profile.avatarId), avatarColor: avatarColor(profile.avatarId) }
    : player)
}

function currentUser() {
  return authSession?.user ?? null
}

function currentOnlineProfile() {
  const profile = activeProfile()
  return { name: profile.name || 'Spieler', avatarId: profile.avatarId ?? DEFAULT_AVATAR_ID }
}

function setupPlayerFromMember(member: OnlineMember): SetupPlayer {
  return {
    id: member.user_id,
    profileId: member.user_id,
    name: member.name,
    avatarId: member.avatar_id,
    avatar: avatarSource(member.avatar_id),
    avatarColor: avatarColor(member.avatar_id),
  }
}

function applyOnlineSnapshot(group: OnlineGroup, members: OnlineMember[]) {
  const gameKey: GameKey = group.game_key === 'klatschen' ? 'klatschen' : 'busfahrer'
  activeGame = gameKey
  onlineGroup = {
    joined: true,
    isHost: group.host_user_id === currentUser()?.id,
    inviteCode: group.invite_code,
    groupId: group.id,
    gameKey,
    status: group.status,
    players: members.map(setupPlayerFromMember),
    members,
    gameState: (group.game_state as SharedGameState | null) ?? null,
  }
  gamePlayerSnapshot = onlineGroup.players
  if (group.status === 'playing' && window.location.hash.split('?')[0] !== `#${gameKey}`) {
    window.location.hash = gameKey
  } else if (group.status === 'playing' && onlineGroup.gameState) {
    if (gameKey === 'klatschen' && 'players' in onlineGroup.gameState) applyKlatschenState(onlineGroup.gameState)
    if (gameKey === 'busfahrer' && 'gamePlayers' in onlineGroup.gameState) applyBusfahrerState(onlineGroup.gameState)
  }
  reconcileDepartedPlayers()
}

function reconcileDepartedPlayers() {
  if (!onlineGroup.isHost || !onlineGroup.groupId || !onlineGroup.gameState || onlineGroup.status !== 'playing') return
  const memberIds = new Set(onlineGroup.members.map((member) => member.user_id))
  if ('players' in onlineGroup.gameState) {
    const previousPlayers = onlineGroup.gameState.players
    const nextPlayers = previousPlayers.filter((player) => memberIds.has(player.id))
    if (nextPlayers.length === previousPlayers.length || !nextPlayers.length) return
    const previousActiveId = previousPlayers[onlineGroup.gameState.currentPlayerIndex]?.id
    const nextActiveIndex = previousActiveId && memberIds.has(previousActiveId)
      ? nextPlayers.findIndex((player) => player.id === previousActiveId)
      : Math.min(onlineGroup.gameState.currentPlayerIndex, nextPlayers.length - 1)
    const nextState: KlatschenGameState = { ...onlineGroup.gameState, players: nextPlayers, currentPlayerIndex: Math.max(0, nextActiveIndex) }
    onlineGroup.gameState = nextState
    void updateOnlineGameState(onlineGroup.groupId, nextState, 'playing')
    return
  }
  const previousPlayers = onlineGroup.gameState.gamePlayers
  const nextPlayers = previousPlayers.filter((player) => memberIds.has(player.id))
  if (nextPlayers.length === previousPlayers.length || !nextPlayers.length) return
  const previousActiveId = previousPlayers[onlineGroup.gameState.currentPlayerIndex]?.id
  const nextActiveIndex = previousActiveId && memberIds.has(previousActiveId)
    ? nextPlayers.findIndex((player) => player.id === previousActiveId)
    : Math.min(onlineGroup.gameState.currentPlayerIndex, nextPlayers.length - 1)
  const nextState = {
    ...onlineGroup.gameState,
    gamePlayers: nextPlayers,
    currentPlayerIndex: Math.max(0, nextActiveIndex),
    busDriverIndex: Math.min(onlineGroup.gameState.busDriverIndex, nextPlayers.length - 1),
    hand: nextPlayers[Math.max(0, nextActiveIndex)]?.hand ?? [],
    questionResults: nextPlayers[Math.max(0, nextActiveIndex)]?.questionResults ?? [],
  }
  onlineGroup.gameState = nextState
  void updateOnlineGameState(onlineGroup.groupId, nextState, 'playing')
}

async function refreshOnlineGroup() {
  if (!onlineGroup.groupId) return
  const snapshot = await fetchGroupSnapshot(onlineGroup.groupId)
  applyOnlineSnapshot(snapshot.group, snapshot.members)
  if (window.location.hash.split('?')[0] !== `#${activeGame}`) renderModeMenu()
}

function subscribeCurrentGroup() {
  onlineUnsubscribe?.()
  onlineUnsubscribe = onlineGroup.groupId ? subscribeToGroup(onlineGroup.groupId, () => { void refreshOnlineGroup() }) : undefined
}

function localPlayerIsCurrent(state: SharedGameState) {
  const userId = currentUser()?.id
  const playerList = 'gamePlayers' in state ? state.gamePlayers : state.players
  return Boolean(userId && playerList[state.currentPlayerIndex]?.id === userId)
}

async function leaveCurrentOnlineGroup() {
  const userId = currentUser()?.id
  if (!userId || !onlineGroup.groupId) return
  await leaveOnlineGroup(onlineGroup.groupId, userId)
  onlineUnsubscribe?.()
  onlineUnsubscribe = undefined
  onlineGroup = { joined: false, isHost: false, inviteCode: 'BLOBBA-724', groupId: null, gameKey: activeGame, status: 'lobby', players: [], members: [], gameState: null }
}

async function syncRemoteProfile() {
  const user = currentUser()
  if (!user || !onlineAvailable()) return
  const profile = activeProfile()
  await saveRemoteProfile(user, profile.name, profile.avatarId)
}

async function trySyncRemoteProfile() {
  try {
    await syncRemoteProfile()
  } catch (error) {
    console.error('[Auth] profile sync error', error)
  }
}

async function loadAuthState() {
  authSession = await getSession()
  const user = currentUser()
  if (user) {
    const remoteProfile = await loadRemoteProfile(user.id)
    if (remoteProfile) {
      const profile = activeProfile()
      profile.name = remoteProfile.name ?? profile.name
      profile.avatarId = remoteProfile.avatar_id ?? profile.avatarId
      syncSetupPlayers(profile)
      saveProfileStore()
    }
  }
  renderPage()
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function playerAvatarMarkup(player: Pick<SetupPlayer, 'avatarId' | 'name' | 'avatarColor'>, className = 'player-avatar') {
  return `<span class="${className} ${player.avatarId ? '' : 'is-default'}" style="--avatar-ring:${player.avatarColor}">${avatarVisualMarkup(player.avatarId, `Profilbild von ${escapeHtml(player.name)}`)}</span>`
}

function gameTitle() {
  return activeGame === 'klatschen' ? 'BLOBBEN' : 'BLOBB-FAHRER'
}

function gameRoute(suffix = '') {
  return `${activeGame}${suffix}`
}

function renderPage() {
  pendingKeyboardPositionCleanup?.()
  pendingKeyboardPositionCleanup = undefined
  unmountCurrentPage?.()
  unmountCurrentPage = undefined

  const route = window.location.hash
  const [routeBase, routeQuery = ''] = route.split('?')
  const inviteFromRoute = new URLSearchParams(routeQuery).get('invite')
  if (inviteFromRoute) pendingInviteCode = inviteFromRoute
  const usesDarkTheme = routeBase.startsWith('#busfahrer') || routeBase.startsWith('#klatschen') || routeBase === '#profile'
  document.documentElement.classList.toggle('busfahrer-active', usesDarkTheme)
  document.body.classList.toggle('busfahrer-active', usesDarkTheme)

  if (routeBase === '#busfahrer') {
    activeGame = 'busfahrer'
    const snapshot = gamePlayerSnapshot.length ? gamePlayerSnapshot : players
    app.innerHTML = '<main class="busfahrer-page" id="busfahrer-game"></main>'
    unmountCurrentPage = mountBusfahrer(app.querySelector<HTMLElement>('#busfahrer-game')!, snapshot.map(({ profileId, name, avatar, avatarColor }) => ({ id: profileId, name, avatar, avatarColor })), setupMode === 'online' && onlineGroup.groupId ? {
      localPlayerId: authSession?.user.id,
      initialState: onlineGroup.gameState && 'gamePlayers' in onlineGroup.gameState ? onlineGroup.gameState : null,
      onStateChange: (state) => { if (onlineGroup.groupId && localPlayerIsCurrent(state)) void updateOnlineGameState(onlineGroup.groupId, state, state.phase === 'final' ? 'finished' : 'playing') },
      onLeave: () => { void leaveCurrentOnlineGroup() },
    } : {})
    return
  }
  if (routeBase === '#klatschen') {
    activeGame = 'klatschen'
    const snapshot = gamePlayerSnapshot.length ? gamePlayerSnapshot : players
    app.innerHTML = '<main class="busfahrer-page" id="klatschen-game"></main>'
    unmountCurrentPage = mountKlatschen(app.querySelector<HTMLElement>('#klatschen-game')!, snapshot.map(({ profileId, name, avatar, avatarColor }) => ({ id: profileId, name, avatar, avatarColor })), setupMode === 'online' && onlineGroup.groupId ? {
      localPlayerId: authSession?.user.id,
      initialState: onlineGroup.gameState && 'players' in onlineGroup.gameState ? onlineGroup.gameState : null,
      onStateChange: (state) => { if (onlineGroup.groupId) void updateOnlineGameState(onlineGroup.groupId, state, state.phase === 'finished' ? 'finished' : 'playing') },
      onLeave: () => { void leaveCurrentOnlineGroup() },
    } : {})
    return
  }
  if (routeBase === '#busfahrer-menu' || routeBase === '#klatschen-menu') {
    activeGame = routeBase.startsWith('#klatschen') ? 'klatschen' : 'busfahrer'
    return renderModeMenu()
  }
  if (routeBase === '#busfahrer-offline' || routeBase === '#klatschen-offline') {
    activeGame = routeBase.startsWith('#klatschen') ? 'klatschen' : 'busfahrer'
    setupMode = 'offline'
    return renderOfflineMenu()
  }
  if (routeBase === '#busfahrer-online' || routeBase === '#klatschen-online') {
    activeGame = routeBase.startsWith('#klatschen') ? 'klatschen' : 'busfahrer'
    setupMode = 'online'
    return renderOnlineMenu()
  }
  if (routeBase === '#busfahrer-profile-picker' || routeBase === '#klatschen-profile-picker') {
    activeGame = routeBase.startsWith('#klatschen') ? 'klatschen' : 'busfahrer'
    return renderProfilePicker()
  }
  if (routeBase === '#busfahrer-profile-editor' || routeBase === '#klatschen-profile-editor') {
    activeGame = routeBase.startsWith('#klatschen') ? 'klatschen' : 'busfahrer'
    return renderProfileEditor()
  }
  if (routeBase === '#profile') {
    profileEditorContext = { mode: 'primary', profileId: profileStore.activeProfileId }
    return renderProfileEditor()
  }
  if (routeBase === '#settings') return renderSettingsPlaceholder()
  renderHome()
}

function renderHome() {
  app.innerHTML = `<main class="home-page">
    <button class="home-profile-button home-settings-button" type="button" aria-label="Einstellungen öffnen" title="Einstellungen öffnen">
      <svg class="home-header-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1H3v-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"></path></svg>
    </button>
    <button class="home-profile-button home-user-button" type="button" aria-label="Profil öffnen" title="Profil öffnen">
      <svg class="home-header-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4.5 21a7.5 7.5 0 0 1 15 0c-2.2 1.25-12.8 1.25-15 0Z"></path></svg>
    </button>
    <header class="hero-header">
      <img class="hero-logo" src="${heroLogo}" alt="BLOBBA">
    </header>
    <div class="home-games-area">
      <section class="game-filters" aria-label="Spiele filtern">
      <label class="game-search games-search-bar">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>
        <input type="search" placeholder="Spiele suchen" value="${escapeHtml(homeSearchQuery)}" aria-label="Spiele suchen">
      </label>
      <div class="game-toolbar">
        <button class="categories-filter-button" type="button" aria-expanded="${categoryMenuOpen}" aria-controls="home-category-menu">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"></path></svg>
          <span>Kategorien</span>
        </button>
        <button class="favorites-filter-button" type="button" aria-pressed="${favoritesOnly}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20.4 3.7 12.7a5.2 5.2 0 0 1 7.4-7.3l.9.9.9-.9a5.2 5.2 0 0 1 7.4 7.3Z"></path></svg>
          <span>Favoriten</span>
        </button>
      </div>
      <div class="category-menu" id="home-category-menu"${categoryMenuOpen ? '' : ' hidden'}>
        ${(['Alle', ...HOME_GAME_CATEGORIES] as HomeGameCategory[]).map((category) => `<button class="category-chip${selectedHomeCategory === category ? ' is-selected' : ''}" type="button" data-home-category="${category}" aria-pressed="${selectedHomeCategory === category}">${category}</button>`).join('')}
      </div>
      </section>
      <h2 class="home-section-title">Spiele</h2>
      <section class="game-list" aria-label="Spiele">
      <div class="game-tile-wrap" data-home-game="blobfahrer">
        <button class="busfahrer-button blobfahrer-home-button" type="button" aria-label="Busfahrer öffnen">
          <img class="busfahrer-button-image" src="${busfahrerGameImage}" alt="">
          <span class="busfahrer-button-label">BLOBB-FAHRER</span>
        </button>
        ${favoriteHeartMarkup('blobfahrer')}
      </div>
      <div class="game-tile-wrap" data-home-game="blobben">
        <button class="busfahrer-button klatschen-home-button" type="button" aria-label="Blobben öffnen">
          <img class="busfahrer-button-image" src="${blobbenGameImage}" alt="">
          <span class="busfahrer-button-label">BLOBBEN</span>
        </button>
        ${favoriteHeartMarkup('blobben')}
      </div>
        <p class="game-filter-empty" role="status" hidden></p>
      </section>
    </div>
  </main>`
  app.querySelector<HTMLButtonElement>('.home-user-button')!.addEventListener('click', () => { playSound('ui-click'); window.location.hash = 'profile' })
  app.querySelector<HTMLButtonElement>('.home-settings-button')!.addEventListener('click', () => { playSound('ui-click'); window.location.hash = 'settings' })
  app.querySelector<HTMLButtonElement>('.blobfahrer-home-button')!.addEventListener('click', () => {
    playActionSound('select')
    activeGame = 'busfahrer'
    setupMode = 'offline'
    activeOnlineModal = null
    window.location.hash = 'busfahrer-menu'
  })
  app.querySelector<HTMLButtonElement>('.klatschen-home-button')!.addEventListener('click', () => {
    playSound('ui-click')
    activeGame = 'klatschen'
    setupMode = 'offline'
    activeOnlineModal = null
    window.location.hash = 'klatschen-menu'
  })
  app.querySelector<HTMLInputElement>('.game-search input')!.addEventListener('input', (event) => {
    homeSearchQuery = (event.currentTarget as HTMLInputElement).value
    updateHomeFilters()
  })
  app.querySelector<HTMLButtonElement>('.categories-filter-button')!.addEventListener('click', () => {
    playSound('ui-click')
    categoryMenuOpen = !categoryMenuOpen
    updateCategoryMenu()
  })
  app.querySelectorAll<HTMLButtonElement>('.category-chip').forEach((button) => {
    button.addEventListener('click', () => {
      playSound('ui-click')
      selectedHomeCategory = button.dataset.homeCategory as HomeGameCategory
      categoryMenuOpen = false
      updateCategoryMenu()
      updateHomeFilters()
    })
  })
  app.querySelector<HTMLButtonElement>('.favorites-filter-button')!.addEventListener('click', () => {
    playSound('ui-click')
    favoritesOnly = !favoritesOnly
    updateHomeFilters()
  })
  app.querySelectorAll<HTMLButtonElement>('.favorite-heart-button').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const gameId = button.dataset.favoriteGame!
      const wasFavorite = favoriteGameIds.has(gameId)
      wasFavorite ? favoriteGameIds.delete(gameId) : favoriteGameIds.add(gameId)
      playSound(wasFavorite ? 'favorite-off' : 'favorite-on')
      try {
        localStorage.setItem(FAVORITE_GAMES_STORAGE_KEY, JSON.stringify([...favoriteGameIds]))
      } catch {
        // Favoriten funktionieren weiterhin für die aktuelle Sitzung.
      }
      updateHomeFilters()
    })
  })
  updateCategoryMenu()
  updateHomeFilters()
}

function renderSettingsPlaceholder() {
  const sound = getSoundSettings()
  setupShell(`<div class="setup-panel sound-settings-panel"><h2>Einstellungen</h2>
    <div class="sound-setting-row"><div><strong>Soundeffekte</strong><p class="setup-copy">Töne für Bedienung und Spielaktionen</p></div><label class="sound-toggle"><input type="checkbox" data-sound-enabled ${sound.enabled ? 'checked' : ''}><span aria-hidden="true"></span></label></div>
    <label class="sound-volume-row"><span>Lautstärke</span><input type="range" min="0" max="100" step="1" value="${Math.round(sound.volume * 100)}" data-sound-volume ${sound.enabled ? '' : 'disabled'}><output data-sound-volume-output>${Math.round(sound.volume * 100)} %</output></label>
  </div>`, '', 'EINSTELLUNGEN')
  const enabled = app.querySelector<HTMLInputElement>('[data-sound-enabled]')!
  const volume = app.querySelector<HTMLInputElement>('[data-sound-volume]')!
  const output = app.querySelector<HTMLOutputElement>('[data-sound-volume-output]')!
  enabled.addEventListener('change', () => {
    if (!enabled.checked) playSound('ui-click')
    setSoundEffectsEnabled(enabled.checked)
    volume.disabled = !enabled.checked
    if (enabled.checked) playSound('ui-confirm')
  })
  volume.addEventListener('input', () => {
    const value = Number(volume.value)
    setSoundEffectsVolume(value / 100)
    output.value = `${value} %`
  })
  volume.addEventListener('change', () => playSound('ui-confirm'))
}

function normalizeGameSearch(value: string) {
  return value.trim().toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '')
}

function loadFavoriteGameIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITE_GAMES_STORAGE_KEY) || '[]')
    const validIds = new Set<string>(HOME_GAMES.map((game) => game.id))
    return new Set<string>(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && validIds.has(id)) : [])
  } catch {
    return new Set<string>()
  }
}

function favoriteHeartMarkup(gameId: string) {
  const isFavorite = favoriteGameIds.has(gameId)
  return `<button class="favorite-heart-button${isFavorite ? ' is-favorite' : ''}" type="button" data-favorite-game="${gameId}" aria-label="${isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}" aria-pressed="${isFavorite}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20.4 3.7 12.7a5.2 5.2 0 0 1 7.4-7.3l.9.9.9-.9a5.2 5.2 0 0 1 7.4 7.3Z"></path></svg></button>`
}

function updateHomeFilters() {
  const normalizedQuery = normalizeGameSearch(homeSearchQuery)
  let visibleCount = 0
  HOME_GAMES.forEach((game) => {
    const searchableTerms = game.searchTerms.map(normalizeGameSearch)
    const matchesSearch = !normalizedQuery || searchableTerms.some((term) => term.includes(normalizedQuery))
    const matchesCategory = selectedHomeCategory === 'Alle' || (game.categories as readonly string[]).includes(selectedHomeCategory)
    const visible = matchesSearch && matchesCategory && (!favoritesOnly || favoriteGameIds.has(game.id))
    const tile = app.querySelector<HTMLElement>(`[data-home-game="${game.id}"]`)
    if (tile) tile.hidden = !visible
    if (visible) visibleCount += 1
    const heart = tile?.querySelector<HTMLButtonElement>('.favorite-heart-button')
    const isFavorite = favoriteGameIds.has(game.id)
    heart?.classList.toggle('is-favorite', isFavorite)
    heart?.setAttribute('aria-pressed', String(isFavorite))
    heart?.setAttribute('aria-label', isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen')
  })
  const filterButton = app.querySelector<HTMLButtonElement>('.favorites-filter-button')
  filterButton?.classList.toggle('is-active', favoritesOnly)
  filterButton?.setAttribute('aria-pressed', String(favoritesOnly))
  const emptyMessage = app.querySelector<HTMLElement>('.game-filter-empty')
  if (!emptyMessage) return
  emptyMessage.hidden = visibleCount > 0
  if (visibleCount === 0) {
    emptyMessage.textContent = favoritesOnly
      ? favoriteGameIds.size === 0 && !normalizedQuery && selectedHomeCategory === 'Alle' ? 'Noch keine Favoriten' : 'Keine passenden Favoriten'
      : normalizedQuery && selectedHomeCategory !== 'Alle' ? 'Kein passendes Spiel gefunden'
        : normalizedQuery ? 'Kein Spiel gefunden'
          : 'Keine Spiele in dieser Kategorie'
  }
}

function updateCategoryMenu() {
  const menu = app.querySelector<HTMLElement>('.category-menu')
  const button = app.querySelector<HTMLButtonElement>('.categories-filter-button')
  if (menu) menu.hidden = !categoryMenuOpen
  button?.setAttribute('aria-expanded', String(categoryMenuOpen))
  button?.classList.toggle('is-active', categoryMenuOpen || selectedHomeCategory !== 'Alle')
  app.querySelectorAll<HTMLButtonElement>('.category-chip').forEach((chip) => {
    const selected = chip.dataset.homeCategory === selectedHomeCategory
    chip.classList.toggle('is-selected', selected)
    chip.setAttribute('aria-pressed', String(selected))
  })
}

function setupShell(content: string, backTarget: string, title = 'BLOBB-FAHRER', eyebrow = 'BLOBBA präsentiert', pageClass = '', centerTitle = true) {
  pendingKeyboardPositionCleanup?.()
  pendingKeyboardPositionCleanup = undefined
  app.innerHTML = `<main class="busfahrer-page setup-page ${pageClass}"><div class="busfahrer-shell setup-shell">
    <header class="busfahrer-header"><button class="back-button bus-back" type="button" data-setup-back>← Zurück</button>${centerTitle ? '<span></span>' : `<div><p>${eyebrow}</p><h1>${title}</h1></div>`}<span></span></header>
    <section class="setup-stage"><div class="setup-stack">${centerTitle ? `<h1 class="setup-title">${title}</h1>` : ''}${content}</div></section>
  </div></main>`
  app.querySelector<HTMLButtonElement>('[data-setup-back]')!.addEventListener('click', () => { playSound('ui-back'); window.location.hash = backTarget })
}

function renderModeMenu() {
  setupShell(`<div class="setup-panel setup-game-panel">
    ${renderModeSwitch()}
    ${setupMode === 'offline' ? renderOfflineSetupContent() : renderOnlineSetupContent()}
  </div>${renderOnlineModal()}`, '', gameTitle())
  app.querySelector<HTMLButtonElement>('[data-add-player]')?.replaceChildren('+ Spieler')
  bindSetupModeSwitch()
  setupMode === 'offline' ? bindOfflineSetup() : bindOnlineSetup()
  bindOnlineModal()
  maybeAutoJoinInvite()
}

function renderModeSwitch() {
  return `<div class="setup-mode-switch" aria-label="Spielmodus">
    <button class="game-button ${setupMode === 'offline' ? 'primary is-active' : 'is-inactive'}" type="button" data-setup-mode="offline" aria-pressed="${setupMode === 'offline'}">Offline</button>
    <button class="game-button ${setupMode === 'online' ? 'primary is-active' : 'is-inactive'}" type="button" data-setup-mode="online" aria-pressed="${setupMode === 'online'}">Online</button>
  </div>`
}

function renderOfflineSetupContent() {
  return `<section class="offline-panel" aria-label="Offline-Spieler">
    <h2>Spieler</h2>
    ${renderPlayerTable(players, { editable: true, canRemove: true })}
    <button class="game-button setup-add-player" type="button" data-add-player ${players.length >= MAX_PLAYERS ? 'disabled' : ''}>+ Spieler hinzufÃ¼gen</button>
    <button class="game-button primary setup-start-game" type="button" data-start-game>Spiel starten</button>
  </section>${renderPlayerAvatarEditor()}`
}

function renderOnlineSetupContent() {
  const isReady = onlineAvailable()
  const isLoggedIn = Boolean(currentUser())
  const groupMatches = onlineGroup.joined && onlineGroup.gameKey === activeGame
  const canStart = groupMatches && onlineGroup.isHost && onlineGroup.players.length > 0
  const link = groupMatches ? inviteUrl(onlineGroup.inviteCode, activeGame) : ''
  return `<section class="online-panel" aria-label="Online-Gruppe">
    <h2>Online-Gruppe</h2>
    ${!isReady ? '<p class="setup-copy">Supabase ist noch nicht konfiguriert. Der Gastmodus bleibt offline spielbar.</p>' : ''}
    ${isReady && !isLoggedIn ? '<p class="setup-copy">Melde dich im Profil an, um Online-Gruppen zu nutzen.</p><button class="game-button primary" type="button" data-open-profile-login>Login</button>' : ''}
    ${isReady && isLoggedIn ? `<div class="online-actions">
      <button class="game-button" type="button" data-online-create>Gruppe erstellen</button>
      <button class="game-button" type="button" data-online-join>Gruppe beitreten</button>
    </div>` : ''}
    ${groupMatches ? `<div class="online-group-tools"><button class="game-button setup-invite-button" type="button" data-online-invite>Einladen</button></div>
      <div class="online-invite-link"><input class="setup-text-input" value="${escapeHtml(link)}" readonly aria-label="Einladungslink"><button class="game-button" type="button" data-copy-invite>Kopieren</button><a class="game-button online-share-button" href="https://wa.me/?text=${encodeURIComponent(link)}" target="_blank" rel="noreferrer">WhatsApp</a></div>
      ${renderPlayerTable(onlineGroup.players, { editable: false, canRemove: onlineGroup.isHost })}` : '<p class="setup-copy">Erstelle eine Gruppe oder tritt einer bestehenden Gruppe bei.</p>'}
    ${onlineNotice ? `<p class="setup-copy">${escapeHtml(onlineNotice)}</p>` : ''}
    <button class="game-button primary setup-start-game" type="button" data-start-game ${canStart ? '' : 'disabled'}>${groupMatches && onlineGroup.isHost ? 'Spiel starten' : 'Warten auf Host'}</button>
  </section>`
}

function renderPlayerTable(playerList: SetupPlayer[], options: { editable: boolean; canRemove: boolean }) {
  return `<div class="player-table" role="list">${playerList.map((player, index) => `<div class="player-row" role="listitem" data-player-row="${player.id}">
    ${options.editable
      ? `<button class="player-avatar-trigger" type="button" data-edit-player-avatar="${player.id}" aria-label="Profilbild von ${escapeHtml(player.name || defaultPlayerName(index + 1))} ändern" title="Profilbild ändern">${playerAvatarMarkup(player)}</button>`
      : playerAvatarMarkup(player)}
    ${options.editable
      ? editingPlayerId === player.id
        ? playerNameInputMarkup(player, index)
        : `<button class="player-entry-trigger" type="button" data-edit-player-entry="${player.id}" aria-label="Spieler ${index + 1} bearbeiten">${escapeHtml(player.name || defaultPlayerName(index + 1))}</button>`
      : `<strong class="player-name">${escapeHtml(player.name || defaultPlayerName(index + 1))}</strong>`}
    ${options.canRemove ? removePlayerButtonMarkup(player.id, playerList.length === 1) : ''}
  </div>`).join('')}</div>`
}

function removePlayerButtonMarkup(playerId: string, disabled: boolean) {
  return `<button class="player-remove" type="button" data-remove-player="${playerId}" aria-label="Spieler entfernen" title="Spieler entfernen" ${disabled ? 'disabled' : ''}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"></path></svg></button>`
}

function renderPlayerAvatarEditor() {
  const player = players.find((item) => item.id === avatarEditorPlayerId)
  if (!player) return ''
  const usedByOtherPlayers = new Set(players
    .filter((item) => item.id !== player.id)
    .map((item) => item.avatarId)
    .filter((avatarId): avatarId is string => Boolean(avatarId)))
  return `<div class="setup-modal-backdrop player-avatar-modal" role="dialog" aria-modal="true" aria-labelledby="player-avatar-title">
    <div class="setup-modal player-avatar-dialog">
      <h2 id="player-avatar-title">Profilbild für ${escapeHtml(player.name)}</h2>
      <div class="avatar-choice-grid">${avatarOptions.map((avatar) => {
        const unavailable = usedByOtherPlayers.has(avatar.id)
        const selected = player.avatarId === avatar.id
        return `<button class="avatar-choice ${selected ? 'is-selected' : ''} ${unavailable ? 'is-unavailable' : ''}" type="button" data-player-avatar-id="${avatar.id}" aria-label="${avatar.label}${unavailable ? ' – bereits verwendet' : ''}" aria-pressed="${selected}" ${unavailable ? 'disabled' : ''}><span class="avatar-choice-visual" style="--avatar-ring:${avatar.color}">${avatarVisualMarkup(avatar.id)}</span></button>`
      }).join('')}</div>
      <button class="game-button" type="button" data-close-player-avatar>Schließen</button>
    </div>
  </div>`
}

function playerNameInputMarkup(player: SetupPlayer, index: number) {
  const safeId = player.id.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `<input class="player-entry-input" id="blobba-entry-${safeId}" name="blobba-entry" type="text" data-player-entry="${player.id}" value="${escapeHtml(player.name || defaultPlayerName(index + 1))}" maxlength="24" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" inputmode="text" aria-label="Spieler ${index + 1} bearbeiten">`
}

function renderOnlineModal() {
  if (!activeOnlineModal) return ''
  if (activeOnlineModal === 'invite') {
    return `<div class="setup-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="online-invite-title">
      <div class="setup-modal">
        <h2 id="online-invite-title">Einladen</h2>
        <p class="setup-copy">Teile diesen Gruppencode mit deinen Mitspielern.</p>
        <output class="invite-code">${escapeHtml(onlineGroup.inviteCode)}</output>
        <button class="game-button primary" type="button" data-modal-close>Fertig</button>
      </div>
    </div>`
  }
  const isCreate = activeOnlineModal === 'create'
  return `<div class="setup-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="online-modal-title">
    <form class="setup-modal" data-online-modal-form>
      <h2 id="online-modal-title">${isCreate ? 'Gruppe erstellen' : 'Gruppe beitreten'}</h2>
      <label class="profile-name-label" for="online-group-input">${isCreate ? 'Gruppenname' : 'Gruppencode'}</label>
      <input class="profile-name-input" id="online-group-input" name="online-group-input" value="${isCreate ? 'BLOBBA' : ''}" maxlength="24" autocomplete="off" required>
      <div class="modal-actions">
        <button class="game-button" type="button" data-modal-close>Abbrechen</button>
        <button class="game-button primary" type="submit">${isCreate ? 'Erstellen' : 'Beitreten'}</button>
      </div>
    </form>
  </div>`
}

function bindSetupModeSwitch() {
  app.querySelectorAll<HTMLButtonElement>('[data-setup-mode]').forEach((button) => button.addEventListener('click', () => {
    playSound('ui-click')
    setupMode = button.dataset.setupMode === 'online' ? 'online' : 'offline'
    activeOnlineModal = null
    renderModeMenu()
  }))
}

function bindOfflineSetup() {
  app.querySelectorAll<HTMLButtonElement>('[data-edit-player-entry]').forEach((button) => button.addEventListener('click', () => {
    const playerId = button.dataset.editPlayerEntry
    if (!playerId) return
    editingPlayerId = playerId
    renderModeMenu()
    focusPlayerNameInput(playerId)
  }))
  app.querySelectorAll<HTMLInputElement>('[data-player-entry]').forEach((input) => {
    const selectName = () => requestAnimationFrame(() => {
      input.select()
      input.setSelectionRange(0, input.value.length)
    })
    input.addEventListener('focus', selectName)
    input.addEventListener('click', (event) => {
      event.stopPropagation()
      selectName()
    })
    input.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    input.addEventListener('pointerup', (event) => event.stopPropagation())
    input.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true })
    input.addEventListener('touchend', (event) => {
      event.stopPropagation()
      selectName()
    }, { passive: true })
    input.addEventListener('input', () => {
      players = players.map((player) => player.id === input.dataset.playerEntry ? { ...player, name: input.value } : player)
    })
  })
  app.querySelectorAll<HTMLButtonElement>('[data-remove-player]').forEach((button) => button.addEventListener('click', () => {
    if (players.length === 1) return
    playActionSound('remove-player')
    if (editingPlayerId === button.dataset.removePlayer) editingPlayerId = null
    players = players.filter((player) => player.id !== button.dataset.removePlayer)
    renderModeMenu()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-edit-player-avatar]').forEach((button) => button.addEventListener('click', () => {
    playSound('ui-click')
    editingPlayerId = null
    avatarEditorPlayerId = button.dataset.editPlayerAvatar ?? null
    renderModeMenu()
  }))
  app.querySelector<HTMLButtonElement>('[data-close-player-avatar]')?.addEventListener('click', () => {
    playSound('ui-back')
    avatarEditorPlayerId = null
    renderModeMenu()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-player-avatar-id]').forEach((button) => button.addEventListener('click', () => {
    const avatarId = button.dataset.playerAvatarId
    if (!avatarId || !avatarEditorPlayerId || button.disabled) return
    playActionSound('select')
    players = players.map((player) => player.id === avatarEditorPlayerId
      ? { ...player, avatarId, avatar: avatarSource(avatarId), avatarColor: avatarColor(avatarId) }
      : player)
    avatarEditorPlayerId = null
    renderModeMenu()
  }))
  app.querySelector<HTMLButtonElement>('[data-add-player]')!.addEventListener('click', () => {
    if (players.length >= MAX_PLAYERS) return
    playActionSound('add-player')
    const player = createLocalPlayer(players.length + 1)
    players.push(player)
    editingPlayerId = player.id
    renderModeMenu()
    focusPlayerNameInput(player.id)
  })
  app.querySelector<HTMLButtonElement>('[data-start-game]')!.addEventListener('click', () => {
    startSetupGame(players, true)
  })
}

function focusPlayerNameInput(playerId: string) {
  const input = app.querySelector<HTMLInputElement>(`[data-player-entry="${playerId}"]`)
  if (!input) return
  input.focus({ preventScroll: true })
  requestAnimationFrame(() => {
    input.select()
    input.setSelectionRange(0, input.value.length)
  })
  positionAddPlayerOnceAboveKeyboard()
}

function positionAddPlayerOnceAboveKeyboard() {
  pendingKeyboardPositionCleanup?.()
  const viewport = window.visualViewport
  const stage = app.querySelector<HTMLElement>('.setup-stage')
  const addPlayerButton = app.querySelector<HTMLElement>('[data-add-player]')
  if (!viewport || !stage || !addPlayerButton) return

  const cleanup = () => {
    viewport.removeEventListener('resize', position)
    viewport.removeEventListener('scroll', position)
    if (pendingKeyboardPositionCleanup === cleanup) pendingKeyboardPositionCleanup = undefined
  }
  const position = () => {
    const keyboardHeight = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    if (keyboardHeight < 80) return
    cleanup()
    stage.style.setProperty('--keyboard-position-space', `${Math.ceil(keyboardHeight)}px`)
    requestAnimationFrame(() => {
      const keyboardTop = viewport.offsetTop + viewport.height
      const delta = addPlayerButton.getBoundingClientRect().bottom - (keyboardTop - 8)
      if (delta > 0) stage.scrollTop += delta
    })
  }

  pendingKeyboardPositionCleanup = cleanup
  viewport.addEventListener('resize', position)
  viewport.addEventListener('scroll', position)
  position()
}

function bindOnlineSetup() {
  app.querySelector<HTMLButtonElement>('[data-open-profile-login]')?.addEventListener('click', () => {
    authModal = 'login'
    window.location.hash = 'profile'
  })
  app.querySelector<HTMLButtonElement>('[data-online-create]')?.addEventListener('click', () => {
    activeOnlineModal = 'create'
    renderModeMenu()
  })
  app.querySelector<HTMLButtonElement>('[data-online-join]')?.addEventListener('click', () => {
    activeOnlineModal = 'join'
    renderModeMenu()
  })
  app.querySelector<HTMLButtonElement>('[data-online-invite]')?.addEventListener('click', () => {
    activeOnlineModal = 'invite'
    renderModeMenu()
  })
  app.querySelector<HTMLButtonElement>('[data-copy-invite]')?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(inviteUrl(onlineGroup.inviteCode, activeGame))
    onlineNotice = 'Einladungslink kopiert.'
    renderModeMenu()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-remove-player]').forEach((button) => button.addEventListener('click', () => {
    if (!onlineGroup.isHost || onlineGroup.players.length === 1 || !onlineGroup.groupId || !button.dataset.removePlayer) return
    void removeOnlineMember(onlineGroup.groupId, button.dataset.removePlayer).then(refreshOnlineGroup)
  }))
  app.querySelector<HTMLButtonElement>('[data-start-game]')?.addEventListener('click', () => {
    if (!onlineGroup.joined || !onlineGroup.players.length || !onlineGroup.isHost || !onlineGroup.groupId) return
    const groupId = onlineGroup.groupId
    startSetupGame(onlineGroup.players, false)
    window.setTimeout(() => {
      const state = activeGame === 'klatschen' ? getKlatschenState() : getBusfahrerState()
      onlineGroup.gameState = state
      void updateOnlineGameState(groupId, state, 'playing')
    }, 0)
  })
}

function bindOnlineModal() {
  app.querySelectorAll<HTMLButtonElement>('[data-modal-close]').forEach((button) => button.addEventListener('click', () => {
    activeOnlineModal = null
    renderModeMenu()
  }))
  app.querySelector<HTMLFormElement>('[data-online-modal-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.querySelector<HTMLInputElement>('#online-group-input')!
    if (!input.value.trim()) {
      input.reportValidity()
      return
    }
    void submitOnlineModal(input.value.trim())
  })
  const modalInput = app.querySelector<HTMLInputElement>('#online-group-input')
  if (modalInput) window.setTimeout(() => {
    modalInput.focus()
    modalInput.select()
  }, 0)
}

async function submitOnlineModal(value: string) {
  try {
    const user = currentUser()
    if (!user) throw new Error('Bitte zuerst einloggen.')
    const profile = currentOnlineProfile()
    await trySyncRemoteProfile()
    const wasCreate = activeOnlineModal === 'create'
    const group = wasCreate
      ? await createOnlineGroup(user, profile.name, profile.avatarId, activeGame === 'klatschen' ? 'klatschen' : 'blobfahrer')
      : await joinOnlineGroup(value, user, profile.name, profile.avatarId)
    const snapshot = await fetchGroupSnapshot(group.id)
    applyOnlineSnapshot(snapshot.group, snapshot.members)
    subscribeCurrentGroup()
    activeOnlineModal = null
    onlineNotice = wasCreate ? 'Gruppe erstellt.' : 'Gruppe beigetreten.'
    renderModeMenu()
  } catch (error) {
    onlineNotice = error instanceof Error ? error.message : 'Online-Aktion fehlgeschlagen.'
    activeOnlineModal = null
    renderModeMenu()
  }
}

function maybeAutoJoinInvite() {
  if (setupMode !== 'online' || !pendingInviteCode || !currentUser() || onlineGroup.inviteCode === pendingInviteCode) return
  const inviteCode = pendingInviteCode
  pendingInviteCode = null
  void submitOnlineInvite(inviteCode)
}

async function submitOnlineInvite(inviteCode: string) {
  try {
    const user = currentUser()
    if (!user) throw new Error('Bitte zuerst einloggen.')
    const profile = currentOnlineProfile()
    await syncRemoteProfile()
    const group = await joinOnlineGroup(inviteCode, user, profile.name, profile.avatarId)
    const snapshot = await fetchGroupSnapshot(group.id)
    applyOnlineSnapshot(snapshot.group, snapshot.members)
    subscribeCurrentGroup()
    onlineNotice = 'Gruppe beigetreten.'
    renderModeMenu()
  } catch (error) {
    onlineNotice = error instanceof Error ? error.message : 'Einladungslink konnte nicht geöffnet werden.'
    renderModeMenu()
  }
}

function startSetupGame(playerList: SetupPlayer[], rememberProfiles: boolean) {
  playSound('game-start')
  gamePlayerSnapshot = playerList.map((player, index) => ({ ...player, name: player.name.trim() || defaultPlayerName(index + 1) }))
  if (rememberProfiles) {
    profileStore.lastUsedProfileIds = players
      .map((player) => player.profileId)
      .filter((id) => profileStore.profiles.some((profile) => profile.id === id))
    saveProfileStore()
  }
  window.location.hash = activeGame
}

function renderOldModeMenu() {
  setupShell(`<div class="setup-panel mode-panel"><h2>Wie möchtest du spielen?</h2>
    <div class="setup-mode-actions"><button class="game-button primary" type="button" data-mode="offline">Offline</button><button class="game-button" type="button" data-mode="online">Online</button></div>
  </div>`, '')
  app.querySelector<HTMLButtonElement>('[data-mode="offline"]')!.addEventListener('click', () => { window.location.hash = 'busfahrer-offline' })
  app.querySelector<HTMLButtonElement>('[data-mode="online"]')!.addEventListener('click', () => { window.location.hash = 'busfahrer-online' })
}

function renderOnlineMenu() {
  setupMode = 'online'
  renderModeMenu()
  return
  setupShell('<div class="setup-panel"><p class="eyebrow">Online</p><h2>Online-Spiel</h2><p class="setup-copy">Der Online-Modus wird als Nächstes eingerichtet.</p></div>', 'busfahrer-menu')
}

function renderOfflineMenu() {
  setupMode = 'offline'
  renderModeMenu()
}

function renderProfilePicker() {
  const selectedIds = new Set(players.map((player) => player.profileId))
  const availableProfiles = profileStore.profiles.filter((profile) => !selectedIds.has(profile.id))
  setupShell(`<div class="setup-panel profile-picker-panel"><p class="eyebrow">Spieler hinzufügen</p><h2>Profil auswählen</h2>
    <div class="saved-profile-grid">${availableProfiles.length ? availableProfiles.map((profile) => `<button class="saved-profile-card" type="button" data-select-profile="${profile.id}">
      ${playerAvatarMarkup({ avatarId: profile.avatarId, avatarColor: avatarColor(profile.avatarId), name: profile.name }, 'profile-card-avatar')}
      <strong>${escapeHtml(profile.name || 'Profil ohne Namen')}</strong><span>Auswählen</span>
    </button>`).join('') : '<p class="profile-empty-copy">Alle gespeicherten Profile sind bereits im Spiel.</p>'}</div>
    <button class="game-button primary profile-create-button" type="button" data-create-profile>Neues Profil anlegen</button>
  </div>`, gameRoute('-offline'))

  app.querySelectorAll<HTMLButtonElement>('[data-select-profile]').forEach((button) => button.addEventListener('click', () => {
    const profile = profileStore.profiles.find((item) => item.id === button.dataset.selectProfile)
    if (profile && players.length < MAX_PLAYERS) players.push(setupPlayerFromProfile(profile))
    window.location.hash = gameRoute('-offline')
  }))
  app.querySelector<HTMLButtonElement>('[data-create-profile]')!.addEventListener('click', () => {
    profileEditorContext = { mode: 'new-player' }
    window.location.hash = gameRoute('-profile-editor')
  })
}

function renderAuthModal() {
  if (!authModal) return ''
  const isRegister = authModal === 'register'
  return `<div class="setup-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
    <form class="setup-modal" data-auth-form>
      <h2 id="auth-modal-title">${isRegister ? 'Registrieren' : 'Login'}</h2>
      ${authNotice ? `<p class="setup-copy" data-auth-notice>${escapeHtml(authNotice)}</p>` : ''}
      <label class="profile-name-label" for="auth-email">E-Mail</label>
      <input class="profile-name-input" id="auth-email" type="email" autocomplete="email" required>
      <label class="profile-name-label" for="auth-password">Passwort</label>
      <input class="profile-name-input" id="auth-password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="6" required>
      <div class="modal-actions">
        <button class="game-button" type="button" data-auth-close>Abbrechen</button>
        <button class="game-button primary" type="submit">${isRegister ? 'Registrieren' : 'Login'}</button>
      </div>
      <button class="game-button auth-switch-button" type="button" data-auth-switch>${isRegister ? 'Zum Login' : 'Registrieren'}</button>
    </form>
  </div>`
}

function bindAuthModal() {
  app.querySelector<HTMLButtonElement>('[data-auth-close]')?.addEventListener('click', () => {
    authModal = null
    authNotice = ''
    renderProfileEditor()
  })
  app.querySelector<HTMLButtonElement>('[data-auth-switch]')?.addEventListener('click', () => {
    authModal = authModal === 'login' ? 'register' : 'login'
    authNotice = ''
    renderProfileEditor()
  })
  app.querySelector<HTMLFormElement>('[data-auth-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const email = app.querySelector<HTMLInputElement>('#auth-email')!.value.trim()
    const password = app.querySelector<HTMLInputElement>('#auth-password')!.value
    void submitAuth(email, password)
  })
}

async function submitAuth(email: string, password: string) {
  try {
    const mode = authModal
    console.log('[Auth] submit', mode)
    if (mode === 'register') {
      const data = await signUp(email, password)
      authSession = data.session
      if (!data.session) {
        authNotice = 'Registrierung erfolgreich. Bitte bestätige deine E-Mail.'
        console.log('[Auth] registration needs email confirmation')
        renderProfileEditor()
        return
      }
    } else {
      authSession = await signIn(email, password)
    }
    authSession = await getSession()
    console.log('[Auth] session after submit', authSession)
    if (!authSession) {
      authNotice = 'Login nicht abgeschlossen. Bitte prüfe deine E-Mail oder dein Passwort.'
      renderProfileEditor()
      return
    }
    authModal = null
    authNotice = ''
    await syncRemoteProfile()
    renderProfileEditor()
  } catch (error) {
    console.error('[Auth] submit error', error)
    authNotice = error instanceof Error ? error.message : 'Login fehlgeschlagen.'
    renderProfileEditor()
  }
}

function renderProfileEditor() {
  const isPrimary = profileEditorContext.mode === 'primary'
  const isNew = profileEditorContext.mode === 'new-player'
  const storedProfile = isNew ? undefined : profileStore.profiles.find((profile) => profile.id === profileEditorContext.profileId)
  const draftProfile: StoredProfile = storedProfile ? { ...storedProfile, avatarId: storedProfile.avatarId ?? DEFAULT_AVATAR_ID } : { id: createId(), name: '', avatarId: DEFAULT_AVATAR_ID }
  let selectedAvatarId = draftProfile.avatarId ?? DEFAULT_AVATAR_ID
  const backTarget = isPrimary ? '' : profileEditorContext.mode === 'edit-player' ? gameRoute('-offline') : gameRoute('-profile-picker')

  setupShell(`<form class="setup-panel profile-editor-panel" data-profile-form>
    <div class="profile-auth-row"><button class="game-button profile-auth-button" type="button" data-auth-action="${currentUser() ? 'logout' : 'login'}">${currentUser() ? 'Logout' : 'Login'}</button></div>
    <p class="eyebrow">${isPrimary ? 'Benutzerprofil' : isNew ? 'Neues Spielerprofil' : 'Spielerprofil'}</p>
    <h2>${isPrimary ? 'Dein Profil' : isNew ? 'Profil anlegen' : 'Profil bearbeiten'}</h2>
    <div class="profile-preview" data-profile-preview style="--avatar-ring:${avatarColor(selectedAvatarId)}">${avatarVisualMarkup(selectedAvatarId)}</div>
    <label class="profile-name-label" for="profile-name">Spielername</label>
    <input class="profile-name-input" id="profile-name" name="profile-name" value="${escapeHtml(draftProfile.name)}" maxlength="24" autocomplete="nickname" placeholder="Spielername eingeben">
    <fieldset class="avatar-fieldset"><legend>Profilbild</legend><div class="avatar-choice-grid">
      ${avatarOptions.map((avatar) => `<button class="avatar-choice ${selectedAvatarId === avatar.id ? 'is-selected' : ''}" type="button" data-avatar-id="${avatar.id}" aria-label="${avatar.label}" aria-pressed="${selectedAvatarId === avatar.id}"><span class="avatar-choice-visual" style="--avatar-ring:${avatar.color}">${avatarVisualMarkup(avatar.id)}</span></button>`).join('')}
    </div></fieldset>
    <button class="game-button primary profile-save-button" type="submit">Speichern</button>
  </form>${renderAuthModal()}`, backTarget, 'Profil', 'BLOBBA', 'profile-page', false)

  const preview = app.querySelector<HTMLElement>('[data-profile-preview]')!
  const input = app.querySelector<HTMLInputElement>('#profile-name')!
  bindAuthModal()
  app.querySelector<HTMLButtonElement>('[data-auth-action]')?.addEventListener('click', () => {
    if (currentUser()) {
      console.log('[Auth] logout button clicked')
      void signOut().then(async () => {
        authSession = await getSession()
        console.log('[Auth] session after logout', authSession)
        authSession = null
        authModal = null
        authNotice = ''
        renderProfileEditor()
      })
    } else {
      console.log('[Auth] login button clicked')
      authModal = 'login'
      authNotice = ''
      renderProfileEditor()
    }
  })
  app.querySelectorAll<HTMLButtonElement>('[data-avatar-id]').forEach((button) => button.addEventListener('click', () => {
    selectedAvatarId = button.dataset.avatarId || DEFAULT_AVATAR_ID
    app.querySelectorAll<HTMLButtonElement>('[data-avatar-id]').forEach((choice) => {
      const selected = (choice.dataset.avatarId || null) === selectedAvatarId
      choice.classList.toggle('is-selected', selected)
      choice.setAttribute('aria-pressed', String(selected))
    })
    preview.style.setProperty('--avatar-ring', avatarColor(selectedAvatarId))
    preview.innerHTML = avatarVisualMarkup(selectedAvatarId)
  }))
  app.querySelector<HTMLFormElement>('[data-profile-form]')!.addEventListener('submit', (event) => {
    event.preventDefault()
    const name = input.value.trim()
    if (isNew && !name) {
      input.setCustomValidity('Bitte gib einen Spielernamen ein.')
      input.reportValidity()
      return
    }
    input.setCustomValidity('')
    draftProfile.name = name
    draftProfile.avatarId = selectedAvatarId
    if (isNew) {
      profileStore.profiles.push(draftProfile)
      players.push(setupPlayerFromProfile(draftProfile))
    } else if (storedProfile) {
      storedProfile.name = draftProfile.name
      storedProfile.avatarId = draftProfile.avatarId
      syncSetupPlayers(storedProfile)
    }
    saveProfileStore()
    playSound('ui-confirm')
    void trySyncRemoteProfile()
    window.location.hash = isPrimary ? '' : gameRoute('-offline')
  })
}

void renderOldModeMenu

window.addEventListener('hashchange', renderPage)
onAuthChanged((session) => {
  authSession = session
  if (!session) onlineUnsubscribe?.()
  renderPage()
})
void loadAuthState()
renderPage()
