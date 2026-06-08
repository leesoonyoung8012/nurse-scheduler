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
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  },
  document: {
    getElementById: () => ({ className:'', classList:{add(){}, remove(){}}, innerHTML:'', textContent:'', value:'', checked:false, disabled:false, style:{}, querySelector:()=>null }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  addEventListener: () => {},
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(mainScript, sandbox);
function run(code){ return vm.runInContext(code, sandbox); }

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
  const ward = data.wards.find(w=>w.name==='test3');
  currentUser = { role:'ward', wardId:ward.id };
  uiYear = 2026;
  uiMonth = 5;
  stepGenerationState = null;
  scheduleDraftState = {};
  resultCache = null;
  normalizeWardStructure(ward);
  stepRunAll();
`);

const result = run(`
(function(){
  const ward=getCurrentWard(), st=stepEnsureState();
  const nurses=(ward.nurses||[]).filter(n=>n.employmentStatus!=='leave'&&n.employmentStatus!=='inactive');
  const y=st.y, m=st.m, last=daysInMonth(y,m);
  function code(n,d){ return String(st.schedule[makeDateKey(y,m,d)]?.[n.id]||'').toUpperCase(); }
  function blocks(n){
    const arr=[]; let s=0;
    for(let d=1; d<=last+1; d++){
      const is=d<=last && code(n,d)==='N';
      if(is && !s) s=d;
      if((!is || d>last) && s){ arr.push({start:s,end:d-1,len:d-s}); s=0; }
    }
    return arr;
  }
  return nurses.map(n=>({
    name:n.name,
    N:scheduleShiftCountForNurse(st.schedule,n,y,m,'N'),
    maxN: stepIsNightKeep(n) ? nightKeepMonthlyTargetByDays(last) : getNurseNumberSetting(n,'maxNightPerMonth',data.commonScheduleSettings?.defaultMaxNightPerMonth??6),
    blocks:blocks(n)
  }));
})();
`);

for (const r of result) {
  console.log(`${r.name}: N ${r.N}/${r.maxN} ` + r.blocks.map(b=>`${b.start}-${b.end}(${b.len})`).join(', '));
}
