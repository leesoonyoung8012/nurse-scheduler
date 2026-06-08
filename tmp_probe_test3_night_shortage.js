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
  stepRunWantedOff();
  stepRunNightKeep();
  stepRunGeneralNight();
`);

const result = run(`
(function(){
  const ward=getCurrentWard(), st=stepEnsureState();
  const nurses=(ward.nurses||[]).filter(n=>n.employmentStatus!=='leave'&&n.employmentStatus!=='inactive');
  const y=st.y, m=st.m, d=29, last=daysInMonth(y,m);
  function code(n,dd){ return String(st.schedule[makeDateKey(y,m,dd)]?.[n.id]||'').toUpperCase(); }
  function nCount(n){ return scheduleShiftCountForNurse(st.schedule,n,y,m,'N'); }
  function maxN(n){ return stepIsNightKeep(n) ? nightKeepMonthlyTargetByDays(last) : getNurseNumberSetting(n,'maxNightPerMonth',data.commonScheduleSettings?.defaultMaxNightPerMonth??6); }
  function blockers(n){
    const b=[];
    if(!stepIsCountedStaff(n)) b.push('신규/미집계');
    if(stepIsNightKeep(n)) b.push('나이트킵');
    if(!stepAllowed(n,'N')) b.push('N 불가');
    if(stepIsRestricted(n,getDateType(y,m,d))) b.push('요일제한');
    if(!isPersonalShiftAllowedForDateType(n,'N',getDateType(y,m,d))) b.push('개인요일제한');
    if(['AL','SL','WO','HA','HP'].includes(code(n,d))) b.push('보호OFF');
    if(['D','E','MD','SD6','N'].includes(code(n,d))) b.push('기존근무 '+code(n,d));
    if(nCount(n)>=maxN(n)) b.push('월N상한 '+nCount(n)+'/'+maxN(n));
    if(stepNightStreakIfAssign(n,d)>getNurseNumberSetting(n,'maxConsecutiveNight',data.commonScheduleSettings?.defaultMaxConsecutiveNight??3)) b.push('연속N상한');
    if(stepViolatesPreviousMonthNightReentryGap(n,d)) b.push('전월N텀');
    if(stepViolatesNightReentryGap(n,d)) b.push('N재진입텀');
    if(!stepNightCombinationSafeIfAssign(n,d,{replace:true,overrideLock:true,overrideNightGap:false,overrideNextWanted:true})) b.push('N안전조합');
    return b;
  }
  return {
    day:d,
    assigned:nurses.filter(n=>code(n,d)==='N').map(n=>n.name),
    need:getStaffingMinForDate(ward,y,m,d,'N'),
    rows:nurses.map(n=>({
      name:n.name,
      cur:code(n,d),
      prev:code(n,d-1),
      next:d<last?code(n,d+1):'',
      N:nCount(n),
      maxN:maxN(n),
      senior:isNurseSeniorSupport(n),
      counted:stepIsCountedStaff(n),
      can:stepCanPlace(n,'N',d,{replace:true,overrideLock:true,overrideNightGap:false,overrideNextWanted:true}),
      blockers:blockers(n)
    }))
  };
})();
`);

console.log(JSON.stringify(result, null, 2));
