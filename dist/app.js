'use strict'
const $ = (id) => document.getElementById(id)
const content = $('content'),
  dialog = $('dialog')
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  )
const clean = (value) =>
  String(value ?? '').replace(/[\u200b-\u200d\ufeff]/g, '')
const fmt = (n) => Number(n).toLocaleString('en-US')
const uid = () => crypto.randomUUID()
const key = 'clinical-qbank-workspace-v1'
const blank = () => ({
  saved: [],
  questions: [],
  attempts: [],
  notes: [],
  feedback: [],
  theme: 'light',
  scale: 100,
  layout: 'grid',
})
let db
try {
  db = { ...blank(), ...JSON.parse(localStorage.getItem(key) || '{}') }
} catch {
  db = blank()
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(db))
  } catch {
    notice('Browser storage is full. Export your progress from My data.')
  }
}
let topics = [],
  subjects = new Map(),
  byID = new Map(),
  qindex = new Map(),
  cache = new Map(),
  pending = new Map()
let routeVersion = 0,
  browseSubject = '',
  filter = '',
  testStatus = 'all',
  page = 1,
  mode = 'study',
  selectedTopics = new Set(),
  customCount = 20,
  quizKeys = false,
  quizPalette = false
const quizView = {
  tip: false,
  hideStats: false,
  hideTimer: false,
  collapsed: new Set(),
}
let selectionBusy = false,
  toastTime
const builderSettings = {
  subject: '',
  history: 'all',
  order: 'random',
  name: '',
  duration: '',
  qid: '',
}
function selectControl(id, label, options, value) {
  return (
    '<label class="build-control">' +
    esc(label) +
    '<span class="select-wrap"><select id="' +
    id +
    '">' +
    options
      .map(
        ([v, l]) =>
          '<option value="' +
          v +
          '" ' +
          (value === v ? 'selected' : '') +
          '>' +
          esc(l) +
          '</option>',
      )
      .join('') +
    '</select>' +
    icon('chevron') +
    '</span></label>'
  )
}
function matchingRefs() {
  const latest = new Map(),
    everWrong = new Set(),
    flagged = new Set()
  const questionId = (r) => byID.get(r.t)?.ids[r.n]
  for (const a of db.attempts) {
    a.flags.forEach((i) => flagged.add(questionId(a.refs[i])))
    if (!a.finished && a.mode === 'exam') continue
    for (const [k, v] of Object.entries(a.answers)) {
      const id = questionId(a.refs[k])
      if (!latest.has(id) || latest.get(id).at <= (v.at || a.start))
        latest.set(id, { at: v.at || a.start, right: v.right })
      if (v.right === false) everWrong.add(id)
    }
  }
  const saved = new Set(db.questions.map((r) => questionId(r)))
  const specific = new Set(
    builderSettings.qid
      .trim()
      .toLowerCase()
      .split(/[ ,\n]+/)
      .filter(Boolean),
  )
  const included = new Set(),
    refs = []
  const filters = {
    all: () => true,
    unseen: (id) => !latest.has(id),
    answered: (id) => latest.has(id),
    wrong: (id) => latest.get(id)?.right === false,
    everWrong: (id) => everWrong.has(id),
    right: (id) => latest.get(id)?.right === true,
    saved: (id) => saved.has(id),
    flagged: (id) => flagged.has(id),
  }
  for (const t of topics) {
    if (!selectedTopics.has(t.id)) continue
    t.ids.forEach((id, n) => {
      if (
        included.has(id) ||
        (specific.size && !specific.has(id.toLowerCase())) ||
        !filters[builderSettings.history](id)
      )
        return
      included.add(id)
      refs.push({ t: t.id, n })
    })
  }
  return refs
}
function chooseRefs(pool, limit) {
  if (builderSettings.order === 'random') return mix(pool).slice(0, limit)
  if (builderSettings.order === 'ordered') return pool.slice(0, limit)
  const groups = new Map()
  for (const ref of pool) {
    if (!groups.has(ref.t)) groups.set(ref.t, [])
    groups.get(ref.t).push(ref)
  }
  const queues = mix([...groups.values()].map(mix)),
    result = []
  while (queues.length && result.length < limit) {
    const group = queues.shift()
    result.push(group.pop())
    if (group.length) queues.push(group)
  }
  return result
}
function advancedControls() {
  return (
    '<div class="builder-settings">' +
    selectControl(
      'history-filter',
      'Question history',
      [
        ['all', 'All questions'],
        ['unseen', 'Not attempted'],
        ['answered', 'Previously answered'],
        ['wrong', 'Last answer incorrect'],
        ['everWrong', 'Ever answered incorrectly'],
        ['right', 'Last answer correct'],
        ['saved', 'Bookmarked questions'],
        ['flagged', 'Flagged for review'],
      ],
      builderSettings.history,
    ) +
    selectControl(
      'mix-order',
      'Question order',
      [
        ['random', 'Random order'],
        ['balanced', 'Spread evenly across topics'],
        ['ordered', 'Topic order'],
      ],
      builderSettings.order,
    ) +
    '</div><details class="builder-advanced"><summary>More session options</summary><div class="builder-settings"><label class="build-control">Session name<input id="session-name" maxlength="100" placeholder="Optional" value="' +
    esc(builderSettings.name) +
    '"></label><label class="build-control">Exam duration (minutes)<input type="number" id="exam-duration" min="1" max="1440" placeholder="Automatic" value="' +
    esc(builderSettings.duration) +
    '"></label></div><label class="build-control">Specific question IDs<input id="specific-qids" placeholder="Optional, separated by commas" value="' +
    esc(builderSettings.qid) +
    '"></label></details>'
  )
}
const pageSize = 24
const route = () => decodeURIComponent(location.hash.slice(1) || 'dashboard')
function go(path) {
  if (route() === path) {
    render()
  } else location.hash = encodeURI(path)
}
function notice(s) {
  $('toast').textContent = s
  clearTimeout(toastTime)
  toastTime = setTimeout(() => ($('toast').textContent = ''), 3200)
}
function button(text, action, kind = '', symbol = '') {
  return (
    '<button class="btn ' +
    kind +
    '" data-act="' +
    action +
    '">' +
    (symbol ? icon(symbol) : '') +
    esc(text) +
    '</button>'
  )
}
function tag(text, symbol) {
  return '<span class="pill">' + icon(symbol) + esc(text) + '</span>'
}
const tile = (color, name) =>
  '<span class="tile ' + color + '">' + icon(name) + '</span>'
