// Survey questions and reference lists. Edit questions here: [id, question, type(yn|choice|multi|text|number), options, red-flag answer, help]
const WORKS={kitchen:'Kitchen',bathroom:'Bathroom',windows:'Windows & doors',roofing:'Roofing',external:'External repairs',structural:'Structural repairs'};
const PSTATUS=['To survey','Surveyed','In progress','Complete'];
const PSTATUS_CLS={'To survey':'p-grey','Surveyed':'p-info','In progress':'p-warn','Complete':'p-ok'};
const SNAG={open:['Open','p-bad'],fixed:['Done - check it','p-warn'],closed:['Closed','p-ok']};
const SNAG_C={open:['To do','p-bad'],fixed:['Done - awaiting check','p-warn'],closed:['Signed off','p-ok']};
function snagLabel(s){return((S.mode==='contractor'?SNAG_C:SNAG)[s.status]||SNAG.open)}
function rid(n=14){const a='abcdefghijkmnpqrstuvwxyz23456789';const b=new Uint8Array(n);crypto.getRandomValues(b);return[...b].map(x=>a[x%a.length]).join('')}
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRADES=['Joiner','Plumber','Electrician','Plasterer','Tiler','Decorator','Roofer','Bricklayer','Window fitter','Groundworker','Kitchen fitter','Scaffolder','General / labourer'];
const ROOMS=['Kitchen','Bathroom','WC','Hallway','Landing','Stairs','Living room','Bedroom 1','Bedroom 2','Bedroom 3','Loft','Front elevation','Rear elevation','Side elevation','Roof','Garden','Communal area'];
const GFP=['Good','Fair','Poor'];

// [id, question, type(yn|choice|multi|text|number), options, flag-answer]
let COMMON={title:'Access & safety',qs:[
 ['c_tenant','Was the tenant in?','yn'],
 ['c_access','Access arrangements','text',null,null,'Key safe, best times to call, who to contact'],
 ['c_vuln','Vulnerable occupant or extra needs?','yn',null,'Yes'],
 ['c_pets','Pets in the property?','yn',null,'Yes'],
 ['c_asb_reg','Asbestos register checked?','choice',['Yes','No','Not available'],'Not available'],
 ['c_acm','Suspected asbestos seen in the work area?','yn',null,'Yes'],
 ['c_damp','Damp or mould visible?','yn',null,'Yes'],
 ['c_hazard','Any other H&S hazards? (hoarding, sharps, unsafe structure)','yn',null,'Yes'],
 ['c_parking','Parking, skip and welfare','text',null,null,'Where can the van, skip and welfare go?']]};
