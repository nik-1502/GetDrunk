import './style.css'
import { mountBusfahrer } from './busfahrer.ts'
import { avatarColor, avatarOptions, avatarSource, avatarVisualMarkup } from './profiles.ts'
import userButtonImage from './assets/benutzer/4c0c56d3-a7e5-4be3-81b0-fda84fd67cbf.png'
import heroLogo from './assets/überschrift/ebe5baf7-8dca-44a0-a5bc-ba2f48425dc2.png'

const app = document.querySelector<HTMLDivElement>('#app')!
const PROFILE_STORAGE_KEY = 'getdrunk.profiles.v1'
const MAX_PLAYERS = 10
const DEFAULT_AVATAR_ID = 'bier'

type StoredProfile = { id: string; name: string; avatarId: string | null }
type ProfileStore = { profiles: StoredProfile[]; activeProfileId: string; lastUsedProfileIds: string[] }
type SetupPlayer = { id: string; profileId: string; name: string; avatarId: string | null; avatar: string; avatarColor: string }
type ProfileEditorContext = { mode: 'primary' | 'new-player' | 'edit-player'; profileId?: string }

let unmountCurrentPage: (() => void) | undefined
let profileStore = loadProfileStore()
let players = suggestedPlayers()
let gamePlayerSnapshot: SetupPlayer[] = []
let profileEditorContext: ProfileEditorContext = { mode: 'primary' }
let pendingPlayerNameFocusId: string | undefined

const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!
const zoomableViewport = 'width=device-width, initial-scale=1.0, user-scalable=yes, maximum-scale=5.0'
const resetViewport = 'width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0'

function createId() {
  return crypto.randomUUID()
}

function createDefaultProfileStore(): ProfileStore {
  const profile = { id: createId(), name: '', avatarId: DEFAULT_AVATAR_ID }
  return { profiles: [profile], activeProfileId: profile.id, lastUsedProfileIds: [profile.id] }
}

function loadProfileStore(): ProfileStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '') as Partial<ProfileStore>
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
    name: `Spieler ${index}`,
    avatarId,
    avatar: avatarSource(avatarId),
    avatarColor: avatarColor(avatarId),
  }
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

function resetPinchZoom() {
  if (!window.visualViewport || window.visualViewport.scale <= 1.01) return
  viewportMeta.content = resetViewport
  window.setTimeout(() => { viewportMeta.content = zoomableViewport }, 80)
}

document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false })
document.addEventListener('touchend', (event) => {
  if (event.touches.length === 0) resetPinchZoom()
}, { passive: true })
document.addEventListener('gestureend', resetPinchZoom, { passive: true })

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function playerAvatarMarkup(player: Pick<SetupPlayer, 'avatarId' | 'name' | 'avatarColor'>, className = 'player-avatar') {
  return `<span class="${className} ${player.avatarId ? '' : 'is-default'}" style="--avatar-ring:${player.avatarColor}">${avatarVisualMarkup(player.avatarId, `Profilbild von ${escapeHtml(player.name)}`)}</span>`
}

function renderPage() {
  unmountCurrentPage?.()
  unmountCurrentPage = undefined

  const route = window.location.hash
  const usesDarkTheme = route.startsWith('#busfahrer') || route === '#profile'
  document.documentElement.classList.toggle('busfahrer-active', usesDarkTheme)
  document.body.classList.toggle('busfahrer-active', usesDarkTheme)

  if (route === '#busfahrer') {
    const snapshot = gamePlayerSnapshot.length ? gamePlayerSnapshot : players
    app.innerHTML = '<main class="busfahrer-page" id="busfahrer-game"></main>'
    unmountCurrentPage = mountBusfahrer(app.querySelector<HTMLElement>('#busfahrer-game')!, snapshot.map(({ name, avatar, avatarColor }) => ({ name, avatar, avatarColor })))
    return
  }
  if (route === '#busfahrer-menu') return renderModeMenu()
  if (route === '#busfahrer-offline') return renderOfflineMenu()
  if (route === '#busfahrer-online') return renderOnlineMenu()
  if (route === '#busfahrer-profile-picker') return renderProfilePicker()
  if (route === '#busfahrer-profile-editor') return renderProfileEditor()
  if (route === '#profile') {
    profileEditorContext = { mode: 'primary', profileId: profileStore.activeProfileId }
    return renderProfileEditor()
  }
  renderHome()
}

