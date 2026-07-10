export type KlatschenCardType = 'drink-self' | 'choose-player' | 'distribute' | 'all-players' | 'category' | 'question' | 'temporary-rule' | 'vote' | 'duel' | 'custom' | 'collectible-action'

export type KlatschenCard = {
  id: string
  title: string
  symbol: string
  description: string
  type: KlatschenCardType
  amount?: number
  keepUntilUsed?: boolean
  suggestedRule?: string
}

export const klatschenCards: KlatschenCard[] = [
  { id: 'self-1', title: 'Du bist dran', symbol: '👏', description: 'Blobbe 1 Schluck.', type: 'drink-self', amount: 1 },
  { id: 'self-2', title: 'Doppelt hält besser', symbol: '👏', description: 'Blobbe 2 Schlücke.', type: 'drink-self', amount: 2 },
  { id: 'self-3', title: 'Aller guten Dinge', symbol: '👏', description: 'Blobbe 3 Schlücke.', type: 'drink-self', amount: 3 },
  { id: 'distribute-3', title: 'Verteilen', symbol: '🎁', description: 'Wähle einen Spieler und verteile 3 Schlücke.', type: 'distribute', amount: 3 },
  { id: 'distribute-4', title: 'Große Runde', symbol: '🎁', description: 'Wähle einen Spieler und verteile 4 Schlücke.', type: 'distribute', amount: 4 },
  { id: 'choose-1', title: 'Auswahl', symbol: '👉', description: 'Wähle einen Spieler, der 1 Schluck blobbt.', type: 'choose-player', amount: 1 },
  { id: 'choose-2', title: 'Auswahl', symbol: '👉', description: 'Wähle einen Spieler, der 2 Schlücke blobbt.', type: 'choose-player', amount: 2 },
  { id: 'choose-3', title: 'Auswahl', symbol: '👉', description: 'Wähle einen Spieler, der 3 Schlücke blobbt.', type: 'choose-player', amount: 3 },
  { id: 'all-1', title: 'Alle zusammen', symbol: '🙌', description: 'Alle blobben 1 Schluck.', type: 'all-players', amount: 1 },
  { id: 'all-except', title: 'Glück gehabt', symbol: '✨', description: 'Alle außer dir blobben 1 Schluck.', type: 'all-players', amount: 1 },
  { id: 'left', title: 'Links von dir', symbol: '⬅️', description: 'Die Person links von dir blobbt 1 Schluck.', type: 'custom', amount: 1 },
  { id: 'right', title: 'Rechts von dir', symbol: '➡️', description: 'Die Person rechts von dir blobbt 1 Schluck.', type: 'custom', amount: 1 },
  { id: 'category-free-1', title: 'Kategorie', symbol: '💭', description: 'Überlege dir selbst eine Kategorie. Danach nennt ihr reihum passende Begriffe. Wer nichts mehr weiß, zu lange braucht oder etwas doppelt nennt, muss blobben.', type: 'category', amount: 1 },
  { id: 'category-free-2', title: 'Kategorie', symbol: '💭', description: 'Überlege dir selbst eine Kategorie. Danach nennt ihr reihum passende Begriffe. Wer nichts mehr weiß, zu lange braucht oder etwas doppelt nennt, muss blobben.', type: 'category', amount: 1 },
  { id: 'category-free-3', title: 'Kategorie', symbol: '💭', description: 'Überlege dir selbst eine Kategorie. Danach nennt ihr reihum passende Begriffe. Wer nichts mehr weiß, zu lange braucht oder etwas doppelt nennt, muss blobben.', type: 'category', amount: 1 },
  { id: 'category-free-4', title: 'Kategorie', symbol: '💭', description: 'Überlege dir selbst eine Kategorie. Danach nennt ihr reihum passende Begriffe. Wer nichts mehr weiß, zu lange braucht oder etwas doppelt nennt, muss blobben.', type: 'category', amount: 1 },
  { id: 'category-free-5', title: 'Kategorie', symbol: '💭', description: 'Überlege dir selbst eine Kategorie. Danach nennt ihr reihum passende Begriffe. Wer nichts mehr weiß, zu lange braucht oder etwas doppelt nennt, muss blobben.', type: 'category', amount: 1 },
  { id: 'rhyme', title: 'Reimrunde', symbol: '🎤', description: 'Nenne ein Wort. Reihum werden Reime gefunden. Wer keinen Reim mehr kennt, blobbt.', type: 'custom', amount: 1 },
  { id: 'question-direct', title: 'Fragefalle', symbol: '❓', description: 'Stelle einem Spieler eine Frage. Antwortet die Person, muss sie blobben. Sobald der nächste Spieler dran ist, endet deine Fragefalle.', type: 'question', amount: 1 },
  { id: 'question-direct-2', title: 'Fragefalle', symbol: '❓', description: 'Stelle einem Spieler eine Frage. Antwortet die Person, muss sie blobben. Sobald der nächste Spieler dran ist, endet deine Fragefalle.', type: 'question', amount: 1 },
  { id: 'question-direct-3', title: 'Fragefalle', symbol: '❓', description: 'Stelle einem Spieler eine Frage. Antwortet die Person, muss sie blobben. Sobald der nächste Spieler dran ist, endet deine Fragefalle.', type: 'question', amount: 1 },
  { id: 'question-direct-4', title: 'Fragefalle', symbol: '❓', description: 'Stelle einem Spieler eine Frage. Antwortet die Person, muss sie blobben. Sobald der nächste Spieler dran ist, endet deine Fragefalle.', type: 'question', amount: 1 },
  { id: 'question-rule', title: 'Keine Antwort', symbol: '🤐', description: 'Bis zu deinem nächsten Zug darf dir niemand eine Frage beantworten.', type: 'question', amount: 1 },
  { id: 'rule-free-1', title: 'Neue Regel', symbol: '📜', description: 'Du darfst dir eine eigene Regel für die Runde überlegen. Alternativ kannst du die vorgeschlagene Regel verwenden.', suggestedRule: 'Niemand darf Vornamen sagen.', type: 'temporary-rule' },
  { id: 'rule-free-2', title: 'Neue Regel', symbol: '📜', description: 'Du darfst dir eine eigene Regel für die Runde überlegen. Alternativ kannst du die vorgeschlagene Regel verwenden.', suggestedRule: 'Niemand darf auf andere Spieler zeigen.', type: 'temporary-rule' },
  { id: 'rule-free-3', title: 'Neue Regel', symbol: '📜', description: 'Du darfst dir eine eigene Regel für die Runde überlegen. Alternativ kannst du die vorgeschlagene Regel verwenden.', suggestedRule: 'Jeder Satz muss mit „Also“ beginnen.', type: 'temporary-rule' },
  { id: 'rule-free-4', title: 'Neue Regel', symbol: '📜', description: 'Du darfst dir eine eigene Regel für die Runde überlegen. Alternativ kannst du die vorgeschlagene Regel verwenden.', suggestedRule: 'Niemand darf „Ja“ sagen.', type: 'temporary-rule' },
  { id: 'rule-free-5', title: 'Neue Regel', symbol: '📜', description: 'Du darfst dir eine eigene Regel für die Runde überlegen. Alternativ kannst du die vorgeschlagene Regel verwenden.', suggestedRule: 'Niemand darf „Nein“ sagen.', type: 'temporary-rule' },
  { id: 'group-men', title: 'Gruppenaktion', symbol: '👥', description: 'Alle Männer blobben 1 Schluck.', type: 'all-players', amount: 1 },
  { id: 'group-women', title: 'Gruppenaktion', symbol: '👥', description: 'Alle Frauen blobben 1 Schluck.', type: 'all-players', amount: 1 },
  { id: 'group-light', title: 'Gruppenaktion', symbol: '👕', description: 'Alle mit heller Kleidung blobben 1 Schluck.', type: 'all-players', amount: 1 },
  { id: 'group-late', title: 'Gruppenaktion', symbol: '⏰', description: 'Alle, die heute zu spät waren, blobben 1 Schluck.', type: 'all-players', amount: 1 },
  { id: 'vote-prison', title: 'Abstimmung', symbol: '🗳️', description: 'Wer würde am ehesten im Gefängnis landen? Alle zeigen gleichzeitig. Die Person mit den meisten Stimmen blobbt.', type: 'vote', amount: 1 },
  { id: 'vote-vanish', title: 'Abstimmung', symbol: '🗳️', description: 'Wer würde am ehesten eine Woche verschwinden? Die Person mit den meisten Stimmen blobbt.', type: 'vote', amount: 1 },
  { id: 'vote-celebrity', title: 'Abstimmung', symbol: '🗳️', description: 'Wer würde am ehesten einen Prominenten heiraten? Die Person mit den meisten Stimmen blobbt.', type: 'vote', amount: 1 },
  { id: 'vote-dance', title: 'Abstimmung', symbol: '🗳️', description: 'Wer würde am ehesten einen peinlichen Tanz aufführen? Die Person mit den meisten Stimmen blobbt.', type: 'vote', amount: 1 },
  { id: 'duel-rps', title: 'Duell', symbol: '✊', description: 'Wähle jemanden für Schnick, Schnack, Schnuck. Wer verliert, blobbt.', type: 'duel', amount: 1 },
  { id: 'duel-stare', title: 'Blickduell', symbol: '👀', description: 'Wähle jemanden zum Blickduell. Wer zuerst lacht, blobbt.', type: 'duel', amount: 1 },
  { id: 'duel-thumb', title: 'Daumencatchen', symbol: '👍', description: 'Wähle jemanden zum Daumencatchen. Wer verliert, blobbt.', type: 'duel', amount: 1 },
  { id: 'story', title: 'Geschichte', symbol: '📖', description: 'Erzählt reihum eine Geschichte, jede Person ergänzt ein Wort. Wer stockt, blobbt.', type: 'custom', amount: 1 },
  { id: 'waterfall', title: 'Wasserfall', symbol: '🌊', description: 'Alle beginnen gleichzeitig zu blobben. Aufhören darfst du erst, wenn die Person rechts von dir aufhört.', type: 'custom', amount: 1 },
  { id: 'toast', title: 'Ansprache', symbol: '🥂', description: 'Halte eine spontane Ansprache. Wer dabei lacht, blobbt 1 Schluck.', type: 'custom', amount: 1 },
  { id: 'thumb-clapper-1', title: 'Daumen-Blobb', symbol: '👍', description: 'Lege irgendwann unauffällig deinen Daumen auf den Tisch. Alle anderen müssen es nachmachen. Die letzte Person muss blobben.', type: 'collectible-action', keepUntilUsed: true },
  { id: 'thumb-clapper-2', title: 'Daumen-Blobb', symbol: '👍', description: 'Lege irgendwann unauffällig deinen Daumen auf den Tisch. Alle anderen müssen es nachmachen. Die letzte Person muss blobben.', type: 'collectible-action', keepUntilUsed: true },
  { id: 'thumb-clapper-3', title: 'Daumen-Blobb', symbol: '👍', description: 'Lege irgendwann unauffällig deinen Daumen auf den Tisch. Alle anderen müssen es nachmachen. Die letzte Person muss blobben.', type: 'collectible-action', keepUntilUsed: true },
  { id: 'nose-clapper-1', title: 'Nasen-Blobb', symbol: '👃', description: 'Lege irgendwann unauffällig deinen Zeigefinger an deine Nase. Alle anderen müssen es nachmachen. Die letzte Person muss blobben.', type: 'collectible-action', keepUntilUsed: true },
  { id: 'nose-clapper-2', title: 'Nasen-Blobb', symbol: '👃', description: 'Lege irgendwann unauffällig deinen Zeigefinger an deine Nase. Alle anderen müssen es nachmachen. Die letzte Person muss blobben.', type: 'collectible-action', keepUntilUsed: true },
  { id: 'nose-clapper-3', title: 'Nasen-Blobb', symbol: '👃', description: 'Lege irgendwann unauffällig deinen Zeigefinger an deine Nase. Alle anderen müssen es nachmachen. Die letzte Person muss blobben.', type: 'collectible-action', keepUntilUsed: true },
  { id: 'clap-partner', title: 'Blobb-Partner', symbol: '🤝', description: 'Wähle einen anderen Spieler als deinen Blobb-Partner. Immer wenn du blobben musst, muss dein Blobb-Partner dieselbe Anzahl ebenfalls blobben.', type: 'collectible-action', keepUntilUsed: true },
  { id: 'double-clap', title: 'Doppel-Blobb', symbol: '✌️', description: 'Setze diese Blobb-Karte ein, um die Schlücke einer beliebigen Aktion für eine Person zu verdoppeln.', type: 'collectible-action', keepUntilUsed: true },
]

export const klatschenCardMap = new Map(klatschenCards.map((card) => [card.id, card]))
