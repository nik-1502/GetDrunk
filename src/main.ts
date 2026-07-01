import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

function renderPage() {
  if (window.location.hash === '#busfahrer') {
    app.innerHTML = `
      <main class="busfahrer-page">
        <button class="back-button" type="button">Zurück</button>
      </main>
    `

    app.querySelector<HTMLButtonElement>('.back-button')!.addEventListener('click', () => {
      window.location.hash = ''
    })
    return
  }

  app.innerHTML = `
    <main class="home-page">
      <header class="title-frame">
        <h1>GetDrunk</h1>
      </header>
      <button class="busfahrer-button" type="button">Busfahrer</button>
    </main>
  `

  app.querySelector<HTMLButtonElement>('.busfahrer-button')!.addEventListener('click', () => {
    window.location.hash = 'busfahrer'
  })
}

window.addEventListener('hashchange', renderPage)
renderPage()
