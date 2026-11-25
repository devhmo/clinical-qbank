'use strict'

const guidanceCache = new WeakMap()
const importedQuestionReview = {
  v80Ao3: {
    topic: 'achalasia',
    rates: { A: 72, B: 2, C: 9, D: 0, E: 1, F: 1, G: 15 },
    learningPoint: 'Diffuse esophageal spasm manifests with dysphagia and retrosternal chest pain that is often relieved by nitrates and is characterized by simultaneous, multi-peak contractions on esophageal manometry.',
  },
  QZauYQ: {
    topic: 'induced_abortion',
    rates: { A: 5, B: 63, C: 22, D: 3, E: 6, F: 1 },
    learningPoint: 'Mifepristone is a competitive progesterone receptor antagonist that is used for medical abortion and acts by inducing decidual necrosis, cervical softening, and detachment of the products of conception.',
  },
}

function questionGuidance(q) {
  if (guidanceCache.has(q)) return guidanceCache.get(q)
  const source = document.createElement('template')
  source.innerHTML = q.explanation || ''
  for (const signature of source.content.querySelectorAll('.exp-attribution')) {
    if (signature.textContent.normalize('NFKC').trim().toLowerCase() === 'aseel') signature.remove()
  }
  const options = new Map()
  const other = []
  const credits = []
  let tip = ''
  for (const node of source.content.childNodes) {
    const heading = node.firstElementChild
    const label = heading?.localName === 'strong' ? heading.textContent.trim() : ''
    const option = label.match(/^Option\s+([A-Z])\s*:?$/i)
    if (node.nodeName === 'DIV' && (option || /^Tip\s*:?$/i.test(label))) {
      const copy = node.cloneNode(true)
      copy.firstElementChild.remove()
      const text = copy.firstChild
      if (text?.nodeType === 3) text.nodeValue = text.nodeValue.replace(/^\s*:\s*/, '')
      if (option) {
        const letter = option[1].toUpperCase()
        options.set(letter, (options.get(letter) || '') + rich(copy.innerHTML))
      } else tip += rich(copy.innerHTML)
    } else if (node.classList?.contains('exp-attribution')) {
      credits.push(rich(node.outerHTML))
    } else if (node.nodeType === 1) {
      other.push({ label, node })
    } else if (node.nodeType === 3 && node.textContent.trim()) {
      other.push({ label: '', node })
    }
  }
  const general = other
    .filter(({ label, node }) =>
      !options.size || (node.nodeName !== 'HR' && !/^Correct answer:/i.test(label)),
    )
    .map(({ node }) => node.nodeType === 3 ? esc(clean(node.textContent)) : rich(node.outerHTML))
    .join('')
  const entry = Object.hasOwn(importedQuestionReview, q.id) ? importedQuestionReview[q.id] : {}
  const guidance = { options, tip, general, credits: credits.join(''), ...entry }
  guidanceCache.set(q, guidance)
  return guidance
}

function reviewOption(option, answer, labels, guidance, expanded) {
  const label = String(option.label)
  const correct = labels.includes(label)
  const selected = answer?.label === label
  const rate = guidance.rates?.[label]
  const rationale = guidance.options.get(label) || ''
  const learningPoint =
    correct && guidance.learningPoint && !/key learning point/i.test(rationale)
      ? '<div class="learning-point"><strong>Key learning point</strong><p>' +
        esc(guidance.learningPoint) +
        '</p></div>'
      : ''
  const header =
    '<span class="answer-letter">' + esc(label) + '</span><span class="answer-title">' +
    esc(clean(option.text)) + '<span class="sr">' +
    (correct ? ' · Correct answer' : '') +
    (selected ? ' · Your answer' : '') +
    '</span></span>' +
    (Number.isFinite(rate)
      ? '<span class="answer-rate" title="Answer rate in the reference"' +
        (quizView.hideStats ? ' hidden' : '') + '>' + rate + '%</span>'
      : '')
  const classes = 'answer-review' + (correct ? ' is-correct' : labels.length ? (selected ? ' is-incorrect' : ' distractor') : '') + (selected ? ' selected' : '')
  const topic = correct && byID.get(guidance.topic)
  const topicLink = topic ? '<a class="answer-topic" href="#test/' + esc(topic.id) + '">' +
    icon('book') + esc(topic.title) + '</a>' : ''
  return '<details class="' + classes + '" data-rationale="' + esc(label) + '"' +
    (expanded ? ' open' : '') + '><summary class="answer-summary">' +
    header + '<span class="answer-result" aria-hidden="true">' + (correct ? '✓' : labels.length ? '−' : '') + '</span></summary>' +
    '<div class="answer-body rich">' + (rationale || learningPoint ? rationale + learningPoint :
      '<p class="hint">The source has no explanation for this option.</p>') +
    '<div class="feedback-row">' + topicLink + '<button class="plain" data-feedback="' + esc(label) +
    '">' + icon('feedback') + 'Give feedback</button></div></div></details>'
}