function renderHome() {
  app.innerHTML = `<main class="home-page">
    <button class="home-profile-button" type="button" aria-label="Profil öffnen" title="Profil öffnen">
      <img src="${userButtonImage}" alt="">
    </button>
    <header class="hero-header">
      <img class="hero-logo" src="${heroLogo}" alt="BLOBBA">
    </header>
    <section class="game-list" aria-label="Spiele">
      <button class="busfahrer-button" type="button">Busfahrer</button>
    </section>
  </main>`
  app.querySelector<HTMLButtonElement>('.home-profile-button')!.addEventListener('click', () => { window.location.hash = 'profile' })
  app.querySelector<HTMLButtonElement>('.busfahrer-button')!.addEventListener('click', () => { window.location.hash = 'busfahrer-menu' })
}

function setupShell(content: string, backTarget: string, title = 'Busfahrer', eyebrow = 'GetDrunk präsentiert', pageClass = '') {
  app.innerHTML = `<main class="busfahrer-page ${pageClass}"><div class="busfahrer-shell setup-shell">
    <header class="busfahrer-header"><button class="back-button bus-back" type="button" data-setup-back>← Zurück</button><div><p>${eyebrow}</p><h1>${title}</h1></div><span></span></header>
    <section class="setup-stage">${content}</section>
  </div></main>`
  app.querySelector<HTMLButtonElement>('[data-setup-back]')!.addEventListener('click', () => { window.location.hash = backTarget })
}

function renderModeMenu() {
  setupShell(`<div class="setup-panel"><p class="eyebrow">Spielmodus</p><h2>Wie möchtest du spielen?</h2>
    <div class="setup-mode-actions"><button class="game-button primary" type="button" data-mode="offline">Offline</button><button class="game-button" type="button" data-mode="online">Online</button></div>
  </div>`, '')
  app.querySelector<HTMLButtonElement>('[data-mode="offline"]')!.addEventListener('click', () => { window.location.hash = 'busfahrer-offline' })
  app.querySelector<HTMLButtonElement>('[data-mode="online"]')!.addEventListener('click', () => { window.location.hash = 'busfahrer-online' })
}

function renderOnlineMenu() {
  setupShell('<div class="setup-panel"><p class="eyebrow">Online</p><h2>Online-Spiel</h2><p class="setup-copy">Der Online-Modus wird als Nächstes eingerichtet.</p></div>', 'busfahrer-menu')
}

