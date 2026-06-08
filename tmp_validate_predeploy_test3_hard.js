const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const remote = JSON.parse(fs.readFileSync('/tmp/nurseScheduler.json', 'utf8'));
const mainScript = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('function defaultData'));

if (!mainScript) throw new Error('main script not found');

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
    getElementById: () => ({
      className: '',
      classList: { add(){}, remove(){} },
      innerHTML: '',
      textContent: '',
      value: '',
      checked: false,
      disabled: false,
      style: {},
      querySelector: () => null
    }),
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

const targetYear = Number(process.argv[2] || 2026);
const targetMonth = Number(process.argv[3] || 5);

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
  if(!ward) throw new Error('test3 ward not found');
  currentUser = { role:'ward', wardId:ward.id, loginId:'predeploy' };
  uiYear = ${targetYear};
  uiMonth = ${targetMonth};
  stepGenerationState = null;
  scheduleDraftState = {};
  resultCache = null;
  normalizeWardStructure(ward);
  stepRunAll();

  const schedule = stepGenerationState.schedule;
  const nurses = (ward.nurses||[]).filter(n=>n.employmentStatus!=='leave' && n.employmentStatus!=='inactive');
  const last = daysInMonth(uiYear,uiMonth);
  const hardIssues = [];
  const rows = nurses.map(n => ({
    name:n.name,
    workType:(Array.isArray(n.workTypeIds)&&n.workTypeIds.length ? n.workTypeIds.join(',') : n.workType || ''),
    maxN: stepIsNightKeep(n) ? nightKeepMonthlyTargetByDays(last) : getNurseNumberSetting(n,'maxNightPerMonth',data.commonScheduleSettings?.defaultMaxNightPerMonth ?? 6),
    maxConsecutiveNight:getNurseNumberSetting(n,'maxConsecutiveNight',data.commonScheduleSettings?.defaultMaxConsecutiveNight ?? 3),
    D:scheduleShiftCountForNurse(schedule,n,uiYear,uiMonth,'D'),
    E:scheduleShiftCountForNurse(schedule,n,uiYear,uiMonth,'E'),
    N:scheduleShiftCountForNurse(schedule,n,uiYear,uiMonth,'N'),
    OFF:scheduleOffCountForNurse(schedule,n,uiYear,uiMonth),
    targetOFF:getMonthlyTargetOffForNurse(ward,n,uiYear,uiMonth)
  }));

  for(let d=1; d<=last; d++){
    const key=makeDateKey(uiYear,uiMonth,d);
    for(const shift of ['D','E','N']){
      const got=stepCount(schedule,uiYear,uiMonth,d,shift,nurses);
      const min=getStaffingMinForDate(ward,uiYear,uiMonth,d,shift);
      const max=getStaffingMaxForDate(ward,uiYear,uiMonth,d,shift);
      if(got<min) hardIssues.push(key+' '+shift+' 인원 부족 '+got+'/'+min);
      if(max!==Infinity && got>max) hardIssues.push(key+' '+shift+' 최대인원 초과 '+got+'/'+max);
    }
    nurses.forEach(n=>{
      const code=String(schedule[key]?.[n.id]||'').toUpperCase();
      if(isHardPlacementWorkCode(code) && !hardPlacementAllowedForNurse(n,code,uiYear,uiMonth,d)){
        hardIssues.push(key+' '+hardPlacementViolationText(n,code,uiYear,uiMonth,d));
      }
      const prev=d>1 ? String(schedule[makeDateKey(uiYear,uiMonth,d-1)]?.[n.id]||'').toUpperCase() : String(getPreviousMonthLastCode(ward,n.id,uiYear,uiMonth)||'').toUpperCase();
      if(violatesWorkTypeTransition(n,prev,code)){
        hardIssues.push(key+' '+n.name+' 법적 전환조건 위반 '+prev+'→'+code);
      }
    });
  }
  hardIssues.push(...collectSkillMixIssues(schedule,nurses,uiYear,uiMonth,ward));
  hardIssues.push(...collectNightLimitIssues(schedule,ward,uiYear,uiMonth));
  hardIssues.push(...collectMonthlyOffBalanceIssues(schedule,ward,uiYear,uiMonth));

  const summaryHtml = renderGenerateSummary();
  return {
    done:Object.assign({}, stepGenerationState.done || {}),
    logs:(stepGenerationState.logs || []).slice(-12),
    rows,
    issues:[...new Set(hardIssues)],
    summaryHtml
  };
})();
`);

const failures = result.issues || [];
const rowsByName = Object.fromEntries((result.rows || []).map(r => [r.name, r]));
const watched = ['이경미','김대영'].map(name => rowsByName[name]).filter(Boolean);

console.log(`test3 ${targetYear}-${String(targetMonth).padStart(2,'0')} 1~8단계 실행 완료`);
for (const r of watched) {
  console.log(`${r.name}: D ${r.D}, E ${r.E}, N ${r.N}/${r.maxN}, OFF ${r.OFF}/${r.targetOFF}, 연속N최대 ${r.maxConsecutiveNight}`);
}
console.log('전체 N 현황:', result.rows.map(r => `${r.name} ${r.N}/${r.maxN}`).join(' | '));

if (failures.length) {
  console.log('FAIL hard issues');
  failures.forEach(x => console.log(`- ${x}`));
  console.log('최근 로그:');
  (result.logs || []).forEach(x => console.log(`  ${x}`));
  process.exit(1);
}

console.log('PASS hard issues 0');