let TEMPLATES={
 kitchen:[
  {title:'Layout',qs:[['k_layout','Kitchen layout','choice',['Galley','L-shape','U-shape','Single run','Other']],['k_size','Room size (length × width, mm)','text'],['k_base','Base units now','number'],['k_wall','Wall units now','number'],['k_choice','Tenant choices (doors, worktop, flooring)','text']]},
  {title:'Services',qs:[['k_boiler','Boiler in the kitchen?','yn'],['k_cooker','Cooker type','choice',['Gas','Electric','Dual fuel','None']],['k_gas','Gas isolation valve accessible?','yn',null,'No'],['k_stop','Stopcock found and working?','yn',null,'No'],['k_rcd','Consumer unit has RCD protection?','yn',null,'No'],['k_rewire','Electrical upgrade likely?','yn',null,'Yes'],['k_fan','Extract fan present and working?','yn',null,'No']]},
  {title:'Condition',qs:[['k_floor','Floor','choice',GFP,'Poor'],['k_walls','Walls and plaster','choice',GFP,'Poor'],['k_window','Window','choice',GFP,'Poor'],['k_ot','OT adaptations needed?','yn',null,'Yes']]}],
 bathroom:[
  {title:'Layout',qs:[['b_type','What is needed?','choice',['Bath','Shower over bath','Level access shower','Shower tray']],['b_ot','OT recommendations in place?','yn'],['b_size','Room size (length × width, mm)','text'],['b_wc','Separate WC?','yn'],['b_choice','Tenant choices (tiles, flooring)','text']]},
  {title:'Services',qs:[['b_hw','Hot water','choice',['Combi boiler','Cylinder','Electric shower only','Other']],['b_kw','Electric shower size (kW), if fitted','number'],['b_fan','Extract fan present and working?','yn',null,'No'],['b_soil','Soil stack','choice',['Internal','External']],['b_rcd','Consumer unit has RCD protection?','yn',null,'No']]},
  {title:'Condition',qs:[['b_floor','Floorboards and joists','choice',['Sound','Some soft spots','Rotten'],'Rotten'],['b_walls','Walls and plaster','choice',GFP,'Poor'],['b_leak','Leak marks on the ceiling below?','yn',null,'Yes'],['b_rails','Grab rails needed?','yn']]}],
 windows:[
  {title:'Scope',qs:[['w_win','Windows to replace','number'],['w_doors','External doors to replace','number'],['w_mat','Existing frames','choice',['Timber','uPVC','Aluminium','Steel','Mixed']],['w_meas','Measurements taken?','yn',null,'No'],['w_colour','Colour and finish agreed with tenant?','yn']]},
  {title:'Compliance',qs:[['w_egress','Escape windows needed? (habitable rooms upstairs)','yn'],['w_vents','Trickle vents needed?','yn'],['w_fd','Fire door to a communal area (FD30S)?','choice',['Yes','No','Not applicable']],['w_glass','Safety glass needed (low level / near doors)?','yn']]},
  {title:'Condition',qs:[['w_lintel','Lintels sound?','choice',['Yes','No','Can\'t see'],'No'],['w_cills','Cills and reveals','choice',GFP,'Poor'],['w_mg','Internal making good expected','choice',['Minimal','Moderate','Extensive']]]}],
 roofing:[
  {title:'Roof',qs:[['r_type','Roof type','choice',['Pitched tile','Pitched slate','Flat felt','Flat GRP / EPDM','Mixed']],['r_area','Roof area, roughly (m²)','number'],['r_adj','Adjoining or shared roof?','yn',null,'Yes'],['r_chim','Chimney','choice',['None','Sound','Needs repair','Take down']],['r_gut','Gutters and downpipes','choice',GFP,'Poor'],['r_fas','Fascias and soffits','choice',GFP,'Poor']]},
  {title:'Access',qs:[['r_access','How will we get up?','choice',['Full scaffold','Tower','MEWP','Roof ladder']],['r_fragile','Fragile surfaces? (rooflights, cement sheets)','yn',null,'Yes'],['r_power','Overhead power lines nearby?','yn',null,'Yes']]},
  {title:'Loft & wildlife',qs:[['r_ingress','Water getting in?','yn',null,'Yes'],['r_ins','Loft insulation depth (mm)','number'],['r_vent','Roof ventilation OK?','yn',null,'No'],['r_bats','Bats or nesting birds seen?','yn',null,'Yes']]}],
 external:[
  {title:'What needs doing',qs:[['e_scope','Tick everything that needs work','multi',['Brickwork / repointing','Render','Gutters & downpipes','Fascias & soffits','Paths & steps','Fencing & gates','Drainage','Garden walls']],['e_brick','Brickwork','choice',GFP,'Poor'],['e_render','Hollow or cracked render?','yn'],['e_trip','Trip hazards on paths or steps?','yn',null,'Yes'],['e_drain','Blocked or damaged drains?','yn',null,'Yes'],['e_fence','Boundary fencing','choice',GFP,'Poor']]},
  {title:'Access',qs:[['e_scaff','Scaffold needed?','yn'],['e_neigh','Need access over a neighbour\'s land?','yn',null,'Yes']]}],
 structural:[
  {title:'The defect',qs:[['s_type','What sort of defect?','multi',['Cracking','Subsidence / movement','Lintel failure','Wall tie failure','Timber decay','Bowing wall','Other']],['s_loc','Where is it?','text'],['s_crack','Widest crack (mm)','number'],['s_mon','Crack monitoring in place?','yn'],['s_report','Engineer\'s report on file?','yn',null,'No']]},
  {title:'Risk',qs:[['s_safe','Safe to stay in?','choice',['Yes','Concerns - ring PM today'],'Concerns - ring PM today'],['s_temp','Propping or temporary works needed?','yn',null,'Yes'],['s_pw','Party Wall notice needed?','yn',null,'Yes'],['s_trees','Trees or drains near the defect?','yn']]}]};