function renderOfflineMenu() {
  setupShell(`<div class="setup-panel offline-panel"><p class="eyebrow">Offline</p><h2>Spieler</h2>
    <div class="player-table" role="list">${players.map((player, index) => `<div class="player-row" role="listitem">
      <div class="player-row-main">${playerAvatarMarkup(player)}<input class="player-name-input" data-player-name="${player.id}" value="${escapeHtml(player.name || `Spieler ${index + 1}`)}" maxlength="24" autocomplete="off" aria-label="Name von Spieler ${index + 1}"></div>
      <button class="player-remove" type="button" data-remove-player="${player.id}" ${players.length === 1 ? 'disabled' : ''}>Entfernen</button>
    </div>`).join('')}</div>
    <button class="game-button setup-add-player" type="button" data-add-player ${players.length >= MAX_PLAYERS ? 'disabled' : ''}>+ Spieler hinzufügen</button>
    <button class="game-button primary setup-start-game" type="button" data-start-game>Spiel starten</button>
  </div>`, 'busfahrer-menu')

  app.querySelectorAll<HTMLInputElement>('[data-player-name]').forEach((input) => {
    input.addEventListener('input', () => {
      players = players.map((player) => player.id === input.dataset.playerName ? { ...player, name: input.value } : player)
    })
  })
  app.querySelectorAll<HTMLButtonElement>('[data-remove-player]').forEach((button) => button.addEventListener('click', () => {
    if (players.length === 1) return
    players = players.filter((player) => player.id !== button.dataset.removePlayer)
    renderOfflineMenu()
  }))
  app.querySelector<HTMLButtonElement>('[data-add-player]')!.addEventListener('click', () => {
    if (players.length >= MAX_PLAYERS) return
    const player = createLocalPlayer(players.length + 1)
    players.push(player)
    pendingPlayerNameFocusId = player.id
    renderOfflineMenu()
  })
  app.querySelector<HTMLButtonElement>('[data-start-game]')!.addEventListener('click', () => {
    gamePlayerSnapshot = players.map((player, index) => ({ ...player, name: player.name.trim() || `Spieler ${index + 1}` }))
    profileStore.lastUsedProfileIds = players
      .map((player) => player.profileId)
      .filter((id) => profileStore.profiles.some((profile) => profile.id === id))
    saveProfileStore()
    window.location.hash = 'busfahrer'
  })
  if (pendingPlayerNameFocusId) {
    const input = app.querySelector<HTMLInputElement>(`[data-player-name="${pendingPlayerNameFocusId}"]`)
    pendingPlayerNameFocusId = undefined
    window.setTimeout(() => {
      input?.focus()
      input?.select()
    }, 0)
  }
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
  </div>`, 'busfahrer-offline')

  app.querySelectorAll<HTMLButtonElement>('[data-select-profile]').forEach((button) => button.addEventListener('click', () => {
    const profile = profileStore.profiles.find((item) => item.id === button.dataset.selectProfile)
    if (profile && players.length < MAX_PLAYERS) players.push(setupPlayerFromProfile(profile))
    window.location.hash = 'busfahrer-offline'
  }))
  app.querySelector<HTMLButtonElement>('[data-create-profile]')!.addEventListener('click', () => {
    profileEditorContext = { mode: 'new-player' }
    window.location.hash = 'busfahrer-profile-editor'
  })
}

function renderProfileEditor() {
  const isPrimary = profileEditorContext.mode === 'primary'
  const isNew = profileEditorContext.mode === 'new-player'
  const storedProfile = isNew ? undefined : profileStore.profiles.find((profile) => profile.id === profileEditorContext.profileId)
  const draftProfile: StoredProfile = storedProfile ? { ...storedProfile, avatarId: storedProfile.avatarId ?? DEFAULT_AVATAR_ID } : { id: createId(), name: '', avatarId: DEFAULT_AVATAR_ID }
  let selectedAvatarId = draftProfile.avatarId ?? DEFAULT_AVATAR_ID
  const backTarget = isPrimary ? '' : profileEditorContext.mode === 'edit-player' ? 'busfahrer-offline' : 'busfahrer-profile-picker'

  setupShell(`<form class="setup-panel profile-editor-panel" data-profile-form>
    <p class="eyebrow">${isPrimary ? 'Benutzerprofil' : isNew ? 'Neues Spielerprofil' : 'Spielerprofil'}</p>
    <h2>${isPrimary ? 'Dein Profil' : isNew ? 'Profil anlegen' : 'Profil bearbeiten'}</h2>
    <div class="profile-preview" data-profile-preview style="--avatar-ring:${avatarColor(selectedAvatarId)}">${avatarVisualMarkup(selectedAvatarId)}</div>
    <label class="profile-name-label" for="profile-name">Spielername</label>
    <input class="profile-name-input" id="profile-name" name="profile-name" value="${escapeHtml(draftProfile.name)}" maxlength="24" autocomplete="nickname" placeholder="Spielername eingeben">
    <fieldset class="avatar-fieldset"><legend>Profilbild</legend><div class="avatar-choice-grid">
      ${avatarOptions.map((avatar) => `<button class="avatar-choice ${selectedAvatarId === avatar.id ? 'is-selected' : ''}" type="button" data-avatar-id="${avatar.id}" aria-label="${avatar.label}" aria-pressed="${selectedAvatarId === avatar.id}"><span class="avatar-choice-visual" style="--avatar-ring:${avatar.color}">${avatarVisualMarkup(avatar.id)}</span></button>`).join('')}
    </div></fieldset>
    <button class="game-button primary profile-save-button" type="submit">Speichern</button>
  </form>`, backTarget, 'Profil', 'GetDrunk', 'profile-page')

  const preview = app.querySelector<HTMLElement>('[data-profile-preview]')!
  const input = app.querySelector<HTMLInputElement>('#profile-name')!
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
    window.location.hash = isPrimary ? '' : 'busfahrer-offline'
  })
}

window.addEventListener('hashchange', renderPage)
renderPage()
