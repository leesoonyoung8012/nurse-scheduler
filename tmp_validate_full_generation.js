const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const remote = JSON.parse(fs.readFileSync('/tmp/nurseScheduler.json', 'utf8'));
const mainScript = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('function defaultData'));

const storage = {
  'nurse-shift-scheduler-v4-html': JSON.stringify(remote)
};
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

function run(code) {
  return vm.runInContext(code, context);
}

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

const targets = (remote.wards || [])
  .filter(w => ['test3','61병동','41병동','43병동','icu'].includes(w.name))
  .filter(w => (w.nurses || []).filter(n => n.employmentStatus !== 'leave' && n.employmentStatus !== 'inactive').length > 0);

const results = [];

for (const ward of targets) {
  const escapedWardId = JSON.stringify(ward.id);
  try {
    const res = run(`
    (function(){
      currentUser = { role:'ward', wardId:${escapedWardId}, loginId:'validation' };
      uiYear = 2026;
      uiMonth = 5;
      stepGenerationState = null;
      scheduleDraftState = {};
      resultCache = null;
      const ward = getCurrentWard();
      normalizeWardStructure(ward);
      stepRunAll();
      const draftKey = getScheduleDraftKey(ward.id, uiYear, uiMonth);
      scheduleDraftState[draftKey] = { schedule: stepGenerationState.schedule, edit:false };
      const summaryHtml = renderGenerateSummary();
      const hardIssues = [];
      const active = (ward.nurses||[]).filter(n=>n.employmentStatus!=='leave' && n.employmentStatus!=='inactive');
      const schedule = stepGenerationState.schedule;
      const last = daysInMonth(uiYear,uiMonth);
      for(let d=1; d<=last; d++){
        const key=makeDateKey(uiYear,uiMonth,d);
        for(const shift of ['D','E','N']){
          const got=stepCount(schedule,uiYear,uiMonth,d,shift,active);
          const min=getStaffingMinForDate(ward,uiYear,uiMonth,d,shift);
          const max=getStaffingMaxForDate(ward,uiYear,uiMonth,d,shift);
          if(got<min) hardIssues.push(key+' '+shift+' 인원부족 '+got+'/'+min);
          if(max!==Infinity && got>max) hardIssues.push(key+' '+shift+' 최대초과 '+got+'/'+max);
        }
        for(const n of active){
          const code=String(schedule[key]?.[n.id]||'').toUpperCase();
          if(isHardPlacementWorkCode(code) && !hardPlacementAllowedForNurse(n,code,uiYear,uiMonth,d)){
            hardIssues.push(key+' '+hardPlacementViolationText(n,code,uiYear,uiMonth,d));
          }
        }
      }
      hardIssues.push(...collectSkillMixIssues(schedule, active, uiYear, uiMonth, ward));
      hardIssues.push(...collectMonthlyOffBalanceIssues(schedule, ward, uiYear, uiMonth));
      return ({
        wardId: ward.id,
        wardName: ward.name,
        nurseCount: active.length,
        done: Object.assign({}, stepGenerationState.done || {}),
        logs: (stepGenerationState.logs||[]).slice(-8),
        issueCount: [...new Set(hardIssues)].length,
        issues: [...new Set(hardIssues)].slice(0,30),
        summaryOk: summaryHtml.includes('점검 완료')
      });
    })();
    `);
    results.push({ ok: res.issueCount === 0, ...res });
  } catch (e) {
    results.push({ ok:false, wardId: ward.id, wardName: ward.name, error: e && e.stack ? e.stack : String(e) });
  }
}

for (const r of results) {
  if (r.ok) {
    console.log(`PASS ${r.wardName} 1~8단계 실행 및 최종 점검 통과 (${r.nurseCount}명)`);
  } else {
    console.log(`FAIL ${r.wardName} ${r.error ? r.error.split('\\n')[0] : `${r.issueCount}개 이슈`}`);
    if (r.issues) r.issues.forEach(x => console.log(`  - ${x}`));
    if (r.logs) r.logs.forEach(x => console.log(`  log: ${x}`));
    process.exitCode = 1;
  }
}
console.log(`TOTAL ${results.filter(r=>r.ok).length}/${results.length}`);
