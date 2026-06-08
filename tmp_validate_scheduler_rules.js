const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const mainScript = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('function defaultData'));

const storage = {};
const sandbox = {
  console,
  alert: (msg) => { throw new Error(`alert: ${msg}`); },
  confirm: () => true,
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
    getElementById: () => ({ className: '', innerHTML: '', value: '', checked: false, style: {}, querySelector: () => null }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  addEventListener: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
vm.runInContext(mainScript, context);

function run(code) {
  return vm.runInContext(code, context);
}

run(`
  data = defaultData();
  data.shiftCodes = [
    {id:'sc-d', code:'D'}, {id:'sc-e', code:'E'}, {id:'sc-n', code:'N'},
    {id:'sc-o', code:'O'}, {id:'sc-of', code:'OF'}, {id:'sc-wo', code:'WO'},
    {id:'sc-al', code:'AL'}, {id:'sc-sl', code:'SL'}, {id:'sc-ha', code:'HA'}, {id:'sc-hp', code:'HP'}
  ];
  data.workTypes = [
    {id:'wt-3s', name:'3 SHIFT', code:'3S', allowedCodes:'D,E,N,O,OF,WO,AL,SL,HA,HP'},
    {id:'wt-dnk', name:'DAY-NIGHT keep', code:'DNK', allowedCodes:'D,N,O,OF,WO,AL,SL,HA,HP'},
    {id:'wt-nk', name:'NIGHT KEEP', code:'NK', allowedCodes:'N,O,OF,WO,AL,SL,HA,HP'},
    {id:'wt-office', name:'상근', code:'SG', allowedCodes:'D,O,OF,WO,AL,SL,HA,HP'}
  ];
  ensureShiftCodeWorkTypeConsistency();
  data.globalHolidays = [{date:'2026-06-03', name:'테스트 공휴일'}];
  data.commonScheduleSettings.defaultMaxNightPerMonth = 6;
  data.commonScheduleSettings.defaultMaxConsecutiveDays = 5;
  data.commonScheduleSettings.defaultMinConsecutiveNight = 1;
  data.commonScheduleSettings.defaultMaxConsecutiveNight = 3;
  data.commonScheduleSettings.defaultMinConsecutiveOff = 1;
  data.commonScheduleSettings.defaultMaxConsecutiveOff = 3;
  data.wards = [{
    id:'test-ward',
    name:'테스트',
    nightRestDaysAfterBlock:2,
    staffingRules:{
      weekday:{D:{min:0,max:10},E:{min:0,max:10},N:{min:0,max:10}},
      saturday:{D:{min:0,max:10},E:{min:0,max:10},N:{min:0,max:10}},
      holiday:{D:{min:0,max:10},E:{min:0,max:10},N:{min:0,max:10}}
    },
    nurses:[
      {id:'dnk', name:'DNK테스트', employmentStatus:'active', team:'A', workTypeIds:['wt-dnk'], skillLevel:'LV4', skillTags:['나이트숙련'], maxNightPerMonth:2, maxConsecutiveDays:2, minConsecutiveNight:1, maxConsecutiveNight:2, minConsecutiveOff:2, maxConsecutiveOff:3, personalShiftDayRules:{N:['sat','sun']}},
      {id:'three', name:'삼교대테스트', employmentStatus:'active', team:'A', workTypeIds:['wt-3s'], skillLevel:'LV4', skillTags:['나이트숙련'], maxNightPerMonth:6, maxConsecutiveDays:5, minConsecutiveNight:1, maxConsecutiveNight:3, minConsecutiveOff:1, maxConsecutiveOff:3},
      {id:'nk', name:'나이트킵테스트', employmentStatus:'active', team:'B', workTypeIds:['wt-nk'], skillLevel:'LV4', skillTags:['나이트숙련'], maxNightPerMonth:16, maxConsecutiveDays:5, minConsecutiveNight:1, maxConsecutiveNight:3, minConsecutiveOff:1, maxConsecutiveOff:3},
      {id:'office', name:'상근테스트', employmentStatus:'active', team:'C', workTypeIds:['wt-office'], skillLevel:'LV4', skillTags:[], maxNightPerMonth:0, maxConsecutiveDays:5, minConsecutiveNight:0, maxConsecutiveNight:0, minConsecutiveOff:1, maxConsecutiveOff:3}
    ],
    schedulesByMonth:{}
  }];
  currentUser = {role:'ward', wardId:'test-ward', name:'검증'};
  uiYear = 2026;
  uiMonth = 6;
  stepGenerationState = null;
  stepEnsureState();
`);

const tests = [];
function test(name, expr) {
  const ok = !!run(expr);
  tests.push({ name, ok });
  if (!ok) process.exitCode = 1;
}

test('근무유형 DNK는 E 불가', `!getAllowedCodes(getCurrentWard().nurses[0]).includes('E')`);
test('근무유형 DNK는 D/N 가능', `getAllowedCodes(getCurrentWard().nurses[0]).includes('D') && getAllowedCodes(getCurrentWard().nurses[0]).includes('N')`);
test('근무자 태그 목록에서 특수파트가능/나이트숙련 제외', `!getNurseTagMasterList().includes('특수파트가능') && !getNurseTagMasterList().includes('나이트숙련')`);
test('법적조건 E→D 금지', `violatesWorkTypeTransition(getCurrentWard().nurses[1], 'E', 'D') === true`);
test('법적조건 N→D 금지', `violatesWorkTypeTransition(getCurrentWard().nurses[0], 'N', 'D') === true`);
test('법적조건 N→E 금지', `violatesWorkTypeTransition(getCurrentWard().nurses[0], 'N', 'E') === true`);
test('법적조건은 나이트킵에도 전역 적용', `violatesWorkTypeTransition(getCurrentWard().nurses[2], 'N', 'D') === true`);
test('단계 실행 호환 함수 isRestricted 존재', `typeof isRestricted === 'function' && isRestricted(getCurrentWard().nurses[0], 'weekday') === false`);
run(`
  renderWardSchedule = function(){};
  stepPushDraft = function(){};
  popup = function(){};
  stepGenerationState = null;
  stepEnsureState();
  stepRunWantedOff();
`);
test('1단계 원티드 OFF는 isRestricted 오류 없이 완료', `stepGenerationState.done[1] === true`);
test('개인조건 N 토/일만 가능: 평일 N 차단', `stepCanPlace(getCurrentWard().nurses[0], 'N', 1, {replace:true}) === false`);
test('개인조건 N 토/일만 가능: 공휴일 N 차단', `stepCanPlace(getCurrentWard().nurses[0], 'N', 3, {replace:true}) === false`);
test('개인조건 N 토/일만 가능: 토요일 N 허용', `stepCanPlace(getCurrentWard().nurses[0], 'N', 6, {replace:true}) === true`);

run(`
  stepGenerationState = null;
  stepEnsureState();
  getCurrentWard().nurses[0].skillLevel='LV2';
  getCurrentWard().nurses[0].skillTags=[];
  getCurrentWard().nurses[1].skillLevel='LV2';
  getCurrentWard().nurses[1].skillTags=[];
  stepGenerationState.schedule[makeDateKey(2026,6,6)].dnk='N';
`);
test('기본조건: 주니어끼리 N 동시 배치 차단', `stepCanPlace(getCurrentWard().nurses[1], 'N', 6, {replace:true}) === false`);
run(`
  getCurrentWard().nurses[0].skillLevel='LV4';
  getCurrentWard().nurses[0].skillTags=['나이트숙련'];
  getCurrentWard().nurses[1].skillLevel='LV4';
  getCurrentWard().nurses[1].skillTags=['나이트숙련'];
`);

run(`
  stepGenerationState.schedule[makeDateKey(2026,6,6)].dnk='N';
  stepGenerationState.schedule[makeDateKey(2026,6,7)].dnk='N';
`);
test('N 최대개수 2개 도달 후 추가 N 차단', `stepCanPlace(getCurrentWard().nurses[0], 'N', 13, {replace:true}) === false`);
test('연속 N 최대 2 초과 차단', `stepCanPlace(getCurrentWard().nurses[0], 'N', 8, {replace:true, overrideMaxNight:true, overrideNightGap:true}) === false`);

run(`
  stepGenerationState = null;
  stepEnsureState();
  stepGenerationState.schedule[makeDateKey(2026,6,1)].dnk='D';
  stepGenerationState.schedule[makeDateKey(2026,6,2)].dnk='D';
`);
test('연속근무 최대 2 초과 차단', `stepCanPlace(getCurrentWard().nurses[0], 'D', 3, {replace:true}) === false`);

run(`
  stepGenerationState = null;
  stepEnsureState();
  stepGenerationState.schedule[makeDateKey(2026,6,1)].dnk='OF';
`);
test('연속 OFF 최소 2 미달 상태에서 근무 배치 차단', `stepCanPlace(getCurrentWard().nurses[0], 'D', 2, {replace:true}) === false`);

run(`
  stepGenerationState = null;
  stepEnsureState();
  stepGenerationState.schedule[makeDateKey(2026,6,1)].dnk='WO';
  stepLock(2026,6,1,'dnk','WO');
`);
test('WO는 기본적으로 근무 배치 차단', `stepCanPlace(getCurrentWard().nurses[0], 'D', 1, {replace:true}) === false`);
test('WO보다 개인/필수조건 보정 우선 시 overrideWanted로 배치 허용', `stepCanPlace(getCurrentWard().nurses[0], 'D', 1, {replace:true, overrideWanted:true}) === true`);

run(`
  renderWardNurses = function(){};
  closeModal = function(){};
  popup = function(){};
  ensureWardDraftState();
  document.querySelector = function(sel){
    const enabled = {
      'input[data-personal-shift-enabled="D"]': {checked:true, disabled:false},
      'input[data-personal-shift-enabled="E"]': {checked:false, disabled:true},
      'input[data-personal-shift-enabled="N"]': {checked:false, disabled:true}
    };
    if(enabled[sel]) return enabled[sel];
    const dayMatch = sel.match(/data-personal-shift="([DEN])".*data-personal-day="([^"]+)"/);
    if(dayMatch){
      const shift=dayMatch[1], day=dayMatch[2];
      return {checked: shift==='D' && day==='weekday', disabled:false};
    }
    return null;
  };
  savePersonalShiftRuleModal('office');
`);
test('상근 개인조건은 D만 선택해도 E/N 요일 요구 없이 저장', `JSON.stringify((nurseDraftState['test-ward'].find(n=>n.id==='office')||{}).personalShiftDayRules) === JSON.stringify({D:['weekday']})`);

run(`
  document.querySelector = function(sel){
    const enabled = {
      'input[data-personal-shift-enabled="D"]': {checked:true, disabled:false},
      'input[data-personal-shift-enabled="E"]': {checked:true, disabled:false},
      'input[data-personal-shift-enabled="N"]': {checked:true, disabled:false}
    };
    if(enabled[sel]) return enabled[sel];
    const dayMatch = sel.match(/data-personal-shift="([DEN])".*data-personal-day="([^"]+)"/);
    if(dayMatch) return {checked:true, disabled:false};
    return null;
  };
  savePersonalShiftRuleModal('three');
`);
test('3교대 D/E/N 전체요일 적용 체크는 다시 열어도 유지되도록 별도 저장', `JSON.stringify((nurseDraftState['test-ward'].find(n=>n.id==='three')||{}).personalShiftRuleEnabled) === JSON.stringify({D:true,E:true,N:true})`);
test('3교대 D/E/N 전체요일은 실제 제한 규칙으로 저장하지 않음', `JSON.stringify((nurseDraftState['test-ward'].find(n=>n.id==='three')||{}).personalShiftDayRules) === JSON.stringify({})`);
test('3교대 D/E/N 전체요일 요약은 적용 상태를 표시', `personalShiftRuleSummary(nurseDraftState['test-ward'].find(n=>n.id==='three')).includes('D: 전체') && personalShiftRuleSummary(nurseDraftState['test-ward'].find(n=>n.id==='three')).includes('E: 전체') && personalShiftRuleSummary(nurseDraftState['test-ward'].find(n=>n.id==='three')).includes('N: 전체')`);
test('개인조건 적용 즉시 실제 병동 명단에도 저장', `JSON.stringify((getCurrentWard().nurses.find(n=>n.id==='three')||{}).personalShiftRuleEnabled) === JSON.stringify({D:true,E:true,N:true})`);

run(`
  stepGenerationState = null;
  stepEnsureState();
  const wardForSwap = getCurrentWard();
  wardForSwap.staffingRules.weekday.D.min=1;
  wardForSwap.staffingRules.weekday.D.max=2;
  wardForSwap.staffingRules.weekday.E.min=0;
  wardForSwap.staffingRules.weekday.E.max=2;
  stepGenerationState.schedule[makeDateKey(2026,6,1)].three='E';
`);
test('7단계 최소/최대 2인교환 후보 검사에서 shift 변수 오류 없음', `(()=>{ try{ stepRepairMinimumByPairedSwap(stepGenerationState.schedule,getCurrentWard(),2026,6); return true; }catch(e){ return false; } })()`);

run(`
  stepGenerationState = null;
  stepEnsureState();
  const wardForStage2 = getCurrentWard();
  wardForStage2.staffingRules.weekday.N.min=0;
  wardForStage2.staffingRules.saturday.N.min=1;
  wardForStage2.staffingRules.saturday.N.max=1;
  wardForStage2.staffingRules.holiday.N.min=0;
  renderWardSchedule = function(){};
  stepPushDraft = function(){};
  stepRunNightKeep();
`);
test('2단계는 나이트킵보다 요일조건 N 가능자를 우선 배치', `stepGenerationState.schedule[makeDateKey(2026,6,6)].dnk === 'N' && stepGenerationState.schedule[makeDateKey(2026,6,6)].nk !== 'N'`);
test('2단계 요일조건 N은 전용 잠금으로 표시', `stepIsConditionedNightLockReason(stepLockReason(2026,6,6,'dnk')) === true`);
run(`stepRunGeneralNight();`);
test('3단계 재계산 후에도 2단계 요일조건 N 보존', `stepGenerationState.schedule[makeDateKey(2026,6,6)].dnk === 'N'`);

for (const t of tests) {
  console.log(`${t.ok ? 'PASS' : 'FAIL'} ${t.name}`);
}
console.log(`TOTAL ${tests.filter(t => t.ok).length}/${tests.length}`);
