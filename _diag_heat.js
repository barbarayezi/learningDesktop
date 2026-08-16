// Simulate full heatmap render
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Extract script
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.log('NO SCRIPT'); process.exit(1); }
const code = scriptMatch[1];

// We need to mock DOM APIs
const mockElements = {};
const mockDocument = {
  getElementById: (id) => {
    const el = {
      id,
      innerHTML: '',
      textContent: '',
      querySelectorAll: () => ({ forEach: () => {} }),
      classList: { toggle: () => {} },
      dataset: {},
      addEventListener: () => {},
      value: '',
    };
    mockElements[id] = el;
    return el;
  },
  createElement: (tag) => ({
    id: '', textContent: '', className: '',
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild: () => {}
  }),
  body: { appendChild: () => {} }
};

// Mock localStorage
const store = {};
const mockLocalStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = v; }
};

// Execute script in context
try {
  const fn = new Function('document', 'localStorage', 'window', code);
  fn(mockDocument, mockLocalStorage, {});
} catch(e) {
  console.log('SCRIPT ERROR:', e.message);
}

// Check heatGrid output
const hg = mockElements['heatGrid'];
if (!hg) { console.log('heatGrid NOT FOUND'); process.exit(1); }

console.log('heatGrid.innerHTML length:', hg.innerHTML.length);
console.log('heatGrid.innerHTML first 200:', hg.innerHTML.slice(0, 200));
console.log('hl-cell count:', (hg.innerHTML.match(/hl-cell/g) || []).length);
console.log('data-iso count:', (hg.innerHTML.match(/data-iso=/g) || []).length);

const hm = mockElements['heatMonths'];
console.log('heatMonths innerHTML length:', hm ? hm.innerHTML.length : 'NOT FOUND');
