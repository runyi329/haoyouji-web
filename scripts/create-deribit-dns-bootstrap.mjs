import dns from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = 'www.deribit.com';
function publicIPv4(value) {
  if (typeof value !== 'string' || isIP(value) !== 4) return false;
  const [a,b,c] = value.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127)
    || (a===169 && b===254) || (a===172 && b>=16 && b<=31)
    || (a===192 && (b===168 || b===0 || (b===88 && c===99)))
    || (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
}
function verifyOfficialAddress(address, now = Date.now) {
  return new Promise((resolve, reject) => {
    const request = https.get({hostname:HOST,port:443,path:'/api/v2/public/get_time',method:'GET',
      servername:HOST,family:4,rejectUnauthorized:true,
      lookup:(_hostname,_options,callback)=>callback(null,address,4),
      headers:{Host:HOST,Accept:'application/json'}}, response => {
      let size=0; const chunks=[];
      if(response.statusCode!==200) {request.destroy(new Error('Official TLS validation HTTP error'));return;}
      response.on('data', chunk=>{size+=chunk.length;if(size>65536)request.destroy(new Error('Official TLS validation body limit'));else chunks.push(chunk);});
      response.on('error',reject);
      response.on('aborted',()=>reject(new Error('Official TLS validation aborted')));
      response.on('end',()=>{
        try {
          const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(data.jsonrpc!=='2.0' || data.error || !Number.isFinite(data.result) || Math.abs(now()-data.result)>60000) throw new Error('Official TLS validation response invalid');
          resolve();
        } catch {reject(new Error('Official TLS validation response invalid'));}
      });
    });
    const timer=setTimeout(()=>request.destroy(new Error('Official TLS validation deadline')),5000);
    request.on('error',reject);request.on('close',()=>clearTimeout(timer));
  });
}

/** Only connection metadata. Every option price is still fetched from official HTTPS at runtime. */
export async function createDeribitDnsBootstrap(deps = {}) {
  const lookup=deps.resolve4 ?? (()=>dns.resolve4(HOST));
  const verify=deps.verify ?? verifyOfficialAddress;
  const now=deps.now ?? Date.now;
  const raw=await lookup();
  if(!Array.isArray(raw))throw new Error('DNS address list invalid');
  const candidates=Array.from(new Set(raw.filter(publicIPv4))).slice(0,4);
  const addresses=[];
  for(const address of candidates) {
    try {await verify(address);addresses.push(address);} catch { /* Try the next dynamically resolved public IPv4. */ }
    if(addresses.length===2)break;
  }
  if(!addresses.length)throw new Error('No official TLS-validated Deribit address available');
  return {hostname:HOST,addresses,resolvedAt:now(),kind:'deployment_dns_tls_validated'};
}
async function main() {
  const output=resolve(process.argv[2] ?? 'dist/deribit-dns-bootstrap.json');
  let timer;
  try {
    const seed=await Promise.race([createDeribitDnsBootstrap(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Deployment DNS bootstrap deadline')),20000);})]);
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,JSON.stringify(seed)+'\n',{mode:0o644});
    console.log('Deribit official TLS-validated DNS connection bootstrap created; no prices or credentials stored.');
  } catch {
    await unlink(output).catch(()=>{});
    console.warn('Deribit connection bootstrap unavailable; existing Gate primary and bounded runtime fallback remain unchanged.');
  } finally {clearTimeout(timer);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
