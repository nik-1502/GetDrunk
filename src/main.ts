import './style.css'
import { mountBusfahrer } from './busfahrer.ts'

const app = document.querySelector<HTMLDivElement>('#app')!
let unmountCurrentPage: (() => void) | undefined
let players = [{ id: crypto.randomUUID(), name: 'Nick' }]
let editingPlayerId: string | null = null

const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!
const zoomableViewport = 'width=device-width, initial-scale=1.0, user-scalable=yes, maximum-scale=5.0'
const resetViewport = 'width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0'

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

function renderPage() {
  unmountCurrentPage?.()
  unmountCurrentPage = undefined

  const route = window.location.hash
  const isBusfahrer = route.startsWith('#busfahrer')
  document.documentElement.classList.toggle('busfahrer-active', isBusfahrer)
  document.body.classList.toggle('busfahrer-active', isBusfahrer)

  if (route === '#busfahrer') {
    app.innerHTML = '<main class="busfahrer-page" id="busfahrer-game"></main>'
    unmountCurrentPage = mountBusfahrer(app.querySelector<HTMLElement>('#busfahrer-game')!, players.map((player) => player.name))
    return
  }

  if (route === '#busfahrer-menu') {
    renderModeMenu()
    return
  }

  if (route === '#busfahrer-offline') {
    renderOfflineMenu()
    return
  }

  if (route === '#busfahrer-online') {
    renderOnlineMenu()
    return
  }

  app.innerHTML = `<main class="home-page"><header class="title-frame"><h1>GetDrunk</h1></header><button class="busfahrer-button" type="button">Busfahrer</button></main>`
  app.querySelector<HTMLButtonElement>('.busfahrer-button')!.addEventListener('click', () => { window.location.hash = 'busfahrer-menu' })
}

function setupShell(content: string, backTarget: string) {
  app.innerHTML = `<main class="busfahrer-page"><div class="busfahrer-shell setup-shell">
    <header class="busfahrer-header"><button class="back-button bus-back" type="button" data-setup-back>← Zurück</button><div><p>GetDrunk präsentiert</p><h1>Busfahrer</h1></div><span></span></header>
    <section class="setup-stage">${content}</section>
  </div></main>`
  app.querySelector<HTMLButtonElement>('[data-setup-back]')!.addEventListener('click', () => { window.location.hash = backTarget })
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function renderModeMenu() {
  setupShell(`<div class="setup-panel"><p class="eyebrow">Spielmodus</p><h2>Wie möchtest du spielen?</h2>
    <div class="setup-mode-actions"><button class="game-button primary" type="button" data-mode="offline">Offline</button><button class="game-button" type="button" data-mode="online">Online</button></div>
  </div>`, '')
  app.querySelector<HTMLButtonElement>('[data-mode="offline"]')!.addEventListener('click', () => { window.location.hash = 'busfahrer-offline' })
  app.querySelector<HTMLButtonElement>('[data-mode="online"]')!.addEventListener('click', () => { window.location.hash = 'busfahrer-online' })
}

function renderOnlineMenu() {
  setupShell(`<div class="setup-panel"><p class="eyebrow">Online</p><h2>Online-Spiel</h2><p class="setup-copy">Der Online-Modus wird als Nächstes eingerichtet.</p></div>`, 'busfahrer-menu')
}

function renderOfflineMenu() {
  setupShell(`<div class="setup-panel offline-panel"><p class="eyebrow">Offline</p><h2>Spieler</h2>
    <div class="player-table" role="list">${players.map((player, index) => editingPlayerId === player.id
      ? `<div class="player-row is-editing" role="listitem"><span class="player-number">${index + 1}</span><input class="player-name-input" data-player-input="${player.id}" value="${escapeHtml(player.name)}" maxlength="24" aria-label="Name von Spieler ${index + 1}"><button class="player-remove" type="button" data-remove-player="${player.id}">Entfernen</button></div>`
      : `<button class="player-row" type="button" role="listitem" data-edit-player="${player.id}"><span class="player-number">${index + 1}</span><span class="player-name">${escapeHtml(player.name || `Spieler ${index + 1}`)}</span><span class="player-edit-label">Bearbeiten</span></button>`).join('')}</div>
    <button class="game-button setup-add-player" type="button" data-add-player>+ Spieler hinzufügen</button>
    <button class="game-button primary setup-start-game" type="button" data-start-game ${players.length ? '' : 'disabled'}>Spiel starten</button>
  </div>`, 'busfahrer-menu')

  app.querySelectorAll<HTMLButtonElement>('[data-edit-player]').forEach((button) => button.addEventListener('click', () => {
    editingPlayerId = button.dataset.editPlayer!
    renderOfflineMenu()
  }))
  app.querySelector<HTMLInputElement>('[data-player-input]')?.focus()
  app.querySelectorAll<HTMLInputElement>('[data-player-input]').forEach((input) => {
    input.addEventListener('input', () => {
      const player = players.find((item) => item.id === input.dataset.playerInput)
      if (player) player.name = input.value
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { editingPlayerId = null; renderOfflineMenu() }
    })
  })
  app.querySelectorAll<HTMLButtonElement>('[data-remove-player]').forEach((button) => button.addEventListener('click', () => {
    players = players.filter((player) => player.id !== button.dataset.removePlayer)
    editingPlayerId = null
    renderOfflineMenu()
  }))
  app.querySelector<HTMLButtonElement>('[data-add-player]')!.addEventListener('click', () => {
    const player = { id: crypto.randomUUID(), name: `Spieler ${players.length + 1}` }
    players.push(player)
    editingPlayerId = player.id
    renderOfflineMenu()
  })
  app.querySelector<HTMLButtonElement>('[data-start-game]')!.addEventListener('click', () => {
    players = players.map((player, index) => ({ ...player, name: player.name.trim() || `Spieler ${index + 1}` }))
    editingPlayerId = null
    window.location.hash = 'busfahrer'
  })
}

window.addEventListener('hashchange', renderPage)
renderPage()
