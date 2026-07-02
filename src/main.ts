import './style.css'
import { mountBusfahrer } from './busfahrer.ts'

const app = document.querySelector<HTMLDivElement>('#app')!
let unmountCurrentPage: (() => void) | undefined

const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!
const zoomableViewport = 'width=device-width, initial-scale=1.0, user-scalable=yes, maximum-scale=5.0'
const resetViewport = 'width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0'

function detectStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  const installedDisplayMode = ['standalone', 'fullscreen', 'minimal-ui']
    .some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)
  const launchedFromAndroidApp = document.referrer.startsWith('android-app://')
  document.documentElement.classList.toggle(
    'is-standalone',
    navigatorWithStandalone.standalone === true || installedDisplayMode || launchedFromAndroidApp,
  )
}

detectStandaloneMode()

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

  const isBusfahrer = window.location.hash === '#busfahrer'
  document.documentElement.classList.toggle('busfahrer-active', isBusfahrer)
  document.body.classList.toggle('busfahrer-active', isBusfahrer)

  if (isBusfahrer) {
    app.innerHTML = '<main class="busfahrer-page" id="busfahrer-game"></main>'
    unmountCurrentPage = mountBusfahrer(app.querySelector<HTMLElement>('#busfahrer-game')!)
    return
  }

  app.innerHTML = `<main class="home-page"><header class="title-frame"><h1>GetDrunk</h1></header><button class="busfahrer-button" type="button">Busfahrer</button></main>`
  app.querySelector<HTMLButtonElement>('.busfahrer-button')!.addEventListener('click', () => { window.location.hash = 'busfahrer' })
}

window.addEventListener('hashchange', renderPage)
window.addEventListener('pageshow', detectStandaloneMode)
renderPage()
