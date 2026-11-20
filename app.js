// Christmas Schedule Coordinator
// Two people enter their busy times for the coming week (Monday to Sunday),
// then the page shows the times when both of them are free.

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STORAGE_KEY = 'christmasScheduleCoordinator.v1';
const STEP = 30;           // minutes between time options
const DAY_MINUTES = 1440;  // 24 hours
const WEEK_MINUTES = 7 * DAY_MINUTES;
const MIN_LENGTH_OPTIONS = [30, 60, 90, 120, 180, 240];

// ---------- State and saving ----------

function newPerson() {
  return { name: '', days: DAYS.map(() => []), done: false };
}

function defaultState() {
  return {
    screen: 'welcome',
    current: 0,
    dayIndex: 0,
    minLength: 30,
    people: [newPerson(), newPerson()],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && Array.isArray(saved.people) && saved.people.length) {
        // Fill in anything missing from data saved by an earlier version.
        while (saved.people.length < 2) saved.people.push(newPerson());
        if (!MIN_LENGTH_OPTIONS.includes(saved.minLength)) saved.minLength = 30;
        return saved;
      }
    }
  } catch (e) {
    // Bad or unreadable saved data: fall through and start fresh.
  }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Storage can be unavailable (private mode, full); the page still works without it.
  }
}

let state = load();

function person() {
  return state.people[state.current];
}

// ---------- Time helpers ----------

// Minutes since midnight -> "9:30 AM". 1440 (end of day) shows as midnight.
function formatTime(min) {
  const m = ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${mm} ${ampm}`;
}

const START_OPTIONS = [];
for (let m = 0; m < DAY_MINUTES; m += STEP) START_OPTIONS.push(m);
const END_OPTIONS = [];
for (let m = STEP; m <= DAY_MINUTES; m += STEP) END_OPTIONS.push(m);

function endLabel(min) {
  return min === DAY_MINUTES ? '12:00 AM (midnight)' : formatTime(min);
}

function nextDayName(dayIndex) {
  return DAYS[(dayIndex + 1) % 7];
}

// Works out whether a busy block is usable, and what to tell the user about it.
function blockStatus(block, dayIndex) {
  if (block.start === block.end) {
    return { valid: false, kind: 'error', msg: 'The start and end times are the same. Pick a different end time.' };
  }
  if (block.end > block.start) return { valid: true, kind: 'ok' };

  // Ends earlier in the day than it starts: either overnight or a mistake.
  if (!block.overnight) {
    return {
      valid: false,
      kind: 'ask',
      msg: `This ends earlier than it starts. Does it end the next day (${nextDayName(dayIndex)})?`,
    };
  }
  if (dayIndex === 6) {
    return {
      valid: true,
      kind: 'note',
      msg: `Overnight until ${formatTime(block.end)} Monday. That's past the end of this week, so only the Sunday part counts.`,
    };
  }
  return {
    valid: true,
    kind: 'note',
    msg: `Overnight: runs until ${formatTime(block.end)} on ${nextDayName(dayIndex)}.`,
  };
}

function dayIsValid(dayIndex) {
  return person().days[dayIndex].every((b) => blockStatus(b, dayIndex).valid);
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- DOM helper ----------

// el('div', { class: 'x', onclick: fn }, child, 'text', ...)
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(props)) {
    if (val == null || val === false) continue;
    if (key === 'class') node.className = val;
    else if (key === 'value') value = val;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), val);
    else if (val === true) node.setAttribute(key, '');
    else node.setAttribute(key, val);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  if (value !== undefined) node.value = value; // after options exist, for <select>
  return node;
}

// ---------- Rendering ----------

const app = document.getElementById('app');

function render() {
  app.replaceChildren();
  // The results grid needs more room than the question cards.
  app.classList.toggle('wide', state.screen === 'results');
  if (state.screen === 'day') {
    app.append(renderDay());
    updateNav();
  } else if (state.screen === 'review') {
    app.append(renderReview());
  } else if (state.screen === 'handoff') {
    app.append(renderHandoff());
  } else if (state.screen === 'results') {
    app.append(renderResults());
  } else {
    app.append(renderWelcome());
  }
}