let CLOSE={title:'Sign-off',qs:[['z_go','OK to go ahead with the works?','choice',['Yes','Yes, with conditions','No - refer to PM'],'No - refer to PM'],['z_notes','Anything else the team should know?','text']]};
// Each section has a stable key for its photos, so adding or moving sections never mixes up old surveys' photos
function keySections(q){
  q.COMMON.key=q.COMMON.key||'sec0';
  q.CLOSE.keyBy=q.CLOSE.keyBy||{};
  for(const [t,list] of Object.entries(q.TEMPLATES)){list.forEach((s,i)=>{s.key=s.key||'sec'+(i+1)});if(!q.CLOSE.keyBy[t])q.CLOSE.keyBy[t]='sec'+(list.length+1)}
  return q;
}
keySections({COMMON,TEMPLATES,CLOSE});
const DEFAULT_QUESTIONS=JSON.parse(JSON.stringify({COMMON,TEMPLATES,CLOSE}));
// Question sets: the company one, and any project's own. Built once per load and reused.
let QSETS={company:null,projects:{}};const QCACHE={};
function useQuestions(q){
  QSETS={company:(q&&q.company&&q.company.value)||null,projects:Object.fromEntries(Object.entries((q&&q.projects)||{}).filter(([,v])=>v&&v.value).map(([k,v])=>[k,v.value]))};
  for(const k in QCACHE)delete QCACHE[k];
  const c=qsetFor(null);COMMON=c.COMMON;TEMPLATES=c.TEMPLATES;CLOSE=c.CLOSE;
}
function qsetFor(pid){
  const k=pid&&QSETS.projects[pid]?pid:'_company';
  if(!QCACHE[k])QCACHE[k]=keySections(JSON.parse(JSON.stringify(k==='_company'?(QSETS.company||DEFAULT_QUESTIONS):QSETS.projects[pid])));
  return QCACHE[k];
}
// Uses the survey's project's questions (pid, or worked out from the survey's address)
function surveySections(type,sv,pid){
  if(pid===undefined&&sv&&sv.property_id&&typeof S!=='undefined'){const p=S.props.get(sv.property_id);pid=p&&p.project_id}
  const q=qsetFor(pid);const a=(sv&&sv.answers)||{};
  return [q.COMMON,...(q.TEMPLATES[type]||[]),q.CLOSE].map(s=>({title:s.title,pkey:s===q.CLOSE?(q.CLOSE.keyBy[type]||'secZ'):s.key,qs:s.qs.filter(x=>!x[6]||a[x[0]]!=null)})).filter(s=>s.qs.length);
}


const ASB_STATUS=['No asbestos found','Asbestos present','No survey available'];
const ASB_TYPES=['Management survey','Refurbishment & demolition (R&D)','Asbestos register only','Other'];
const ASB_IMPACT=['Removal needed before works','Work around it (no disturbance)','Doesn\'t affect our works'];
const SCAFF_CHECKS=['All work at height finished','Roof / elevations signed off','Snags at height closed','Tenant told','Materials and waste cleared'];
const SCAFF={requested:['Requested','p-warn'],confirmed:['Date confirmed','p-info'],struck:['Struck','p-ok'],cancelled:['Cancelled','p-grey']};
const ERECT_CHECKS=['Tenant told','Access and parking agreed','Asbestos checked for the scaffold area','Area clear (bins, cars, plants)','Highway licence in place (if needed)'];
const DELAY_REASONS=['No access - tenant not in','Tenant refused works','Tenant illness / vulnerability','Asbestos found / awaiting removal','Structural issue found','Materials not delivered','Subcontractor didn\'t attend','Weather','Waiting for client instruction / variation','Utilities (gas, electric, water)','Other'];
const DELAY_CAUSES=['Tenant','Client','Chas Berger','Subcontractor','Weather / unforeseen'];
