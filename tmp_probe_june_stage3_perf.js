const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const remote = JSON.parse(fs.readFileSync('/tmp/nurseScheduler.json', 'utf8'));
const mainScript = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('function defaultData'));

function makeContext(overrides=''){
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
  vm.runInContext(`
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
    ${overrides}
  `, context);
  return context;
}

function runCase(name, overrides=''){
  const context = makeContext(overrides);
  const start = Date.now();
  const result = vm.runInContext(`
  (function(){
    const ward = data.wards.find(w => w.name === 'test3');
    currentUser = { role:'ward', wardId:ward.id, loginId:'perf' };
    uiYear = 2026;
    uiMonth = 6;
    stepGenerationState = null;
    scheduleDraftState = {};
    resultCache = null;
    normalizeWardStructure(ward);
    const marks=[];
    const mark=(label)=>marks.push(label+': '+(Date.now()-${start})+'ms');
    stepRunWantedOff(); mark('1');
    stepRunNightKeep(); mark('2');
    stepRunGeneralNight(); mark('3');
    return {done:Object.assign({},stepGenerationState.done||{}), logs:(stepGenerationState.logs||[]).slice(-8), marks};
  })();
  `, context, { timeout: 15000 });
  console.log(name, Date.now()-start+'ms', JSON.stringify(result, null, 2));
}

const cases = [
  ['no balance', `stepBalanceGeneralNightPersonalCounts=function(){ return {moves:0, summary:''}; };`],
  ['no mandatory fills', `
    stepMandatoryFillNightShortagesWithSafePair=function(){ return {fixed:0}; };
    stepExtendPreviousNightForMinimumStaffing=function(){ return {fixed:0}; };
    stepRepairNightShortageBySeniorSwap=function(){ return {fixed:0, swaps:0, forced:0}; };
    stepFillRemainingNightShortagesMinimumFirst=function(){ return {fixed:0, unresolved:[]}; };
  `],
  ['no reentry repair', `stepRepairNightReentryGapBySameDaySwap=function(){ return {moves:0, remaining:[]}; };`],
  ['no late rebuild', `stepRebuildLateMonthNightBlocks=function(){ return {changed:false, remainingSingles:0}; };`],
  ['no pair singles', `stepPairSeparatedSingleNightBlocks=function(){ return {moves:0}; };`],
  ['no quality', `stepImproveNightBlockQuality=function(){ return {moves:0, singles:0}; };`],
  ['minimal post repairs', `
    stepBalanceGeneralNightPersonalCounts=function(){ return {moves:0, summary:''}; };
    stepImproveNightBlockQuality=function(){ return {moves:0, singles:0}; };
    stepPairSeparatedSingleNightBlocks=function(){ return {moves:0}; };
    stepMandatoryFillNightShortagesWithSafePair=function(){ return {fixed:0}; };
    stepExtendPreviousNightForMinimumStaffing=function(){ return {fixed:0}; };
    stepRepairNightShortageBySeniorSwap=function(){ return {fixed:0, swaps:0, forced:0}; };
    stepFillRemainingNightShortagesMinimumFirst=function(){ return {fixed:0, unresolved:[]}; };
    stepRepairNightReentryGapBySameDaySwap=function(){ return {moves:0, remaining:[]}; };
    stepRebuildLateMonthNightBlocks=function(){ return {changed:false, remainingSingles:0}; };
  `]
];

for (const [name, overrides] of cases) {
  try {
    runCase(name, overrides);
  } catch (err) {
    console.log(name, 'ERROR/TIMEOUT', err.message);
  }
}
