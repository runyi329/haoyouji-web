const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');
const gate = require('./prepare-miban-supplier-deploy.cjs');
const normalize = sql => sql.replace(/\s+/g,' ').trim();
test('deployment uses exactly the same five DDL statements as startup',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../server/db-init.ts'),'utf8').split('export async function ensureMibanSupplierTables')[1];
 const ddl=[...text.matchAll(/`(CREATE TABLE[\s\S]*?)`/g)].map(m=>normalize(m[1]));
 assert.equal(ddl.length,5);assert.deepEqual(gate.TABLES.map(normalize),ddl);
 assert(gate.TABLES.every(sql=>/^CREATE TABLE IF NOT EXISTS miban_supplier/.test(sql)));
});
function runtime(config={},running=[],file={},shell={}){
 return gate.validateRuntime('/app',{apps:[{name:'haoyouji-web',cwd:'/app',script:'/app/dist/index.js',...config}]},running,file,shell);
}
test('verifies target and merges file, existing workers and restart env',()=>{
 const out=runtime({env:{JWT_SECRET:'configuration-key'}},[{name:'haoyouji-web',pm2_env:{pm_cwd:'/app',pm_exec_path:'/app/dist/index.js',JWT_SECRET:'configuration-key'}}],{JWT_SECRET:'file-key'},{});
 assert.equal(out[0].JWT_SECRET,'configuration-key');
});
test('actual workers must run from verified cwd and script',()=>{
 assert.throws(()=>runtime({},[{name:'haoyouji-web',pm2_env:{pm_cwd:'/wrong',pm_exec_path:'/wrong/old.js'}}]),/Actual PM2/);
});
test('CLI shell overrides existing worker env but cannot rotate an existing key',()=>{
 const worker={name:'haoyouji-web',pm2_env:{pm_cwd:'/app',pm_exec_path:'/app/dist/index.js',ORIGINAL_DATABASE_URL:'old-db',JWT_SECRET:'stable'}};
 assert.equal(runtime({},[worker],{}, {ORIGINAL_DATABASE_URL:'new-db'})[0].ORIGINAL_DATABASE_URL,'new-db');
 assert.throws(()=>runtime({},[worker],{}, {JWT_SECRET:'changed'}),/rotate/);
});
test('custom dotenv modes fail closed and database fallback preserves explicit empty',()=>{
 assert.throws(()=>runtime({},[],{DOTENV_CONFIG_PATH:'/other/env'}),/dotenv/);
 assert.throws(()=>runtime({},[],{DOTENV_CONFIG_OVERRIDE:'true'}),/dotenv/);
 assert.equal(gate.mainDatabaseUrl({},'fallback'),'fallback');
 assert.equal(gate.mainDatabaseUrl({ORIGINAL_DATABASE_URL:'',DATABASE_URL:'actual-db'},'fallback'),'actual-db');
 assert.equal(gate.mainDatabaseUrl({ORIGINAL_DATABASE_URL:'original'},'fallback'),'original');
});
test('reads declared or esbuild-hoisted fallback assignment but rejects ambiguity',()=>{
 const value='mysql://fixture:fixture@localhost/test';
 assert.equal(gate.bundleDatabaseFallback(`var TENCENT_CLOUD_DB_URL = ${JSON.stringify(value)};`),value);
 assert.equal(gate.bundleDatabaseFallback(`var TENCENT_CLOUD_DB_URL, ENV;var init=()=>{TENCENT_CLOUD_DB_URL = ${JSON.stringify(value)};};`),value);
 assert.throws(()=>gate.bundleDatabaseFallback('var ENV = {};'),/Cannot identify/);
 assert.throws(()=>gate.bundleDatabaseFallback('TENCENT_CLOUD_DB_URL = "not-a-url";'),/Cannot identify/);
 assert.throws(()=>gate.bundleDatabaseFallback(`TENCENT_CLOUD_DB_URL = ${JSON.stringify(value)}; TENCENT_CLOUD_DB_URL = ${JSON.stringify(value)};`),/Cannot identify/);
});
test('production cannot use preview or development database mode',()=>{
 assert.throws(()=>runtime({},[],{FAST_PREVIEW:'true'}),/FAST_PREVIEW/);
 assert.throws(()=>runtime({},[],{USE_DEV_DB:'true'}),/USE_DEV_DB/);
});
test('wrong PM2 cwd or entry is rejected before production changes',()=>{
 assert.throws(()=>runtime({cwd:'/other'}),/cwd\/script/);
 assert.throws(()=>runtime({script:'unverified.js'}),/cwd\/script/);
});
function envFile(run,content='OTHER=value\nJWT_SECRET=\n'){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'supplier-gate-test-'));const file=path.join(tmp,'.env');fs.writeFileSync(file,content,{mode:0o600});
 try{return run(file);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
test('keeps a stable existing JWT signing key and does not modify environment',()=>envFile(file=>{
 const before=fs.readFileSync(file,'utf8');assert.equal(gate.writeDedicatedSecret(file,dotenv.parse,[{JWT_SECRET:'stable'}]),false);assert.equal(fs.readFileSync(file,'utf8'),before);
}));
test('creates only a dedicated key, preserves other values and persists stable shared value',()=>envFile(file=>{
 const workers=[{},{}];assert.equal(gate.writeDedicatedSecret(file,dotenv.parse,workers),true);
 const parsed=dotenv.parse(fs.readFileSync(file));assert.equal(parsed.OTHER,'value');assert.equal(parsed.JWT_SECRET,'');assert.match(parsed.MIBAN_FULFILLMENT_SECRET,/^[a-f0-9]{64}$/);
 assert.equal(workers[0].MIBAN_FULFILLMENT_SECRET,workers[1].MIBAN_FULFILLMENT_SECRET);assert.equal(workers[0].MIBAN_FULFILLMENT_SECRET,parsed.MIBAN_FULFILLMENT_SECRET);
 assert.equal(fs.statSync(file).mode & 0o777,0o600);assert.equal(gate.writeDedicatedSecret(file,dotenv.parse,workers),false);
}));
test('mismatched or partially configured workers fail without editing environment',()=>envFile(file=>{
 const before=fs.readFileSync(file,'utf8');assert.throws(()=>gate.writeDedicatedSecret(file,dotenv.parse,[{JWT_SECRET:'a'},{JWT_SECRET:'b'}]),/different/);
 assert.throws(()=>gate.writeDedicatedSecret(file,dotenv.parse,[{JWT_SECRET:'a'},{}]),/some workers/);assert.equal(fs.readFileSync(file,'utf8'),before);
}));
test('an explicit process empty key cannot be overridden by a file-only new key',()=>envFile(file=>{
 assert.throws(()=>gate.writeDedicatedSecret(file,dotenv.parse,[{}],[{MIBAN_FULFILLMENT_SECRET:''}]),/overriding empty/);
 assert.equal(dotenv.parse(fs.readFileSync(file)).MIBAN_FULFILLMENT_SECRET,undefined);
}));
test('symlink environment is not replaced',()=>envFile(file=>{
 const link=file+'.link';fs.symlinkSync(file,link);assert.throws(()=>gate.writeDedicatedSecret(link,dotenv.parse,[{}]),/safely/);
}));
function fake(options={}){
 const log=[];
 return {log,async execute(sql){log.push(sql);if(sql.startsWith('CREATE TABLE'))return [[]];
  const structure=gate.STRUCTURES.find(s=>sql.includes('`'+s.name+'`'));
  if(sql.startsWith('SHOW FULL COLUMNS'))return [structure.columns.filter(name=>!(options.missing && name==='supplier_id')).map(name=>{
   const spec=gate.columnSpec(structure,name);return {Field:name,Collation:structure.binary?.includes(name)?(options.collation||'utf8mb4_bin'):null,Type:structure.json?.includes(name)?(options.jsonType||'json'):options.badType||spec.type,Null:options.badNull?'YES':spec.nullable?'YES':'NO',Default:options.badDefault?'wrong':spec.default,Extra:options.badExtra?'':spec.auto?'auto_increment':spec.update?'DEFAULT_GENERATED on update CURRENT_TIMESTAMP':''};
  })];
  if(sql.startsWith('SHOW INDEX'))return [Object.entries(structure.indexes).flatMap(([name,columns])=>columns.map((column,i)=>({Key_name:name,Column_name:column,Seq_in_index:i+1,Non_unique:name==='PRIMARY'||structure.unique?.includes(name)?(options.nonUnique||0):1})))];
  if(sql.startsWith('SELECT ENGINE'))return [[{ENGINE:options.engine||'InnoDB'}]];
  if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:options.lock===false?0:1}]];
  if(sql.startsWith('SELECT RELEASE_LOCK'))return [[{released:options.release===false?0:1}]];
  throw Error('Unexpected production SQL');
 }};
}
test('creates/verifies exactly five tables, named locks; never assigns orders or wallets',async()=>{
 const db=fake();await gate.ensureAndVerify(db);assert.equal(db.log.filter(sql=>sql.startsWith('CREATE TABLE')).length,5);
 assert(db.log.every(sql=>/^(CREATE TABLE|SHOW |SELECT )/.test(sql)));assert(!db.log.some(sql=>/^(INSERT|UPDATE|DELETE|ALTER|DROP)\b/.test(sql)));
});
test('wrong table columns, uniqueness, binary collation, JSON or engine fail closed',async()=>{
 for(const option of [{missing:true},{nonUnique:1},{collation:'utf8mb4_unicode_ci'},{jsonType:'text'},{engine:'MyISAM'}])await assert.rejects(gate.ensureAndVerify(fake(option)),/differ|transactional/);
});
test('wrong types, nullability, defaults, auto increment and on-update attributes reject readiness',async()=>{
 for(const option of [{badType:'varchar(1)'},{badNull:true},{badDefault:true},{badExtra:true}])await assert.rejects(gate.ensureAndVerify(fake(option)),/attributes differ/);
});
test('unavailable or session-broken named locks reject readiness',async()=>{
 await assert.rejects(gate.ensureAndVerify(fake({lock:false})),/capability/);await assert.rejects(gate.ensureAndVerify(fake({release:false})),/release/);
});
test('workflow runs preflight before dist switch and PM2 restart',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/deploy.yml'),'utf8');
 const gateAt=workflow.indexOf('node "$RELEASE_DIR/prepare-miban-supplier-deploy.cjs"');assert(gateAt>0);assert(gateAt<workflow.indexOf('mv -Tf "$APP_DIR/.dist-next"'));assert(gateAt<workflow.indexOf('pm2 restart'));
});
