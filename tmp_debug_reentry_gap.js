const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const remote = JSON.parse(fs.readFileSync('/tmp/nurseScheduler.json', 'utf8'));
const mainScript = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('function defaultData'));

const storage = { 'nurse-shift-scheduler-v4-html': JSON.stringify(remote) };
const sandbox = {
  console,
  alert: (msg) => { throw new Error(`alert: ${msg}`); },
  confirm: () => true,
  prompt: () => '',
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  Date,
  Math,
  JSON,
  localStorage: {
    getItem: (k) => Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  },
  document: {
    getElementById: () => ({ className:'', classList:{add(){},remove(){}}, innerHTML:'', textContent:'', value:'', checked:false, disabled:false, style:{}, querySelector:()=>null }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  addEventListener: () => {},
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
vm.runInContext(mainScript, context);
function run(code){ return vm.runInContext(code, context); }

run(`
  data = ${JSON.stringify(remote)};
  ensureDataDefaults();
  ensureShiftCodeWorkTypeConsistency();
  ensureWorkTypeCodesAndRules();
  renderWardSchedule = function(){};
  renderApp = function(){};
  stepPushDraft = function(){};
  popup = function(){};
  closeModal = function(){};
  saveData = function(){};
`);

const result = run(`
(function(){
  const ward = data.wards.find(w => w.name === 'test3');
  currentUser = { role:'ward', wardId:ward.id, loginId:'debug' };
  uiYear = 2026;
  uiMonth = 5;
  stepGenerationState = null;
  scheduleDraftState = {};
  stepRunWantedOff();
  stepRunNightKeep();
  const n = ward.nurses.find(x => x.name === '김대영');
  const before = {
    gap: stepNightReentryGapDays(n),
    lastBefore19: stepLastNightBeforeDay(n,19),
    violatesBefore19: stepViolatesNightReentryGap(n,19),
    canBefore19: stepCanPlace(n,'N',19,{replace:true})
  };
  stepRunGeneralNight();
  const after = {
    gap: stepNightReentryGapDays(n),
    codes: Array.from({length:31},(_,i)=>String(stepGenerationState.schedule[makeDateKey(2026,5,i+1)]?.[n.id]||'')),
    lastBefore19: stepLastNightBeforeDay(n,19),
    violates19: stepViolatesNightReentryGap(n,19),
    issues: collectNightLimitIssues(stepGenerationState.schedule, ward, 2026, 5).filter(x=>x.includes('김대영')),
    logs: (stepGenerationState.logs||[]).map(x=>String(x.msg||x||'')).filter(x=>x.includes('김대영'))
  };
  return {before, after};
})();
`);

console.log(JSON.stringify(result, null, 2));
