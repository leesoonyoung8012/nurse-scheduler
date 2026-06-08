const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const remote = JSON.parse(fs.readFileSync('/tmp/nurseScheduler.json', 'utf8'));
const script = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('function defaultData'));

const sb = {
  console,
  alert: m => { throw Error(String(m)); },
  confirm: () => true,
  prompt: () => '',
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  Date,
  Math,
  JSON,
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  document: {
    getElementById: () => ({ className:'', classList:{add(){}, remove(){}}, innerHTML:'', textContent:'', value:'', checked:false, disabled:false, style:{}, querySelector:()=>null }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  },
  addEventListener() {},
  requestAnimationFrame: f => setTimeout(f, 0)
};
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(script, sb);
function run(code){ return vm.runInContext(code, sb); }

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
  const ward=data.wards.find(w=>w.name==='test3');
  currentUser={role:'ward',wardId:ward.id};
  uiYear=2026; uiMonth=5;
  stepGenerationState=null; scheduleDraftState={}; resultCache=null;
  normalizeWardStructure(ward);
  stepRunAll();
`);

const out = run(`
(function(){
  const ward=getCurrentWard(), st=stepEnsureState();
  const nurses=(ward.nurses||[]).filter(n=>n.employmentStatus!=='leave'&&n.employmentStatus!=='inactive');
  const y=st.y,m=st.m,d=17,k=makeDateKey(y,m,d);
  return {
    counts:['D','E','N'].map(sh=>({shift:sh,got:stepCount(st.schedule,y,m,d,sh,nurses),min:getStaffingMinForDate(ward,y,m,d,sh),max:getStaffingMaxForDate(ward,y,m,d,sh)})),
    rows:nurses.map(n=>{
      const c=String(st.schedule[k]?.[n.id]||'').toUpperCase();
      return {
        name:n.name,
        code:c,
        allowedE:stepAllowed(n,'E'),
        canE:stepCanPlace(n,'E',d,{replace:true,overrideWanted:true,overrideLock:true,overrideStaffingMax:false,overrideMinOff:true,overrideRecoveryOff:true}),
        prev:String(st.schedule[makeDateKey(y,m,d-1)]?.[n.id]||'').toUpperCase(),
        next:String(st.schedule[makeDateKey(y,m,d+1)]?.[n.id]||'').toUpperCase(),
        locked:stepLockReason(y,m,d,n.id)
      };
    })
  };
})();
`);

console.log(JSON.stringify(out, null, 2));
