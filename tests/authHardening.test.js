const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}
function fakeEl() { return { style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}}, setAttribute(){}, removeAttribute(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return[];}, value:'', textContent:'', innerHTML:'' }; }
function load(file) { require(path.resolve(__dirname, '..', file)); }
async function main() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.location = { href:'', origin:'https://hrms.example.com', pathname:'/ArthHRMS.html', search:'', hash:'', replace(url){ this.href=url; } };
  global.document = { querySelector(){return null;}, querySelectorAll(){return[];}, getElementById(){return null;}, createElement(){return fakeEl();}, addEventListener(){}, body:fakeEl(), documentElement:fakeEl() };
  global.__mockAuthUser = {
    id:'00000000-0000-4000-8000-000000000001',
    email:'owner@example.com',
    email_confirmed_at:'2026-07-01T00:00:00.000Z',
    app_metadata:{ role:'platform_owner' },
    user_metadata:{ full_name:'Platform Owner' }
  };
  global.supabase = {
    createClient(){
      return { auth:{
        getSession:async()=>({data:{session:{access_token:'verified-access-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:global.__mockAuthUser.id}}},error:null}),
        getUser:async()=>({data:{user:global.__mockAuthUser},error:null}),
        signOut:async()=>({error:null}),
        onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};}
      }};
    }
  };

  ['db.js','services/supabaseClient.js','services/errorService.js','services/employeeService.js','services/authService.js','services/authInviteService.js','services/notificationService.js','services/workflowEngine.js','services/operationsMonitoringService.js'].forEach(load);

  const fixture = global.DB.get();
  fixture.employees.push(
    { id:'EMP002', name:'Invite Target', email:'new.user@example.com', dept:'Operations', desig:'Executive', active:true },
    { id:'EMP003', name:'Mapping Conflict Target', email:'mapping.target@example.com', dept:'Operations', desig:'Executive', active:true }
  );
  global.DB.save(fixture);

  const setRuntime = (flags = {}, extra = {}) => {
    global.ARTHHRMS_CONFIG = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-test-key',
      flags: { PRODUCTION_MODE: true, DEVELOPMENT_MODE: false, DEMO_MODE: false, USE_SUPABASE_INVITES: true, USE_SUPABASE_AUTH: true, ...flags },
      ...extra
    };
  };

  setRuntime({}, { INVITE_USER_ENDPOINT: '' });
  const blocked = await global.authInviteService.sendInvite({ email:'new.user@example.com', role:'employee', empId:'EMP002', name:'New User', invitedByRole:'hr' });
  assert.equal(blocked.ok, false, 'production invite should fail without a live endpoint');
  assert.match(blocked.error || blocked.errors?.join(' '), /endpoint/i, 'failure should explain missing endpoint');

  setRuntime({}, { INVITE_USER_ENDPOINT: 'https://functions.example.com/invite-user', AUTH_INVITE_REDIRECT_URL: 'https://hrms.example.com/auth-callback.html' });
  let calledBody = null;
  global.fetch = async (_url, options) => {
    calledBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok:true, authUserId:'00000000-0000-4000-8000-000000000111', user:{ id:'00000000-0000-4000-8000-000000000111' } }) };
  };
  const sent = await global.authInviteService.sendInvite({ email:'new.user@example.com', role:'employee', empId:'EMP002', name:'New User', invitedByRole:'hr' });
  assert.equal(sent.ok, true, 'configured invite should send');
  assert.equal(sent.mode, 'live', 'configured production invite must be live');
  assert.equal(calledBody.redirectTo, 'https://hrms.example.com/auth-callback.html?flow=invite', 'invite uses a typed callback redirect');
  assert.equal(global.DB.getEmployee('EMP002').authUserId, '00000000-0000-4000-8000-000000000111', 'invite links auth_user_id to employee');

  const durableSent = await global.authInviteService.sendDurableInvite({
    email:'mapping.target@example.com',
    role:'manager',
    empId:'EMP003',
    name:'Mapping Target',
    tenantId:'tenant-a',
    companyId:'tenant-a'
  });
  assert.equal(durableSent.ok, true, 'dedicated setup flow should use the same live invite endpoint');
  assert.equal(calledBody.action, 'send');
  assert.equal(calledBody.empId, 'EMP003');
  assert.equal(calledBody.redirectTo, 'https://hrms.example.com/auth-callback.html?flow=invite');

  global.__mockAuthUser = { id:'00000000-0000-4000-8000-000000000111', email:'new.user@example.com', email_confirmed_at:'2026-05-18T00:00:00.000Z', app_metadata:{ role:'employee', empId:'EMP002' }, user_metadata:{ full_name:'New User' } };
  const activated = await global.authInviteService.handleInviteCallback({
    session: {
      access_token: 'verified-access-token',
      expires_at: Math.floor(Date.now()/1000)+3600,
      user: global.__mockAuthUser
    }
  });
  assert.equal(activated.ok, true, 'callback should activate account');
  assert.equal(global.DB.getEmployee('EMP002').activationStatus, 'Active', 'employee becomes active after callback');
  assert.equal(global.DB.getEmployee('EMP002').inviteStatus, 'Activated', 'employee invite status records activation stage');

  const duplicate = global.DB.linkAuthUserToEmployee('EMP003', '00000000-0000-4000-8000-000000000111', 'Active');
  assert.equal(duplicate.ok, false, 'duplicate auth_user_id mapping should be blocked');

  const beforeUsers = global.DB.getUsers().length;
  const user = global.DB.addUser({ name:'Suspend Me', email:'suspend@example.com', role:'employee', password:'', active:false });
  global.DB.deleteUser(user.id);
  assert.equal(global.DB.getUsers().length, beforeUsers + 1, 'deleteUser should not physically remove records');
  assert.equal(global.DB.getUser(user.id).activationStatus, 'Suspended', 'deleteUser should suspend account');

  const emp = global.DB.addEmployee({ name:'Archive Me', email:'archive@example.com', dept:'HR', desig:'Executive' });
  global.DB.deleteEmployee(emp.id);
  assert.ok(global.DB.getEmployee(emp.id), 'deleteEmployee should not physically remove employee');
  assert.equal(global.DB.getEmployee(emp.id).employmentStatus, 'Archived', 'deleteEmployee should archive employee');

  console.log('authHardening.test.js passed');
}
main().catch(err => { console.error(err); process.exit(1); });