function theme() {
  document.documentElement.dataset.theme = db.theme
  document.documentElement.style.fontSize =
    Math.min(130, Math.max(85, db.scale)) * 0.16 + 'px'
  $('theme').innerHTML = icon(db.theme === 'dark' ? 'sun' : 'moon')
  $('theme').setAttribute(
    'aria-label',
    'Switch to ' + (db.theme === 'dark' ? 'light' : 'dark') + ' theme',
  )
}
function nav() {
  const links = (rows) =>
    rows
      .map(
        ([id, label, ico]) =>
          '<a class="nav-btn ' +
          (route().split('/')[0] === id ? 'sel' : '') +
          '" href="#' +
          id +
          '" ' +
          (route().split('/')[0] === id ? 'aria-current="page"' : '') +
          '>' +
          icon(ico) +
          label +
          '</a>',
      )
      .join('')
  $('main-nav').innerHTML = links([
    ['dashboard', 'Dashboard', 'dashboard'],
    ['custom', 'Custom practice', 'sliders'],
    ['results', 'Results', 'chart'],
  ])
  $('library-nav').innerHTML = links([
    ['bookmarks', 'Bookmarks', 'bookmark'],
    ['data', 'My data', 'database'],
  ])
}
function setPage(s) {
  $('crumb').textContent = s
  document.title = s + ' · Clinical QBank'
  nav()
  theme()
}
function closeMenu() {
  document.body.classList.remove('nav-open')
  $('scrim').hidden = true
}
function modal(title, body) {
  $('modal').innerHTML =
    '<div class="modal-head"><h2>' +
    esc(title) +
    '</h2><button aria-label="Close dialog" class="icon-button" data-act="close">' +
    icon('x') +
    '</button></div><div class="modal-body">' +
    body +
    '</div>'
  dialog.setAttribute('aria-label', title)
  if (!dialog.open) dialog.showModal()
}
function heading(title, sub = '') {
  return (
    '<div class="page-head"><h1 class="page-title">' +
    esc(title) +
    '</h1>' +
    (sub ? '<p class="dim">' + esc(sub) + '</p>' : '') +
    '</div>'
  )
}
function empty(title, sub, ico = 'book') {
  return (
    '<section class="empty">' +
    tile('teal', ico) +
    '<h3>' +
    esc(title) +
    '</h3><p>' +
    esc(sub) +
    '</p></section>'
  )
}
const done = () => db.attempts.filter((a) => a.finished)
const active = () => db.attempts.filter((a) => !a.finished)
const activeFor = (t) =>
  db.attempts.some((a) => !a.finished && a.topic === t.id)