const labPanels = [
  {
    name: 'Complete blood count',
    source: 'https://medlineplus.gov/ency/article/003642.htm',
    ranges: [
      ['White blood cells', '4,500–11,000 cells/µL'],
      ['Hemoglobin', 'Female 12–16 g/dL · Male 13–18 g/dL'],
      ['Hematocrit', 'Female 36–48% · Male 40–55%'],
      ['Mean corpuscular volume', '80–100 fL'],
    ],
  },
  {
    name: 'Basic metabolic panel',
    source: 'https://medlineplus.gov/ency/article/003462.htm',
    ranges: [
      ['Sodium', '136–144 mEq/L'],
      ['Potassium', '3.7–5.2 mEq/L'],
      ['Chloride', '96–106 mmol/L'],
      ['Total CO₂', '23–29 mmol/L'],
      ['Creatinine', '0.8–1.2 mg/dL'],
      ['Blood urea nitrogen', '6–20 mg/dL'],
      ['Calcium', '8.5–10.2 mg/dL'],
      ['Glucose, fasting', '64–100 mg/dL'],
    ],
  },
]

function showLabs() {
  modal('Lab reference', '<p class="hint">Common adult reference intervals. Use the range supplied in the question when available.</p>' +
    labPanels.map(({ name, source, ranges }) =>
      '<section class="lab-panel"><h3>' + esc(name) + '</h3><dl>' +
      ranges.map(([test, range]) => '<div><dt>' + esc(test) + '</dt><dd>' + esc(range) + '</dd></div>').join('') +
      '</dl><a target="_blank" rel="noopener noreferrer" href="' + esc(source) + '">MedlinePlus reference</a></section>',
    ).join(''))
}

function questionEditor(q, kind, section = '') {
  const isNote = kind === 'note'
  const note = isNote ? db.notes.find((entry) => entry.q === q.id)?.text || '' : ''
  const subject = section === 'tip' ? 'Attending tip' : section ? 'Option ' + section : 'Question'
  modal(isNote ? 'Question notes' : 'Feedback · ' + subject,
    '<form id="question-editor" data-kind="' + kind + '" data-qid="' + esc(q.id) +
    '" data-section="' + esc(section) + '"><label for="question-text">' +
    (isNote ? 'Your notes' : 'Describe the issue') +
    '</label><textarea id="question-text" name="text" rows="6" maxlength="4000"' +
    (isNote ? '' : ' required') + '>' + esc(note) + '</textarea><p class="hint">' +
    (isNote ? 'Saved on this device and included in your study backup.' :
      'Saved on this device. Export your feedback from My data to share it.') +
    '</p><div class="modal-actions"><button type="button" class="btn" data-act="close">Cancel</button>' +
    '<button class="btn primary" type="submit">' + (isNote ? 'Save notes' : 'Save feedback') + '</button></div></form>')
  $('question-text').focus()
}

function saveQuestionEditor(form) {
  const q = form.dataset.qid
  if (!qindex.has(q.toLowerCase())) return
  const text = new FormData(form).get('text').trim()
  if (form.dataset.kind === 'note') {
    db.notes = db.notes.filter((entry) => entry.q !== q)
    if (text) db.notes.push({ q, text })
  } else {
    if (!text) return
    db.feedback.push({ q, section: form.dataset.section, text, at: Date.now() })
  }
  save()
  dialog.close()
  notice(form.dataset.kind === 'note' ? 'Notes saved' : 'Feedback saved on this device')
  render()
}

function validQuestionEntry(entry) {
  return entry && typeof entry.q === 'string' && qindex.has(entry.q.toLowerCase()) &&
    typeof entry.text === 'string' && entry.text.length <= 4000
}

function exportAnki(q) {
  const correct = correctLabels(q)
  const guidance = questionGuidance(q)
  const answer = q.options.filter((option) => correct.includes(String(option.label)))
    .map((option) => esc(option.label) + '. ' + esc(clean(option.text))).join('<br>')
  const format = (value) => value.replace(/[\t\r\n]+/g, ' ').replace(/"/g, '""')
  const front = esc(clean(q.text)) + '<br><br>' + q.options.map((option) =>
    esc(option.label) + '. ' + esc(clean(option.text)),
  ).join('<br>')
  const rationale = correct.map((label) => guidance.options.get(label) || '').join('<br>')
  const back = (answer || esc(clean(q.correct_answer))) + '<br><br>' + (rationale || guidance.general)
  const filename = 'clinical-qbank-' + q.id.replace(/[^\w-]/g, '_') + '-anki.txt'
  downloadFile('#separator:Tab\n#html:true\n"' + format(front) + '"\t"' + format(back) + '"\n', filename, 'text/plain;charset=utf-8')
  notice('Anki card downloaded')
}