// Switch screens. `who` (0 or 1) changes whose schedule is being edited.
function go(screen, dayIndex, who) {
  state.screen = screen;
  if (dayIndex !== undefined) state.dayIndex = dayIndex;
  if (who !== undefined) state.current = who;
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function displayName(i) {
  return state.people[i].name || `Person ${i + 1}`;
}

function possessive(name) {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

function hasAnyEntries() {
  return state.people.some((p) => p.name || p.days.some((d) => d.length));
}

function startOver() {
  if (!confirm('Clear everything that has been entered and start over?')) return;
  state = defaultState();
  save();
  render();
}

// Welcome screen: explanation and name.
function renderWelcome() {
  state.current = 0;
  const p = person();
  const nameInput = el('input', {
    type: 'text',
    id: 'name-input',
    maxlength: '30',
    placeholder: 'e.g. Alex',
    autocomplete: 'off',
    value: p.name,
    oninput: (e) => { p.name = e.target.value; save(); },
  });

  const begin = (e) => {
    e.preventDefault();
    p.name = nameInput.value.trim();
    // If both weeks are already filled in, jump straight back to the results.
    if (state.people.every((x) => x.done)) go('results');
    else go('day', 0, 0);
  };

  return el('section', { class: 'card' },
    el('h2', {}, "Let's plan the holidays together!"),
    el('p', {}, "You'll answer one quick question for each day of the coming week, Monday to Sunday: when are you busy?"),
    el('p', { class: 'hint' }, "Any time you don't list counts as free time. Everything is saved in this browser as you go."),
    el('form', { class: 'name-form', onsubmit: begin },
      el('label', { for: 'name-input' }, 'Your name'),
      nameInput,
      el('div', { class: 'nav' },
        hasAnyEntries()
          ? el('button', { type: 'button', class: 'btn btn-secondary', onclick: startOver }, 'Start over')
          : el('span'),
        el('button', { type: 'submit', class: 'btn btn-primary' },
          hasAnyEntries() ? 'Continue →' : 'Start my week →'),
      ),
    ),
  );
}

// Row of seven ornaments showing progress; click one to jump to that day.
function renderProgress(activeDay) {
  const p = person();
  return el('nav', { class: 'ornaments', 'aria-label': 'Days of the week' },
    DAYS.map((day, i) => {
      const classes = ['ornament'];
      if (i === activeDay) classes.push('current');
      else if (p.days[i].length) classes.push('filled');
      return el('button', {
        type: 'button',
        class: classes.join(' '),
        title: day,
        'aria-label': day,
        'aria-current': i === activeDay ? 'step' : null,
        onclick: () => tryGoToDay(i),
      }, day.slice(0, 2));
    }),
  );
}

function tryGoToDay(i) {
  if (state.screen === 'day' && !dayIsValid(state.dayIndex)) {
    showNavMessage('Fix the highlighted time first.');
    return;
  }
  go('day', i);
}

// Overnight blocks from the previous day that spill into this one.
function carriedIn(dayIndex) {
  if (dayIndex === 0) return [];
  const prev = dayIndex - 1;
  return person().days[prev]
    .filter((b) => b.overnight && b.end < b.start)
    .map((b) => `${b.label || 'Busy'} from ${DAYS[prev]} night, until ${formatTime(b.end)}`);
}

function renderDay() {
  const p = person();
  const d = state.dayIndex;
  const blocks = p.days[d];

  const carry = carriedIn(d);

  const list = el('div', { class: 'blocks' });
  if (blocks.length === 0) {
    list.append(el('p', { class: 'empty' }, carry.length
      ? `Nothing else yet, so you're free the rest of ${DAYS[d]}.`
      : `Nothing yet, so you're free all day ${DAYS[d]}.`));
  }
  blocks.forEach((b) => list.append(renderBlock(b, d)));

  return el('section', { class: 'card' },
    renderProgress(d),
    el('p', { class: 'eyebrow' },
      el('span', { class: `person-tag p${state.current + 1}` }, displayName(state.current)),
      ` Day ${d + 1} of 7`),
    el('h2', {}, `What are you doing this coming ${DAYS[d]}?`),
    el('p', { class: 'hint' }, "Add the times you're busy. Anything you leave out counts as free time."),
    carry.length
      ? el('div', { class: 'carry' }, el('strong', {}, 'Already busy: '), carry.join('; '))
      : null,
    list,
    el('button', { type: 'button', class: 'btn btn-add', onclick: addBlock }, '+ Add a busy time'),
    el('p', { class: 'nav-msg', id: 'nav-msg', role: 'status' }),
    el('div', { class: 'nav' },
      el('button', {
        type: 'button',
        class: 'btn btn-secondary',
        onclick: () => {
          if (d > 0) tryGoToDay(d - 1);
          else go(state.current === 0 ? 'welcome' : 'handoff');
        },
      }, d === 0 ? '← Back' : `← ${DAYS[d - 1]}`),
      el('button', {
        type: 'button',
        class: 'btn btn-primary',
        id: 'next-btn',
        onclick: goNext,
      }, d === 6 ? 'Review my week →' : `Next: ${DAYS[d + 1]} →`),
    ),
  );
}

function addBlock() {
  const blocks = person().days[state.dayIndex];
  const last = blocks[blocks.length - 1];
  // Start where the last block ended, or 9:00 AM.
  let start = last && !last.overnight && last.end < DAY_MINUTES ? last.end : 9 * 60;
  const end = Math.min(start + 60, DAY_MINUTES);
  blocks.push({ id: newId(), label: '', start, end, overnight: false });
  save();
  render();
  // Put the cursor in the new block's name box.
  const inputs = app.querySelectorAll('.block-label');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeBlock(id) {
  const blocks = person().days[state.dayIndex];
  const i = blocks.findIndex((b) => b.id === id);
  if (i >= 0) blocks.splice(i, 1);
  save();
  render();
}

function goNext() {
  if (!dayIsValid(state.dayIndex)) {
    showNavMessage('Fix the highlighted time first.');
    return;
  }
  if (state.dayIndex < 6) {
    go('day', state.dayIndex + 1);
  } else {
    person().done = true;
    go('review');
  }
}

function showNavMessage(text) {
  const msg = document.getElementById('nav-msg');
  if (msg) msg.textContent = text;
}

function updateNav() {
  const valid = dayIsValid(state.dayIndex);
  const next = document.getElementById('next-btn');
  if (next) next.disabled = !valid;
  showNavMessage(valid ? '' : 'Fix the highlighted time before moving on.');
}

function timeSelect(options, selected, labelFn, ariaLabel, onChange) {
  return el('select', {
    class: 'time-select',
    'aria-label': ariaLabel,
    value: String(selected),
    onchange: (e) => onChange(Number(e.target.value)),
  }, options.map((m) => el('option', { value: String(m) }, labelFn(m))));
}

// One busy block: name, start, end, remove, plus a status line for overnight/errors.
function renderBlock(block, dayIndex) {
  const row = el('div', { class: 'block' });
  const status = el('div', { class: 'block-status', 'aria-live': 'polite' });

  const label = el('input', {
    type: 'text',
    class: 'block-label',
    maxlength: '40',
    placeholder: 'What is it? (optional)',
    'aria-label': 'What is it? (optional)',
    value: block.label,
    oninput: (e) => { block.label = e.target.value; save(); },
  });

  const onTimeChange = () => {
    if (block.end > block.start) block.overnight = false;
    save();
    refresh();
  };

  const startSel = timeSelect(START_OPTIONS, block.start, formatTime, 'Start time',
    (v) => { block.start = v; onTimeChange(); });
  const endSel = timeSelect(END_OPTIONS, block.end, endLabel, 'End time',
    (v) => { block.end = v; onTimeChange(); });

  function refresh() {
    const st = blockStatus(block, dayIndex);
    row.classList.toggle('invalid', !st.valid);
    row.classList.toggle('overnight', st.valid && block.overnight);
    status.replaceChildren();
    if (st.kind === 'error') {
      status.append(el('span', {}, st.msg));
    } else if (st.kind === 'ask') {
      status.append(
        el('span', {}, st.msg),
        el('span', { class: 'status-actions' },
          el('button', {
            type: 'button',
            class: 'btn btn-small btn-primary',
            onclick: () => { block.overnight = true; save(); refresh(); },
          }, `Yes, ends ${nextDayName(dayIndex)}`),
          el('button', {
            type: 'button',
            class: 'btn btn-small btn-secondary',
            onclick: () => endSel.focus(),
          }, 'No, fix the time'),
        ),
      );
    } else if (st.kind === 'note') {
      status.append(
        el('span', {}, '🌙 ' + st.msg + ' '),
        el('button', {
          type: 'button',
          class: 'link-btn',
          onclick: () => { block.overnight = false; save(); refresh(); },
        }, 'Not overnight'),
      );
    }
    status.hidden = st.kind === 'ok';
    updateNav();
  }

  row.append(
    label,
    el('div', { class: 'block-times' }, startSel, el('span', { class: 'to' }, 'to'), endSel),
    el('button', {
      type: 'button',
      class: 'remove-btn',
      title: 'Remove this busy time',
      'aria-label': 'Remove this busy time',
      onclick: () => removeBlock(block.id),
    }, '✕'),
    status,
  );
  refresh();
  return row;
}

// Summary of the whole week once all 7 days are answered.
function renderReview() {
  const p = person();
  const title = `${possessive(displayName(state.current))} week`;

  const days = el('ul', { class: 'week-list' },
    DAYS.map((day, i) => {
      const blocks = [...p.days[i]].sort((a, b) => a.start - b.start);
      // Overnight blocks from the night before take up the start of this day.
      const carried = i === 0 ? [] : p.days[i - 1].filter((b) => b.overnight && b.end < b.start);
      const rows = [
        ...carried.map((b) => el('li', {},
          el('span', { class: 'busy-time' }, `12:00 AM – ${formatTime(b.end)}`),
          el('span', { class: 'busy-label' }, `${b.label || 'Busy'} (from ${DAYS[i - 1]} night)`),
        )),
        ...blocks.map((b) => el('li', {},
          el('span', { class: 'busy-time' },
            `${formatTime(b.start)} – ${endLabel(b.end)}${b.overnight ? ` (${nextDayName(i)})` : ''}`),
          b.label ? el('span', { class: 'busy-label' }, b.label) : null,
        )),
      ];
      const items = rows.length
        ? el('ul', { class: 'busy-list' }, rows)
        : el('p', { class: 'free-all-day' }, '✦ Free all day');
      return el('li', { class: 'week-day' },
        el('div', { class: 'week-day-head' },
          el('h3', {}, day),
          el('button', { type: 'button', class: 'link-btn', onclick: () => go('day', i) }, 'Edit'),
        ),
        items,
      );
    }),
  );

  // What comes next: hand the device over, or see the comparison.
  const bothDone = state.people.every((x) => x.done);
  const nextButton = state.current === 0 && !bothDone
    ? el('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('handoff') },
        'Pass to a friend →')
    : el('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('results') },
        'See shared free time →');

  return el('section', { class: 'card' },
    el('p', { class: 'eyebrow' },
      el('span', { class: `person-tag p${state.current + 1}` }, displayName(state.current)),
      ' All 7 days done'),
    el('h2', {}, title),
    el('p', { class: 'hint' }, "Here's everything you entered. Any time not listed counts as free."),
    days,
    el('div', { class: 'nav' },
      el('div', { class: 'nav-group' },
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => go('day', 6) }, '← Sunday'),
        el('button', { type: 'button', class: 'link-btn', onclick: startOver }, 'Start over'),
      ),
      nextButton,
    ),
  );
}

// Between the two people: pass the device and get the second name.
function renderHandoff() {
  const friend = state.people[1];
  const nameInput = el('input', {
    type: 'text',
    id: 'name-input',
    maxlength: '30',
    placeholder: 'e.g. Jordan',
    autocomplete: 'off',
    value: friend.name,
    oninput: (e) => { friend.name = e.target.value; save(); },
  });

  const begin = (e) => {
    e.preventDefault();
    friend.name = nameInput.value.trim();
    go('day', 0, 1);
  };

  return el('section', { class: 'card handoff' },
    el('div', { class: 'gift', 'aria-hidden': 'true' }, '🎁'),
    el('h2', {}, 'Pass the device to your friend!'),
    el('p', {}, `${possessive(displayName(0))} week is saved. Now it's your friend's turn to answer the same 7 questions.`),
    el('form', { class: 'name-form', onsubmit: begin },
      el('label', { for: 'name-input' }, "Friend's name"),
      nameInput,
      el('div', { class: 'nav' },
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => go('review', 6, 0) },
          `← ${possessive(displayName(0))} week`),
        el('button', { type: 'submit', class: 'btn btn-primary' },
          friend.done ? 'Continue →' : 'Start my week →'),
      ),
    ),
  );
}

