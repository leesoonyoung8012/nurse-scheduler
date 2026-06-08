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
    getElementById: () => ({ className: '', classList: { add(){}, remove(){} }, innerHTML: '', textContent: '', value: '', checked: false, disabled: false, style: {}, querySelector: () => null }),
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
function run(code) { return vm.runInContext(code, context); }

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

const out = run(`
(function(){
  const ward = data.wards.find(w => w.name === 'test3');
  currentUser = { role:'ward', wardId:ward.id, loginId:'debug' };
  uiYear = 2026; uiMonth = 5;
  stepGenerationState = null; scheduleDraftState = {}; resultCache = null;
  normalizeWardStructure(ward);
  stepRunAll();
  const schedule = stepGenerationState.schedule;
  const nurses = ward.nurses.filter(n=>n.employmentStatus!=='leave'&&n.employmentStatus!=='inactive');
  const last = daysInMonth(uiYear,uiMonth);
  function key(d){return makeDateKey(uiYear,uiMonth,d)}
  function code(n,d){return String(schedule[key(d)]?.[n.id]||'').toUpperCase()}
  function row(n){
    return {
      name:n.name,
      workType:n.workType,
      allowed:getAllowedCodes(n),
      level:n.skillLevel,
      tags:n.skillTags,
      off:scheduleOffCountForNurse(schedule,n,uiYear,uiMonth),
      target:getMonthlyTargetOffForNurse(ward,n,uiYear,uiMonth),
      D:scheduleShiftCountForNurse(schedule,n,uiYear,uiMonth,'D'),
      E:scheduleShiftCountForNurse(schedule,n,uiYear,uiMonth,'E'),
      N:scheduleShiftCountForNurse(schedule,n,uiYear,uiMonth,'N'),
      days:Array.from({length:last},(_,i)=>code(n,i+1))
    };
  }
  const issues = [];
  for(let d=1; d<=last; d++){
    for(const sh of ['D','E','N']){
      const got=stepCount(schedule,uiYear,uiMonth,d,sh,nurses);
      const min=getStaffingMinForDate(ward,uiYear,uiMonth,d,sh);
      const max=getStaffingMaxForDate(ward,uiYear,uiMonth,d,sh);
      if(got<min || (max!==Infinity && got>max)) {
        issues.push({day:d, shift:sh, got, min, max, assigned:nurses.filter(n=>code(n,d)===sh).map(n=>n.name)});
      }
    }
  }
  const day28 = nurses.map(n=>({name:n.name, code:code(n,28), allowed:getAllowedCodes(n), off:scheduleOffCountForNurse(schedule,n,uiYear,uiMonth), target:getMonthlyTargetOffForNurse(ward,n,uiYear,uiMonth)}));
  const day28Probe = nurses.map(n=>({
    name:n.name,
    code:code(n,28),
    canE: stepCanPlace(n,'E',28,{replace:true,overrideWanted:true,overrideLock:false,overrideStaffingMax:true,overrideMinOff:true}),
    canD: stepCanPlace(n,'D',28,{replace:true,overrideWanted:true,overrideLock:false,overrideStaffingMax:true,overrideMinOff:true}),
    locked: stepLocked(uiYear,uiMonth,28,n.id),
    lockReason: stepLockReason(uiYear,uiMonth,28,n.id),
    personalE: isPersonalShiftAllowedForDateType(n,'E',getDateType(uiYear,uiMonth,28)),
    personalD: isPersonalShiftAllowedForDateType(n,'D',getDateType(uiYear,uiMonth,28))
  }));
  const underNames = ['이윤민','김효정','이경미'];
  const overNames = ['김대영','최평재'];
  const swapProbes = [];
  function staffingOkAfter(day, changes){
    const snap = Object.assign({}, schedule[key(day)]||{});
    for(const ch of changes) schedule[key(day)][ch.n.id] = ch.code;
    let ok = true;
    for(const sh of ['D','E','N']){
      const got = stepCount(schedule,uiYear,uiMonth,day,sh,nurses);
      const min = getStaffingMinForDate(ward,uiYear,uiMonth,day,sh);
      const max = getStaffingMaxForDate(ward,uiYear,uiMonth,day,sh);
      if(got<min || (max!==Infinity && got>max)) ok=false;
    }
    schedule[key(day)] = snap;
    return ok;
  }
  for(const oname of overNames){
    const o = nurses.find(n=>n.name===oname);
    if(!o) continue;
    for(const uname of underNames){
      const u = nurses.find(n=>n.name===uname);
      if(!u) continue;
      for(let d=1; d<=last; d++){
        const us = code(u,d);
        if(!['D','E','N'].includes(us)) continue;
        if(!isBasicOffCodeForBalance(code(o,d))) continue;
        const can = stepCanPlace(o,us,d,{replace:true,overrideWanted:true,overrideLock:false,overrideStaffingMax:true,overrideMinOff:true,overrideNightGap:true});
        const ok = can && staffingOkAfter(d,[{n:u,code:'OF'},{n:o,code:us}]);
        if(can || ok) swapProbes.push({day:d, over:oname, under:uname, shift:us, overCode:code(o,d), can, ok});
      }
    }
  }
  const strictAfter = applyStrictOffBalance(schedule, ward, uiYear, uiMonth, {skipTraineeMirror:false});
  const minSwapAfter = stepRepairMinimumByPairedSwap(schedule, ward, uiYear, uiMonth);
  const afterMinIssues = [];
  for(let d=1; d<=last; d++){
    for(const sh of ['D','E','N']){
      const got=stepCount(schedule,uiYear,uiMonth,d,sh,nurses);
      const min=getStaffingMinForDate(ward,uiYear,uiMonth,d,sh);
      if(got<min) afterMinIssues.push({day:d, shift:sh, got, min, assigned:nurses.filter(n=>code(n,d)===sh).map(n=>n.name)});
    }
  }
  return {
    logs: stepGenerationState.logs,
    issues,
    strictAfter,
    minSwapAfter,
    afterMinIssues,
    rows:nurses.map(row),
    day28,
    day28Probe,
    swapProbes: swapProbes.slice(0,40),
    skill:collectSkillMixIssues(schedule,nurses,uiYear,uiMonth,ward),
    offIssues:collectMonthlyOffBalanceIssues(schedule,ward,uiYear,uiMonth)
  };
})();
`);

console.log(JSON.stringify(out, null, 2));