const doneFor = (t) => db.attempts.some((a) => a.finished && a.topic === t.id)
function metrics() {
  const finished = done(),
    total = finished.reduce((n, a) => n + a.refs.length, 0),
    correct = finished.reduce((n, a) => n + a.score.right, 0)
  return [
    ['Topics', fmt(topics.length), 'teal', 'layers'],
    [
      'Questions',
      fmt(topics.reduce((n, t) => n + t.count, 0)),
      'blue',
      'clipboard',
    ],
    ['Completed', fmt(finished.length), 'purple', 'checkcircle'],
    [
      'Avg. accuracy',
      total ? Math.round((100 * correct) / total) + '%' : '—',
      'orange',
      'target',
    ],
  ]
    .map(
      ([l, v, c, i]) =>
        '<div class="metric">' +
        tile(c, i) +
        '<div><small>' +
        l +
        '</small><strong>' +
        v +
        '</strong></div></div>',
    )
    .join('')
}
function topicCard(t) {
  const saved = db.saved.includes(t.id)
  return (
    '<article class="test"><button class="test-open" data-topic="' +
    esc(t.id) +
    '"><h3>' +
    esc(t.title) +
    '</h3><span class="test-meta">' +
    fmt(t.count) +
    (t.count === 1 ? ' question' : ' questions') +
    '</span></button><button class="mark" aria-label="' +
    (saved ? 'Remove bookmark for ' : 'Bookmark ') +
    esc(t.title) +
    '" aria-pressed="' +
    saved +
    '" data-save="' +
    esc(t.id) +
    '">' +
    (saved ? 'Saved' : 'Save') +
    '</button></article>'
  )
}
function sessionRow(a) {
  const n = Object.keys(a.answers).length
  return (
    '<div class="active-session"><div><strong>' +
    esc(a.name) +
    '</strong><p>' +
    esc(a.mode === 'exam' ? 'Timed exam' : 'Study session') +
    ' · ' +
    n +
    ' of ' +
    a.refs.length +
    ' answered</p></div><button class="btn" data-session="' +
    a.id +
    '">Resume</button></div>'
  )
}
function dashboard() {
  setPage('Dashboard')
  content.innerHTML =
    '<section class="hero"><div class="hero-copy"><div class="eyebrow">' +
    icon('layers') +
    'AMBOSS Combined</div><h1>Clinical question bank</h1><p>Browse by subject or build your own practice test.</p>' +
    button('Custom practice', 'custom', 'lime', 'plus') +
    '</div><div class="hero-art" aria-hidden="true"><img src="assets/heart.webp" alt=""><span class="art-tick"></span></div></section><div class="metrics">' +
    metrics() +
    '</div>' +
    active().slice(-1).map(sessionRow).join('') +
    '<section aria-labelledby="subjects-title"><div class="headrow"><h2 id="subjects-title">Browse subjects</h2><a class="btn" href="#dashboard/all">All topics</a></div><div class="subject-grid">' +
    Array.from(subjects.values(), subjectCard).join('') +
    '</div></section>'
}
function subjectCard(subject) {
  return (
    '<a class="subject-card" href="#dashboard/' +
    esc(subject.id) +
    '"><strong>' +
    esc(subject.title) +
    '</strong><small>' +
    fmt(subject.topics.length) +
    ' topics · ' +
    fmt(subject.questionCount) +
    ' questions</small></a>'
  )
}
function browseTests(id) {
  const subject = subjects.get(id)
  if (id !== 'all' && !subject) return go('dashboard')
  if (browseSubject !== id) {
    browseSubject = id
    filter = ''
    testStatus = 'all'
    page = 1
  }
  const title = subject?.title || 'All topics'
  setPage(title)
  content.innerHTML =
    '<a class="back" href="#dashboard">' +
    icon('left') +
    'All subjects</a><div class="headrow"><div id="browse-title">' +
    heading(title, fmt(subject?.topics.length ?? topics.length) + ' topics') +
    '</div><div class="view-toggle"><button class="' +
    (db.layout === 'grid' ? 'sel' : '') +
    '" data-layout="grid" aria-label="Grid view" aria-pressed="' +
    (db.layout === 'grid') +
    '">' +
    icon('dashboard') +
    '</button><button class="' +
    (db.layout === 'list' ? 'sel' : '') +
    '" data-layout="list" aria-label="List view" aria-pressed="' +
    (db.layout === 'list') +
    '">' +
    icon('list') +
    '</button></div></div><div class="shelf-tools"><label class="searchbox">' +
    icon('search') +
    '<input id="filter" type="search" placeholder="Search topics..." aria-label="Filter topics" value="' +
    esc(filter) +
    '"></label><div class="select-wrap"><select id="status" aria-label="Filter by status">' +
    [
      ['all', 'All topics'],
      ['saved', 'Bookmarked'],
      ['active', 'In progress'],
      ['done', 'Completed'],
    ]
      .map(
        ([v, l]) =>
          '<option value="' +
          v +
          '" ' +
          (testStatus === v ? 'selected' : '') +
          '>' +
          l +
          '</option>',
      )
      .join('') +
    '</select>' +
    icon('chevron') +
    '</div></div><div id="catalog"></div>'
  renderCatalog()
}
function renderCatalog() {
  const found = (subjects.get(browseSubject)?.topics ?? topics).filter(
    (t) =>
      t.title.toLowerCase().includes(filter.trim().toLowerCase()) &&
      (testStatus === 'all' ||
        (testStatus === 'saved' && db.saved.includes(t.id)) ||
        (testStatus === 'active' && activeFor(t)) ||
        (testStatus === 'done' && doneFor(t))),
  )
  const pages = Math.max(1, Math.ceil(found.length / pageSize))
  page = Math.min(page, pages)
  $('catalog').innerHTML = found.length
    ? '<div class="tests ' +
      (db.layout === 'list' ? 'list-mode' : '') +
      '">' +
      found
        .slice((page - 1) * pageSize, page * pageSize)
        .map(topicCard)
        .join('') +
      '</div><div class="pagination"><span>' +
      fmt((page - 1) * pageSize + 1) +
      '–' +
      fmt(Math.min(page * pageSize, found.length)) +
      ' of ' +
      fmt(found.length) +
      '</span><div class="row"><button aria-label="Previous page" class="btn" data-page="-1" ' +
      (page === 1 ? 'disabled' : '') +
      '>' +
      icon('left') +
      '</button><span>' +
      page +
      ' / ' +
      pages +
      '</span><button aria-label="Next page" class="btn" data-page="1" ' +
      (page === pages ? 'disabled' : '') +
      '>' +
      icon('right') +
      '</button></div></div>'
    : empty('No matching topics', 'Try a different search or filter.', 'search')
}
function modes() {
  return (
    '<div class="modes">' +
    [
      ['study', 'Study mode', 'Immediate answers and explanations.', 'book'],
      ['exam', 'Exam mode', 'Timed, with feedback after submission.', 'clock'],
    ]
      .map(
        ([v, t, s, i]) =>
          '<button class="mode ' +
          (mode === v ? 'chosen' : '') +
          '" data-mode="' +
          v +
          '" aria-pressed="' +
          (mode === v) +
          '">' +
          icon(i) +
          '<span><strong>' +
          t +
          '</strong><small>' +
          s +
          '</small></span></button>',
      )
      .join('') +
    '</div>'
  )
}
function info(t, source) {
  setPage('Topic')
  const subject = subjects.get(source)
  const back =
    subject?.topics.includes(t) || source === 'all' ? '/' + source : ''
  content.innerHTML =
    '<a class="back" href="#dashboard' +
    esc(back) +
    '">' +
    icon('left') +
    esc(back ? subject?.title || 'All topics' : 'All subjects') +
    '</a>' +
    heading(t.title, fmt(t.count) + (t.count === 1 ? ' question' : ' questions')) +
    '<div class="setup-card"><h2 class="section-head">Choose a mode</h2>' +
    modes() +
    button('Start practice', 'start', 'primary') +
    '</div><div style="margin-top:16px">' +
    active()
      .filter((a) => a.topic === t.id)
      .map(sessionRow)
      .join('') +
    '</div>'
}
function matchingTopics() {
  const term = $('pick-search')?.value.trim().toLowerCase() || ''
  const available = subjects.get(builderSettings.subject)?.topics ?? topics
  return available.filter((t) => t.title.toLowerCase().includes(term))
}
function picker() {
  const hits = matchingTopics()
  $('picks').innerHTML =
    hits
      .slice(0, 150)
      .map(
        (t) =>
          '<label><input type="checkbox" data-pick="' +
          esc(t.id) +
          '" ' +
          (selectedTopics.has(t.id) ? 'checked' : '') +
          '>' +
          esc(t.title) +
          ' <small class="dim">(' +
          t.count +
          ')</small></label>',
      )
      .join('') || '<p class="hint">No matching topics.</p>'
  if (hits.length > 150)
    $('picks').insertAdjacentHTML(
      'beforeend',
      '<p class="hint">Narrow your search to see more topics.</p>',
    )
  pickSummary()
}
function pickSummary() {
  const count = matchingRefs().length
  $('picked').innerHTML =
    selectedTopics.size > 8
      ? '<span class="chip">' + selectedTopics.size + ' topics selected</span>'
      : Array.from(selectedTopics)
          .map(
            (id) =>
              '<button class="chip" data-unpick="' +
              esc(id) +
              '" aria-label="Remove ' +
              esc(byID.get(id).title) +
              '">' +
              esc(byID.get(id).title) +
              ' ×</button>',
          )
          .join('')
  $('available').textContent = fmt(count) + ' available questions'
  $('num-q').max = Math.max(1, count)
  $('num-q').value = Math.min(customCount, Math.max(1, count)) || 1
  $('start-custom').disabled = !count
}
function custom() {
  setPage('Custom practice')
  content.innerHTML =
    heading('Custom practice', 'Build a session from the topics you choose.') +
    '<form id="builder" class="setup-card"><div class="fields"><div class="field">' +
    selectControl(
      'pick-subject',
      'Subject',
      [
        ['', 'All subjects'],
        ...Array.from(subjects.values(), (s) => [s.id, s.title]),
      ],
      builderSettings.subject,
    ) +
    '<label for="pick-search">Topics</label><label class="searchbox">' +
    icon('search') +
    '<input type="search" id="pick-search" placeholder="Find topics to include"></label><div class="picklist" id="picks"></div><div class="tags" id="picked"></div><div class="row"><button type="button" class="btn" data-act="select-all">Select all matching topics</button><button type="button" class="plain" data-act="clear-topics">Clear selection</button></div></div><div class="field"><label for="num-q">Number of questions</label><input id="num-q" type="number" min="1" required> <span class="hint" id="available"></span></div></div>' +
    advancedControls() +
    '<h2 class="section-head" style="margin-top:18px">Session mode</h2>' +
    modes() +
    '<button type="submit" class="btn primary" id="start-custom">Start custom practice</button></form>'
  picker()
}
function marksList() {
  setPage('Bookmarks')
  const saved = topics.filter((t) => db.saved.includes(t.id))
  content.innerHTML =
    heading('Bookmarks', 'Revisit the topics and questions you saved.') +
    '<h2 class="section-head">Saved topics · ' +
    saved.length +
    '</h2>' +
    (saved.length
      ? '<div class="tests">' + saved.map(topicCard).join('') + '</div>'
      : empty(
          'No saved topics',
          'Select Save on any topic card.',
          'bookmark',
        )) +
    '<h2 class="section-head" style="margin-top:24px">Saved questions · ' +
    db.questions.length +
    '</h2>' +
    (db.questions.length
      ? db.questions
          .map(
            (r) =>
              '<div class="history-item"><div><strong>' +
              esc(byID.get(r.t)?.title || r.t) +
              '</strong><p>Question ' +
              (r.n + 1) +
              ' · ' +
              esc(r.q) +
              '</p></div><div class="row"><button class="btn" data-openq="' +
              esc(r.t) +
              '" data-n="' +
              r.n +
              '">Open</button><button class="icon-button" data-removeq="' +
              esc(r.t) +
              '" data-n="' +
              r.n +
              '" aria-label="Remove question bookmark">' +
              icon('x') +
              '</button></div></div>',
          )
          .join('')
      : empty(
          'No saved questions',
          'Bookmark a question during a session to keep it here.',
          'bookmark',
        ))
}
function results() {
  setPage('Results')
  content.innerHTML =
    heading(
      'Results',
      'Review completed tests and pick up unfinished sessions.',
    ) +
    active().map(sessionRow).join('') +
    (done().length
      ? done()
          .slice()
          .reverse()
          .map(
            (a) =>
              '<div class="history-item"><div><strong>' +
              esc(a.name) +
              '</strong><p>' +
              new Date(a.finished).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }) +
              ' · ' +
              a.score.right +
              ' of ' +
              a.refs.length +
              ' correct</p></div><button class="btn" data-result="' +
              a.id +
              '">View results</button></div>',
          )
          .join('')
      : empty(
          'No completed tests yet',
          'Your score and answer review will appear when you finish a test.',
          'chart',
        ))
}
function dataPage() {
  setPage('My data')
  content.innerHTML =
    heading('My data', 'Progress and bookmarks are stored in this browser.') +
    '<section class="panel"><h2>Study backup</h2><p class="storage-note">Export your sessions, results, bookmarks and preferences. Restore a backup to move them to another browser.</p><div class="data-actions">' +
    button('Export backup', 'export', '', 'download') +
    button('Restore backup', 'restore', '', 'upload') +
    (db.feedback.length ? button('Export question feedback', 'export-feedback') : '') +
    '<input type="file" accept=".json,application/json" id="backup-file" hidden></div></section><section class="panel"><h2>Question source</h2><p class="storage-note">This site includes the Dr. Reason AMBOSS Combined question collection. Tests are cached on this device when browser storage is available.</p></section><section class="panel"><h2>Illustration credit</h2><p class="storage-note">Human Heart by Ryan Kissinger, NIAID BioArt. Adapted in green for the dashboard.</p></section>'
}
let storePromise
function dataStore() {
  if (!storePromise)
    storePromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open('clinical-qbank-test-cache', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('tests')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  return storePromise
}
async function cachedTest(id, payload) {
  const storage = await dataStore()
  if (!storage) return null
  return new Promise((resolve) => {
    try {
      const tx = storage.transaction(
          'tests',
          payload ? 'readwrite' : 'readonly',
        ),
        objects = tx.objectStore('tests'),
        req = payload ? objects.put(payload, id) : objects.get(id)
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = tx.onabort = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}
const revision = 'bundled-2207a2ae:'
async function loadTest(id) {
  if (!byID.has(id)) throw Error('Unknown test.')
  if (cache.has(id)) return cache.get(id)
  if (pending.has(id)) return pending.get(id)
  const task = (async () => {
    let data = await cachedTest(revision + id)
    if (!data) {
      const response = await fetch('tests/' + encodeURIComponent(id) + '.json.gz', {
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok)
        throw Error('This site could not load the test (HTTP ' + response.status + ').')
      const json =
        response.headers.get('content-encoding') === 'gzip'
          ? response
          : new Response(
              response.body.pipeThrough(new DecompressionStream('gzip')),
            )
      data = await json.json()
      if (!Array.isArray(data.questions) || !data.questions.length)
        throw Error('The test file contains no questions.')
      if (
        data.questions.length !== byID.get(id).count ||
        data.questions.some((q, i) => String(q.id) !== byID.get(id).ids[i])
      )
        throw Error(
          'This test file does not match the question index.',
        )
      await cachedTest(revision + id, data)
    }
    cache.set(id, data)
    return data
  })()
  pending.set(id, task)
  try {
    return await task
  } finally {
    pending.delete(id)
  }
}
function safeURL(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  try {
    const u = new URL(raw, document.baseURI)
    return u.protocol === 'https:' ? u.href : ''
  } catch {
    return ''
  }
}
function rich(raw, keys = false) {
  const source = document.createElement('template')
  source.innerHTML = String(raw || '')
  const allow = new Set([
    'p',
    'div',
    'ul',
    'ol',
    'li',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'sub',
    'sup',
    'table',
    'tbody',
    'tr',
    'td',
    'th',
    'thead',
    'br',
    'hr',
    'span',
    'a',
    'img',
    'h3',
    'h4',
    'blockquote',
    'small',
    'figure',
    'figcaption',
  ])
  function walk(node) {
    if (node.nodeType === 3) return esc(clean(node.nodeValue))
    if (node.nodeType !== 1) return ''
    const tag = node.localName
    if (
      [
        'style',
        'script',
        'iframe',
        'object',
        'embed',
        'svg',
        'math',
        'form',
        'video',
        'audio',
        'link',
      ].includes(tag)
    )
      return ''
    const inside = Array.from(node.childNodes, walk).join('')
    if (!allow.has(tag)) return inside
    if (tag === 'img') {
      const url = safeURL(node.getAttribute('src'))
      return url
        ? '<img loading="lazy" referrerpolicy="no-referrer" src="' +
            esc(url) +
            '" alt="' +
            esc(node.getAttribute('alt') || 'Clinical illustration') +
            '">'
        : ''
    }
    if (tag === 'a') {
      const url = safeURL(node.getAttribute('href'))
      return url
        ? '<a target="_blank" rel="noopener noreferrer" href="' +
            esc(url) +
            '">' +
            inside +
            '</a>'
        : inside
    }
    if (tag === 'br' || tag === 'hr') return '<' + tag + '>'
    if (node.classList.contains('Highlight') && keys)
      return '<mark class="key-visible">' + inside + '</mark>'
    if (node.classList.contains('wichtig'))
      return '<strong>' + inside + '</strong>'
    if (
      tag === 'div' &&
      node.firstElementChild?.tagName === 'STRONG' &&
      /^tip$/i.test(node.firstElementChild.textContent.trim())
    )
      return (
        '<div class="tip">' +
        inside.replace(
          '<strong>Tip</strong>',
          '<strong>Attending tip</strong>',
        ) +
        '</div>'
      )
    return '<' + tag + '>' + inside + '</' + tag + '>'
  }
  return Array.from(source.content.childNodes, walk).join('')
}
function media(urls, alt) {
  const items = Array.from(
    new Set(
      (Array.isArray(urls) ? urls : [])
        .map((x) => safeURL(typeof x === 'string' ? x : x?.url))
        .filter(Boolean),
    ),
  )
  return items.length
    ? '<div class="media-row">' +
        items
          .map(
            (url) =>
              '<a href="' +
              esc(url) +
              '" target="_blank" rel="noopener noreferrer"><img referrerpolicy="no-referrer" loading="lazy" src="' +
              esc(url) +
              '" alt="' +
              alt +
              '"></a>',
          )
          .join('') +
        '</div>'
    : ''
}
function correctLabels(q) {
  const data = q._grade?.correct_labels
  if (Array.isArray(data) && data.length) return data.map(String)
  const z = String(q.correct_answer || '').match(/^\s*([A-Z])(?:[.)\s]|$)/i)
  if (z) return [z[1].toUpperCase()]
  return (q.options || [])
    .filter((o) => clean(o.text).trim() === clean(q.correct_answer).trim())
    .map((o) => String(o.label))
}
function explanation(q, guidance) {
  const audio = safeURL(typeof q.audio === 'string' ? q.audio : q.audio?.url),
    video = safeURL(typeof q.video === 'string' ? q.video : q.video?.url)
  return (
    '<div class="rich">' +
    (guidance.general || (!guidance.options.size
      ? '<p>' + esc(q.correct_answer || 'Explanation unavailable.') + '</p>'
      : '')) +
    '</div>' +
    media(q.explanation_images, 'Explanation image') +
    (audio
      ? '<audio controls preload="none" src="' + esc(audio) + '"></audio>'
      : '') +
    (video
      ? '<a class="btn" target="_blank" rel="noopener noreferrer" href="' +
        esc(video) +
        '">Open video explanation</a>'
      : '') +
    (guidance.credits ? '<footer class="question-source">' + guidance.credits + '</footer>' : '')
  )
}
function score(a) {
  const vals = Object.values(a.answers),
    right = vals.filter((v) => v.right === true).length,
    ungraded = vals.filter((v) => v.right === null).length,
    wrong = vals.length - right - ungraded
  return {
    right,
    wrong,
    ungraded,
    blank: a.refs.length - vals.length,
    marks: right * 4 - wrong,
  }
}
function finish(a, at = Date.now()) {
  if (a.finished) return
  a.finished = at
  a.score = score(a)
  save()
}
function expire() {
  const now = Date.now()
  for (const a of active()) {
    if (a.deadline && now >= a.deadline) {
      finish(a, a.deadline)
      if (route() === 'session/' + a.id) {
        if (dialog.open) dialog.close()
        go('result/' + a.id)
        notice('Time is up. Your exam has been submitted.')
      }
    }
  }
}
function timerText(a) {
  const sec = Math.max(0, Math.ceil(((a.deadline || 0) - Date.now()) / 1000))
  return [Math.floor(sec / 60), String(sec % 60).padStart(2, '0')].join(':')
}
function makeSession(name, topic, refs, minutes, at = 0) {
  const start = Date.now(),
    a = {
      id: uid(),
      name,
      topic,
      refs,
      mode,
      at,
      start,
      finished: 0,
      answers: {},
      flags: [],
      deadline: mode === 'exam' ? start + minutes * 60000 : null,
    }
  db.attempts.push(a)
  save()
  resetQuestionView()
  go('session/' + a.id)
}
function mix(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
async function startSession(customized = false) {
  if (selectionBusy) return
  const t = byID.get(route().split('/')[1]),
    buildRoute = route()
  let refs, name, topic, minutes
  if (customized) {
    const limit = Number($('num-q')?.value)
    if (!Number.isInteger(limit) || limit < 1 || !selectedTopics.size) return
    refs = chooseRefs(matchingRefs(), limit)
    name =
      builderSettings.name.trim() ||
      (selectedTopics.size === 1
        ? byID.get([...selectedTopics][0]).title + ' practice'
        : 'Custom practice')
    topic = null
    minutes = Number(builderSettings.duration) || refs.length + 10
  } else {
    if (!t) return
    refs = t.ids.map((_, n) => ({ t: t.id, n }))
    name = t.title
    topic = t.id
    minutes = t.minutes
  }
  if (!refs.length) return
  selectionBusy = true
  const startButton = customized
    ? $('start-custom')
    : content.querySelector('[data-act=start]')
  if (startButton) {
    startButton.disabled = true
    startButton.textContent = 'Loading questions…'
  }
  try {
    await loadTest(refs[0].t)
    if (route() === buildRoute) makeSession(name, topic, refs, minutes)
  } catch (err) {
    if (route() === buildRoute) sourceError(err)
  } finally {
    selectionBusy = false
    if (startButton) {
      startButton.disabled = false
      startButton.textContent = customized
        ? 'Start custom practice'
        : 'Start practice'
    }
  }
}
function sourceError(err) {
  modal(
    'Could not load questions',
    '<p>The topic could not be loaded. Check your connection and try again.</p><p class="hint">' +
      esc(err.message) +
      '</p><div class="modal-actions">' +
      button('Close', 'close') +
      '</div>',
  )
}
const currentA = () => db.attempts.find((a) => a.id === route().split('/')[1])
const qRef = (a) => a.refs[a.at]
const qData = (a) => {
  const r = qRef(a)
  return cache.get(r.t)?.questions[r.n]
}
function currentQKey(t, n) {
  return db.questions.some((r) => r.t === t && r.n === n)
}
function toggleQ(t, n) {
  const on = currentQKey(t, n)
  if (on) db.questions = db.questions.filter((r) => !(r.t === t && r.n === n))
  else db.questions.push({ t, n, q: byID.get(t).ids[n] })
  save()
  return !on
}
function palette(a) {
  return (
    '<aside class="panel palette ' +
    (quizPalette ? 'open' : '') +
    '"><h2>Questions</h2><div class="question-palette">' +
    a.refs
      .map(
        (_, i) =>
          '<button class="jump ' +
          (a.at === i ? 'current ' : '') +
          (a.answers[i] ? 'answered ' : '') +
          (a.flags.includes(i) ? 'flagged' : '') +
          '" data-jump="' +
          i +
          '" aria-label="Question ' +
          (i + 1) +
          (a.answers[i] ? ', answered' : '') +
          (a.flags.includes(i) ? ', flagged' : '') +
          '" ' +
          (a.at === i ? 'aria-current="step"' : '') +
          '>' +
          (i + 1) +
          '</button>',
      )
      .join('') +
    '</div></aside>'
  )
}
function question(a, review = false) {
  const r = qRef(a),
    q = qData(a),
    ans = a.answers[a.at],
    show = review || (a.mode === 'study' && !!ans),
    labels = correctLabels(q),
    flag = a.flags.includes(a.at),
    bookmark = currentQKey(r.t, r.n)
  const studyTools = review || a.mode === 'study'
  const guidance = studyTools ? questionGuidance(q) : null
  const keyAvailable = studyTools && /class=["'][^"']*Highlight/i.test(q.raw_text || '')
  const hasTimer = a.deadline && !a.finished
  const note = db.notes.some((entry) => entry.q === q.id)
  const tool = (label, action, pressed) =>
    '<button class="plain" data-act="' + action + '"' +
    (pressed === undefined ? '' : ' aria-pressed="' + pressed + '"') +
    '>' + label + '</button>'
  const options = (q.options || []).map((o) => {
    const label = String(o.label)
    const chosen = ans?.label === label
    if (show) return reviewOption(o, ans, labels, guidance)
    return '<button class="option' + (chosen ? ' chosen' : '') + '" data-option="' +
      esc(label) + '" aria-pressed="' + chosen + '"><strong>' + esc(label) +
      '</strong><span>' + esc(clean(o.text)) + '</span></button>'
  }).join('')
  const extra = show ? explanation(q, guidance) : ''
  const last = a.at === a.refs.length - 1
  content.innerHTML =
    '<div class="headrow"><div><h1 class="page-title">' + esc(a.name) +
    '</h1><p class="sub">' + esc(byID.get(r.t).title) + ' · ' +
    (review ? 'Answer review' : a.mode === 'exam' ? 'Exam mode' : 'Study mode') +
    '</p></div><button class="btn palette-toggle" data-act="palette" aria-expanded="' +
    quizPalette + '">Questions</button></div><div class="quiz-grid">' +
    palette(a) +
    '<article class="quiz-card"><div class="q-meta"><b>Question ' +
    (a.at + 1) + ' of ' + a.refs.length + '</b><div class="row">' +
    (hasTimer ? '<span id="countdown" class="pill"' + (quizView.hideTimer ? ' hidden' : '') +
      '>' + esc(timerText(a)) + ' remaining</span>' +
      tool(quizView.hideTimer ? 'Show timer' : 'Hide timer', 'toggle-timer') : '') +
    tool('Text size', 'settings') + '</div></div><div class="stem">' +
    (q.raw_text ? rich(q.raw_text, quizKeys && keyAvailable) : esc(clean(q.text))) +
    '</div>' + media(q.question_images, 'Question image') +
    '<div class="question-tools" role="group" aria-label="Question tools">' +
    (keyAvailable ? tool('Key info', 'keys', quizKeys) : '') +
    (guidance?.tip ? tool('Attending tip', 'tip', quizView.tip) : '') +
    tool('Labs', 'labs') + tool(note ? 'Edit notes' : 'Add notes', 'notes') +
    tool('Mark', 'flag', flag) + tool('Bookmark', 'qmark', bookmark) +
    (show && labels.length ? tool('Get Anki card', 'anki') : '') +
    tool('More actions', 'question-menu') + '</div>' +
    (guidance?.tip ? '<section class="attending-tip" id="attending-tip"' +
      (quizView.tip ? '' : ' hidden') + '><h2>Attending tip</h2><div class="rich">' +
      guidance.tip + '</div><div class="feedback-row"><button class="plain" data-feedback="tip">Give feedback</button></div></section>' : '') +
    '<div class="options">' + options + '</div>' +
    (extra ? '<div class="question-extra">' + extra + '</div>' : '') +
    ((show && guidance.options.size) || (!a.finished && ans) || (show && guidance.rates)
      ? '<div class="review-tools" role="group" aria-label="Review tools">' +
        (show && guidance.options.size ? '<button class="plain" id="toggle-explanations" data-act="toggle-explanations">Hide all explanations</button>' : '') +
        (!a.finished && ans ? tool('Reset question', 'reset-question') : '') +
        (show && guidance.rates ? tool(quizView.hideStats ? 'Show stats' : 'Hide stats', 'toggle-stats') : '') +
        '</div>' : '') +
    '<div class="quiz-actions">' +
    (!review ? button('Exit session', 'dashboard') : '') +
    '<div class="actions"><button class="btn" data-jump="' + (a.at - 1) + '" ' +
    (a.at === 0 ? 'disabled' : '') + '>Previous</button>' +
    (review ? button('See analysis', 'summary', last ? 'primary' : '')
      : button(last ? 'See analysis' : 'Finish session', 'finish', last ? 'primary' : '')) +
    (!last ? '<button class="btn primary" data-jump="' + (a.at + 1) + '">Next question</button>' : '') +
    '</div></div></article></div>'
  updateExplanationToggle()
}
function updateExplanationToggle() {
  const tool = $('toggle-explanations')
  if (tool) tool.textContent = content.querySelector('details[data-rationale][open]')
    ? 'Hide all explanations' : 'Show all explanations'
}
function resetQuestionView() {
  quizKeys = false
  quizPalette = false
  quizView.tip = false
  quizView.collapsed.clear()
}
async function showQuestion(a, review, version) {
  if (!a) return go('results')
  if (!review && a.finished) return go('result/' + a.id)
  if (review && !a.finished) return go('session/' + a.id)
  setPage(review ? 'Answer review' : 'Questions')
  const r = qRef(a)
  if (!cache.has(r.t))
    content.innerHTML =
      '<div class="panel" role="status">Loading questions…</div>'
  try {
    await loadTest(r.t)
    if (version === routeVersion) question(a, review)
  } catch (e) {
    if (version === routeVersion)
      content.innerHTML =
        empty('Unable to load this test', e.message, 'book') +
        '<div class="data-actions">' +
        button('Try again', 'retry') +
        button('Back to dashboard', 'dashboard') +
        '</div>'
  }
}
function choose(label) {
  const a = currentA()
  if (!a || a.finished || route().split('/')[0] !== 'session') return
  expire()
  if (a.finished || (a.mode === 'study' && a.answers[a.at])) return
  const q = qData(a)
  if (!q || !q.options.some((o) => String(o.label) === label)) return
  if (a.mode === 'exam' && a.answers[a.at]?.label === label)
    delete a.answers[a.at]
  else {
    const labels = correctLabels(q)
    a.answers[a.at] = {
      label,
      at: Date.now(),
      right: labels.length ? labels.includes(label) : null,
    }
  }
  save()
  question(a)
}
function jump(n) {
  const a = currentA()
  if (!a || n < 0 || n >= a.refs.length) return
  a.at = n
  resetQuestionView()
  save()
  render()
  window.scrollTo(0, 0)
}
function askFinish() {
  const a = currentA()
  if (!a || a.finished) return
  const missing = a.refs.length - Object.keys(a.answers).length
  modal(
    'Finish this test?',
    '<p>' +
      (missing
        ? 'You have ' +
          missing +
          ' unanswered question' +
          (missing === 1 ? '' : 's') +
          '. '
        : 'You have answered every question. ') +
      'Submit to see your score and review the explanations.</p><div class="modal-actions">' +
      button('Continue test', 'close') +
      button('Submit test', 'submit', 'primary') +
      '</div>',
  )
}
function summary(a) {
  if (!a || !a.finished) return go('results')
  setPage('Test result')
  const s = a.score
  content.innerHTML =
    heading(a.name, 'Completed ' + new Date(a.finished).toLocaleString()) +
    '<section class="panel"><div class="eyebrow">Test result</div><div class="score">' +
    Math.round((s.right / a.refs.length) * 100) +
    '%</div><p class="dim">' +
    s.marks +
    ' of ' +
    a.refs.length * 4 +
    ' marks</p><div class="summary-pills">' +
    tag(s.right + ' correct', 'checkcircle') +
    tag(s.wrong + ' incorrect', 'x') +
    tag(s.blank + ' unanswered', 'file') +
    (s.ungraded ? tag(s.ungraded + ' ungraded', 'file') : '') +
    '</div><div class="actions">' +
    button('Review answers', 'review', 'primary', 'book') +
    button('All results', 'results') +
    '</div></section>'
}
function settings() {
  modal(
    'Display settings',
    '<div class="settings-line"><div><strong>Theme</strong><p class="hint">' +
      (db.theme === 'dark' ? 'Dark' : 'Light') +
      ' appearance</p></div>' +
      button('Switch theme', 'theme') +
      '</div><div class="settings-line"><strong>Text size</strong><div class="number-actions">' +
      button('A−', 'smaller') +
      '<button class="plain" data-act="reset-size">' +
      db.scale +
      '%</button>' +
      button('A+', 'larger') +
      '</div></div>',
  )
}
function searchResults() {
  const field = $('global'),
    term = field.value.trim().toLowerCase(),
    output = $('search-results')
  if (!term) {
    output.innerHTML = '<p class="hint">Enter a topic name or a question ID.</p>'
    return
  }
  const results = topics
      .filter((t) => t.title.toLowerCase().includes(term))
      .slice(0, 18),
    qs = term.length >= 3 ? qindex.get(term) || [] : []
  output.innerHTML =
    qs
      .slice(0, 30)
      .map(
        (r) =>
          '<button data-openq="' +
          esc(r.t) +
          '" data-n="' +
          r.n +
          '">' +
          icon('file') +
          '<span>' +
          esc(byID.get(r.t).ids[r.n]) +
          '<small>' +
          esc(byID.get(r.t).title) +
          ' · Question ' +
          (r.n + 1) +
          '</small></span></button>',
      )
      .join('') +
      results
        .map(
          (t) =>
            '<button data-topic="' +
            esc(t.id) +
            '">' +
            icon('book') +
            '<span>' +
            esc(t.title) +
            '<small>' +
            t.count +
            ' questions</small></span></button>',
        )
        .join('') || '<p class="hint">No matching topics or question IDs.</p>'
}
function searchDialog() {
  modal(
    'Search question bank',
    '<label class="searchbox">' +
      icon('search') +
      '<input id="global" type="search" aria-label="Search by topic name or question ID" placeholder="Topic name or question ID"></label><div class="modal-list" id="search-results"></div>',
  )
  $('global').focus()
  searchResults()
}
function downloadFile(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function exportData() {
  downloadFile(JSON.stringify({ app: 'clinical-qbank', version: 1, data: db }),
    'clinical-qbank-backup.json', 'application/json')
}
function validRef(r) {
  return (
    r &&
    byID.has(r.t) &&
    Number.isInteger(r.n) &&
    r.n >= 0 &&
    r.n < byID.get(r.t).count
  )
}
function validBackup(raw) {
  if (raw?.app !== 'clinical-qbank' || raw.version !== 1)
    throw Error('Choose a Clinical QBank backup file.')
  const d = raw.data
  if (
    !d ||
    !Array.isArray(d.saved) ||
    !d.saved.every((t) => byID.has(t)) ||
    !Array.isArray(d.questions) ||
    !d.questions.every(validRef) ||
    !Array.isArray(d.attempts)
  )
    throw Error('This backup contains unrecognized records.')
  for (const a of d.attempts) {
    if (
      !a ||
      typeof a.name !== 'string' ||
      !/^[\da-f-]{36}$/i.test(a.id) ||
      !['exam', 'study'].includes(a.mode) ||
      !Array.isArray(a.refs) ||
      !a.refs.length ||
      !a.refs.every(validRef) ||
      !Number.isInteger(a.at) ||
      a.at < 0 ||
      a.at >= a.refs.length ||
      !Array.isArray(a.flags) ||
      !a.flags.every(
        (n) => Number.isInteger(n) && n >= 0 && n < a.refs.length,
      ) ||
      !a.answers ||
      typeof a.answers !== 'object' ||
      Array.isArray(a.answers) ||
      !Number.isFinite(a.start) ||
      !Number.isFinite(a.finished) ||
      (a.mode === 'exam' && !Number.isFinite(a.deadline))
    )
      throw Error('The backup includes an incomplete session.')
    for (const [k, v] of Object.entries(a.answers)) {
      if (
        !/^\d+$/.test(k) ||
        Number(k) >= a.refs.length ||
        !v ||
        typeof v.label !== 'string' ||
        ![true, false, null].includes(v.right)
      )
        throw Error('Invalid answer record.')
    }
    if (a.finished) a.score = score(a)
  }
  return {
    ...blank(),
    saved: [...new Set(d.saved)],
    questions: d.questions.map((r) => ({
      t: r.t,
      n: r.n,
      q: byID.get(r.t).ids[r.n],
    })),
    attempts: d.attempts,
    notes: Array.isArray(d.notes) ? d.notes.filter(validQuestionEntry) : [],
    feedback: Array.isArray(d.feedback) ? d.feedback.filter((entry) =>
      validQuestionEntry(entry) && typeof entry.section === 'string' && Number.isFinite(entry.at),
    ) : [],
    theme: d.theme === 'dark' ? 'dark' : 'light',
    layout: d.layout === 'list' ? 'list' : 'grid',
    scale: Number.isFinite(d.scale)
      ? Math.max(85, Math.min(130, d.scale))
      : 100,
  }
}
let restoreCandidate = null
async function readBackup(input) {
  try {
    const file = input.files[0]
    if (!file) return
    restoreCandidate = validBackup(JSON.parse(await file.text()))
    modal(
      'Restore study backup?',
      '<p>Replace this browser’s saved progress with ' +
        restoreCandidate.attempts.length +
        ' session(s) and ' +
        (restoreCandidate.saved.length + restoreCandidate.questions.length) +
        ' bookmark(s) from the backup.</p><div class="modal-actions">' +
        button('Cancel', 'close') +
        button('Restore backup', 'confirm-restore', 'primary') +
        '</div>',
    )
  } catch (e) {
    notice(e.message)
  } finally {
    input.value = ''
  }
}
async function openSingle(t, n) {
  if (!validRef({ t, n })) return
  const startRoute = route()
  try {
    await loadTest(t)
    if (route() !== startRoute) return
    const existing = active().find(
      (a) =>
        a.mode === 'study' &&
        a.refs.length === 1 &&
        a.refs[0].t === t &&
        a.refs[0].n === n,
    )
    if (existing) return go('session/' + existing.id)
    mode = 'study'
    makeSession(byID.get(t).title, null, [{ t, n }], 1)
  } catch (e) {
    sourceError(e)
  }
}
function render() {
  const version = ++routeVersion
  closeMenu()
  const [tab, id, source] = route().split('/')
  switch (tab) {
    case 'dashboard':
      return id ? browseTests(id) : dashboard()
    case 'custom':
      return custom()
    case 'bookmarks':
      return marksList()
    case 'results':
      return results()
    case 'data':
      return dataPage()
    case 'test':
      return byID.has(id) ? info(byID.get(id), source) : go('dashboard')
    case 'session':
    case 'review':
      return showQuestion(currentA(), tab === 'review', version)
    case 'result':
      return summary(currentA())
    default:
      return go('dashboard')
  }
}
function action(type) {
  const a = currentA()
  switch (type) {
    case 'dashboard':
    case 'custom':
    case 'results':
      return go(type)
    case 'search':
      return searchDialog()
    case 'close':
      dialog.close()
      return
    case 'select-all':
      for (const topic of matchingTopics()) selectedTopics.add(topic.id)
      return picker()
    case 'clear-topics':
      selectedTopics.clear()
      return picker()
    case 'settings':
      return settings()
    case 'theme':
      db.theme = db.theme === 'dark' ? 'light' : 'dark'
      save()
      theme()
      if (dialog.open) settings()
      return
    case 'smaller':
    case 'larger':
    case 'reset-size':
      db.scale =
        type === 'reset-size'
          ? 100
          : Math.max(85, Math.min(130, db.scale + (type === 'larger' ? 5 : -5)))
      save()
      theme()
      return settings()
    case 'start':
      return startSession(false)
    case 'finish':
      return askFinish()
    case 'submit':
      if (a) {
        expire()
        if (!a.finished) finish(a)
        if (dialog.open) dialog.close()
        return go('result/' + a.id)
      }
      return
    case 'summary':
      if (a) return go('result/' + a.id)
      return
    case 'review':
      if (a) {
        a.at = 0
        save()
        return go('review/' + a.id)
      }
      return
    case 'flag':
      if (a) {
        a.flags = a.flags.includes(a.at)
          ? a.flags.filter((n) => n !== a.at)
          : [...a.flags, a.at]
        save()
        render()
      }
      return
    case 'qmark':
      if (a) {
        const r = qRef(a)
        notice(toggleQ(r.t, r.n) ? 'Question bookmarked' : 'Bookmark removed')
        render()
      }
      return
    case 'tip':
      quizView.tip = !quizView.tip
      $('attending-tip').hidden = !quizView.tip
      content.querySelector('[data-act="tip"]').setAttribute('aria-pressed', quizView.tip)
      return
    case 'labs':
      return showLabs()
    case 'notes':
      if (a && qData(a)) questionEditor(qData(a), 'note')
      return
    case 'anki':
      if (a && qData(a) && (a.finished || (a.mode === 'study' && a.answers[a.at])))
        exportAnki(qData(a))
      return
    case 'question-menu':
      if (a && qData(a))
        modal('Question actions', '<p class="hint">Question ID · ' +
          esc(qData(a).id) + '</p><div class="modal-actions">' +
          button('Copy question ID', 'copy-qid') +
          '<button class="btn" data-feedback="">Give feedback</button>' +
          button(a.finished ? 'Back to results' : 'Exit session', a.finished ? 'results' : 'dashboard') + '</div>')
      return
    case 'copy-qid':
      if (a && qData(a) && navigator.clipboard)
        navigator.clipboard.writeText(qData(a).id)
          .then(() => notice('Question ID copied'))
          .catch(() => notice('Select the question ID to copy it.'))
      else notice('Select the question ID to copy it.')
      return
    case 'toggle-explanations': {
      const show = !content.querySelector('details[data-rationale][open]')
      content.querySelectorAll('details[data-rationale]').forEach((detail) => {
        detail.open = show
      })
      updateExplanationToggle()
      return
    }
    case 'toggle-stats':
      quizView.hideStats = !quizView.hideStats
      content.querySelectorAll('.answer-rate').forEach((rate) => { rate.hidden = quizView.hideStats })
      content.querySelector('[data-act="toggle-stats"]').textContent =
        quizView.hideStats ? 'Show stats' : 'Hide stats'
      return
    case 'toggle-timer':
      quizView.hideTimer = !quizView.hideTimer
      $('countdown').hidden = quizView.hideTimer
      content.querySelector('[data-act="toggle-timer"]').textContent =
        quizView.hideTimer ? 'Show timer' : 'Hide timer'
      return
    case 'reset-question':
      expire()
      if (a && !a.finished && route().startsWith('session/')) {
        delete a.answers[a.at]
        resetQuestionView()
        save()
        render()
      }
      return
    case 'export-feedback':
      downloadFile(JSON.stringify(db.feedback, null, 2), 'clinical-qbank-feedback.json', 'application/json')
      return
    case 'keys':
      quizKeys = !quizKeys
      return render()
    case 'palette':
      quizPalette = !quizPalette
      return render()
    case 'retry':
      return render()
    case 'export':
      return exportData()
    case 'restore':
      return $('backup-file')?.click()
    case 'confirm-restore':
      if (restoreCandidate) {
        db = restoreCandidate
        restoreCandidate = null
        save()
        dialog.close()
        expire()
        render()
        notice('Study backup restored')
      }
      return
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b || b.disabled) return
  if (b.id === 'menu') {
    document.body.classList.add('nav-open')
    $('scrim').hidden = false
    return
  }
  const d = b.dataset
  if (d.feedback !== undefined) {
    const a = currentA()
    if (a && qData(a)) questionEditor(qData(a), 'feedback', d.feedback)
    return
  }
  if (d.topic) {
    const source =
      !dialog.open && route().startsWith('dashboard/') ? '/' + browseSubject : ''
    if (dialog.open) dialog.close()
    mode = 'study'
    go('test/' + d.topic + source)
    return
  }
  if (d.openq) {
    if (dialog.open) dialog.close()
    openSingle(d.openq, Number(d.n))
    return
  }
  if (d.removeq) {
    toggleQ(d.removeq, Number(d.n))
    marksList()
    return
  }
  if (d.save) {
    db.saved = db.saved.includes(d.save)
      ? db.saved.filter((v) => v !== d.save)
      : [...db.saved, d.save]
    save()
    if (route().startsWith('dashboard/')) renderCatalog()
    else marksList()
    return
  }
  if (d.page) {
    page += Number(d.page)
    renderCatalog()
    $('browse-title').scrollIntoView({ block: 'start' })
    return
  }
  if (d.layout) {
    db.layout = d.layout
    save()
    browseTests(browseSubject)
    return
  }
  if (d.mode) {
    e.preventDefault()
    mode = d.mode
    const area = b.closest('.modes')
    area.outerHTML = modes()
    return
  }
  if (d.unpick) {
    e.preventDefault()
    selectedTopics.delete(d.unpick)
    picker()
    return
  }
  if (d.session) return go('session/' + d.session)
  if (d.result) return go('result/' + d.result)
  if (d.option) return choose(d.option)
  if (d.jump !== undefined) return jump(Number(d.jump))
  if (d.act) {
    e.preventDefault()
    action(d.act)
  }
})
document.addEventListener('input', (e) => {
  if (e.target.id === 'session-name') builderSettings.name = e.target.value
  if (e.target.id === 'exam-duration') builderSettings.duration = e.target.value
  if (e.target.id === 'specific-qids') {
    builderSettings.qid = e.target.value
    pickSummary()
  }
  if (e.target.id === 'filter') {
    filter = e.target.value
    page = 1
    renderCatalog()
  }
  if (e.target.id === 'global') searchResults()
  if (e.target.id === 'pick-search') picker()
  if (e.target.id === 'num-q')
    customCount = Math.max(1, Number(e.target.value) || 1)
})
document.addEventListener('change', (e) => {
  if (e.target.id === 'pick-subject') {
    builderSettings.subject = e.target.value
    picker()
  }
  if (e.target.id === 'history-filter') {
    builderSettings.history = e.target.value
    pickSummary()
  }
  if (e.target.id === 'mix-order') builderSettings.order = e.target.value
  if (e.target.id === 'status') {
    testStatus = e.target.value
    page = 1
    renderCatalog()
  }
  if (e.target.dataset.pick) {
    const t = e.target.dataset.pick
    if (e.target.checked) selectedTopics.add(t)
    else selectedTopics.delete(t)
    pickSummary()
  }
  if (e.target.id === 'backup-file') readBackup(e.target)
})
document.addEventListener('submit', (e) => {
  if (e.target.id === 'question-editor') {
    e.preventDefault()
    return saveQuestionEditor(e.target)
  }
  if (e.target.id === 'builder') {
    e.preventDefault()
    startSession(true)
  }
})
content.addEventListener('toggle', (e) => {
  const label = e.target.dataset?.rationale
  if (!label || !content.contains(e.target)) return
  if (e.target.open) quizView.collapsed.delete(label)
  else quizView.collapsed.add(label)
  updateExplanationToggle()
}, true)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (topics.length) searchDialog()
    return
  }
  if (e.key === 'Escape') closeMenu()
  if (
    dialog.open ||
    e.target.closest('input,select,textarea,[contenteditable=true]') ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey
  )
    return
  const kind = route().split('/')[0],
    a = currentA()
  if (!a || !['session', 'review'].includes(kind) || !qData(a)) return
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    jump(a.at + (e.key === 'ArrowLeft' ? -1 : 1))
    return
  }
  const k = e.key.toLowerCase()
  if (k === 'm') action('flag')
  else if (k === 's') action('qmark')
  else if (k === 'p') action('palette')
  else if (kind === 'session') {
    const q = qData(a),
      o = /^[1-9]$/.test(k)
        ? q.options[Number(k) - 1]
        : q.options.find((v) => String(v.label).toLowerCase() === k)
    if (o) choose(String(o.label))
  }
})
document.querySelector('.skip').addEventListener('click', (e) => {
  e.preventDefault()
  content.focus()
})
window.addEventListener('storage', (event) => {
  if (event.key !== key || !event.newValue || !topics.length) return
  try {
    db = validBackup({
      app: 'clinical-qbank',
      version: 1,
      data: JSON.parse(event.newValue),
    })
    expire()
    if (!dialog.open) render()
  } catch {}
})
$('scrim').addEventListener('click', closeMenu)
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close()
})
dialog.addEventListener('close', () => {
  restoreCandidate = null
})
window.addEventListener('hashchange', () => {
  if (dialog.open) dialog.close()
  resetQuestionView()
  window.scrollTo(0, 0)
  if (topics.length) render()
})
function tick() {
  expire()
  const a = currentA()
  if (a?.deadline && !a.finished && $('countdown'))
    $('countdown').textContent = timerText(a) + ' remaining'
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick()
})
setInterval(tick, 1000)
async function init() {
  document
    .querySelectorAll('i[data-icon]')
    .forEach((el) => (el.innerHTML = icon(el.dataset.icon)))
  theme()
  try {
    const [catalog, groups] = await Promise.all([
      fetch('catalog.json'),
      fetch('subjects.json'),
    ])
    if (!catalog.ok || !groups.ok) throw Error()
    topics = await catalog.json()
    byID = new Map(topics.map((t) => [t.id, t]))
    subjects = new Map(
      (await groups.json()).map((group) => {
        const tests = group.topics.map((id) => byID.get(id)).filter(Boolean)
        return [
          group.id,
          {
            ...group,
            topics: tests,
            questionCount: tests.reduce((total, test) => total + test.count, 0),
          },
        ]
      }),
    )
    for (const t of topics)
      t.ids.forEach((id, n) => {
        const k = id.toLowerCase()
        if (!qindex.has(k)) qindex.set(k, [])
        qindex.get(k).push({ t: t.id, n })
      })
    expire()
    render()
  } catch (e) {
    content.innerHTML = empty(
      'Catalog unavailable',
      'Reload this page to try loading the catalog again.',
      'book',
    )
  }
}
init()