// ---------- Comparing the two schedules ----------
// Times here are minutes from the start of Monday (0) to the end of Sunday (10080).

// Every busy block for one person, placed on the week timeline.
// Overnight blocks run into the next day; anything past Sunday midnight is cut off.
function busySegments(p) {
  const segs = [];
  p.days.forEach((blocks, d) => {
    for (const b of blocks) {
      if (b.start === b.end) continue;
      if (b.end < b.start && !b.overnight) continue; // unconfirmed, not counted
      const start = d * DAY_MINUTES + b.start;
      const end = b.end > b.start
        ? d * DAY_MINUTES + b.end
        : (d + 1) * DAY_MINUTES + b.end;
      const clipped = Math.min(end, WEEK_MINUTES);
      if (clipped > start) segs.push({ start, end: clipped, label: b.label });
    }
  });
  return segs;
}

// Sort and join overlapping or touching intervals.
function mergeIntervals(list) {
  const sorted = list.map((s) => [s.start, s.end]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// Windows where neither person is busy, at least `minLength` minutes long.
function sharedFreeWindows(minLength) {
  const busy = mergeIntervals(state.people.flatMap(busySegments));
  const free = [];
  let cursor = 0;
  for (const [s, e] of busy) {
    if (s > cursor) free.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < WEEK_MINUTES) free.push({ start: cursor, end: WEEK_MINUTES });
  return free.filter((w) => w.end - w.start >= minLength);
}

// Cut a week-timeline interval into per-day pieces for drawing on the grid.
function splitByDay(seg) {
  const pieces = [];
  let s = seg.start;
  while (s < seg.end) {
    const day = Math.floor(s / DAY_MINUTES);
    const dayEnd = (day + 1) * DAY_MINUTES;
    const e = Math.min(seg.end, dayEnd);
    pieces.push({ ...seg, day, from: s - day * DAY_MINUTES, to: e - day * DAY_MINUTES });
    s = e;
  }
  return pieces;
}

function formatDuration(min) {
  const days = Math.floor(min / DAY_MINUTES);
  const hours = Math.floor((min % DAY_MINUTES) / 60);
  const mins = min % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours) parts.push(`${hours} hr`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(' ');
}

function minLengthLabel(min) {
  return min < 60 ? `${min} minutes` : `${min / 60} hour${min === 60 ? '' : 's'}`;
}

// "9:00 AM – 5:00 PM", or "11:00 PM – Tue 1:00 AM" when it runs into a later day.
function formatWindow(w) {
  const startDay = Math.floor(w.start / DAY_MINUTES);
  const startText = formatTime(w.start);
  const onBoundary = w.end % DAY_MINUTES === 0;
  const endDay = onBoundary ? w.end / DAY_MINUTES - 1 : Math.floor(w.end / DAY_MINUTES);
  let endText = onBoundary ? 'midnight' : formatTime(w.end);
  if (endDay !== startDay) endText = onBoundary ? `end of ${DAYS[endDay]}` : `${DAYS_SHORT[endDay]} ${endText}`;
  if (w.start % DAY_MINUTES === 0 && onBoundary && endDay === startDay) return 'All day';
  return `${startText} – ${endText}`;
}

// ---------- Results screen ----------

const PX_PER_HOUR = 26;

function renderResults() {
  const windows = sharedFreeWindows(state.minLength);
  const totalFree = windows.reduce((sum, w) => sum + (w.end - w.start), 0);
  const names = [displayName(0), displayName(1)];

  const minSelect = el('select', {
    id: 'min-length',
    value: String(state.minLength),
    onchange: (e) => {
      state.minLength = Number(e.target.value);
      save();
      render();
      document.getElementById('min-length')?.focus();
    },
  }, MIN_LENGTH_OPTIONS.map((m) => el('option', { value: String(m) }, minLengthLabel(m))));

  const summary = windows.length
    ? `${windows.length} shared free window${windows.length > 1 ? 's' : ''}, ${formatDuration(totalFree)} in total.`
    : 'No shared free time that long this week. Try a shorter minimum.';

  return el('section', { class: 'card' },
    el('p', { class: 'eyebrow' }, 'The coming week'),
    el('h2', {}, `When ${names[0]} and ${names[1]} are both free`),
    el('div', { class: 'results-controls' },
      el('label', { for: 'min-length' }, 'Only show windows of at least'),
      minSelect,
    ),
    el('p', { class: 'results-summary', role: 'status' }, summary),
    renderLegend(names),
    renderGrid(windows),
    el('h3', { class: 'section-title' }, 'Shared free times'),
    renderWindowList(windows),
    el('div', { class: 'nav' },
      el('div', { class: 'nav-group' },
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => go('review', 6, 0) },
          `Edit ${possessive(names[0])} week`),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => go('review', 6, 1) },
          `Edit ${possessive(names[1])} week`),
      ),
      el('button', { type: 'button', class: 'link-btn', onclick: startOver }, 'Start over'),
    ),
  );
}

function renderLegend(names) {
  return el('div', { class: 'legend' },
    el('span', { class: 'legend-item' }, el('span', { class: 'swatch free' }), 'Both free'),
    el('span', { class: 'legend-item' }, el('span', { class: 'swatch p1' }), `${names[0]} busy`),
    el('span', { class: 'legend-item' }, el('span', { class: 'swatch p2' }), `${names[1]} busy`),
  );
}

// Week grid: one column per day, a lane for each person's busy times,
// and shared free windows shaded behind them.
function renderGrid(windows) {
  const height = 24 * PX_PER_HOUR;

  const head = el('div', { class: 'grid-head' },
    el('div'),
    DAYS_SHORT.map((d) => el('div', { class: 'grid-day-name' }, d)),
  );

  const axis = el('div', { class: 'grid-axis', style: `height:${height}px` });
  for (let h = 0; h < 24; h += 3) {
    axis.append(el('span', { style: `top:${h * PX_PER_HOUR}px` },
      formatTime(h * 60).replace(':00', '')));
  }

  const columns = DAYS.map((day) => el('div', {
    class: 'grid-day',
    style: `height:${height}px; background-size:100% ${PX_PER_HOUR}px`,
    'aria-label': day,
  }));

  const place = (piece) => {
    const top = (piece.from / 60) * PX_PER_HOUR;
    const h = ((piece.to - piece.from) / 60) * PX_PER_HOUR;
    return `top:${top}px; height:${h}px`;
  };

  for (const w of windows) {
    for (const piece of splitByDay(w)) {
      columns[piece.day].append(el('div', {
        class: 'grid-free',
        style: place(piece),
        title: `Both free: ${formatWindow(w)}`,
      }));
    }
  }

  state.people.forEach((p, i) => {
    const name = displayName(i);
    for (const seg of busySegments(p)) {
      for (const piece of splitByDay(seg)) {
        const tall = piece.to - piece.from >= 60;
        columns[piece.day].append(el('div', {
          class: `grid-busy p${i + 1}`,
          style: place(piece),
          title: `${name}: ${seg.label || 'Busy'}, ${formatTime(piece.from)} – ${endLabel(piece.to)}`,
        }, tall && seg.label ? el('span', {}, seg.label) : null));
      }
    }
  });

  return el('div', { class: 'grid-scroll' },
    el('div', { class: 'week-grid' },
      head,
      el('div', { class: 'grid-body' }, axis, columns),
    ),
  );
}

// Shared free windows as a list, grouped by the day each one starts.
function renderWindowList(windows) {
  if (!windows.length) {
    return el('p', { class: 'empty' }, 'Nothing long enough yet. Try lowering the minimum above.');
  }
  return el('ul', { class: 'week-list' },
    DAYS.map((day, d) => {
      const today = windows.filter((w) => Math.floor(w.start / DAY_MINUTES) === d);
      if (!today.length) return null;
      return el('li', { class: 'week-day free-day' },
        el('h3', {}, day),
        el('ul', { class: 'busy-list' }, today.map((w) => el('li', {},
          el('span', { class: 'busy-time' }, formatWindow(w)),
          el('span', { class: 'busy-label' }, formatDuration(w.end - w.start)),
        ))),
      );
    }),
  );
}

render();
