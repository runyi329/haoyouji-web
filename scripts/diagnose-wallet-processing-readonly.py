#!/usr/bin/env python3
"""Finite read-only wallet request diagnostics; no app imports, DB, PM2 CLI, service changes or file writes."""
import os, re, json, time, http.client, subprocess

def emit(label, value):
    print(json.dumps({'label':label,'data':value},ensure_ascii=True),flush=True)
def read(path, limit=100000):
    with open(path,'r',errors='replace') as f: return f.read(limit)
def tail(path, limit=262144):
    with open(path,'rb') as f:
        f.seek(0,2); size=f.tell(); f.seek(max(0,size-limit)); return f.read(limit).decode('utf8','replace')
def cmd(args):
    return subprocess.check_output(args,timeout=8,stderr=subprocess.DEVNULL,text=True,env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','LC_ALL':'C'})
emit('read_only',True)
emit('utc_time',time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
emit('loadavg',read('/proc/loadavg',200).strip())
emit('cpu_count',os.cpu_count())
memory={}
for line in read('/proc/meminfo',10000).splitlines():
    m=re.match(r'(MemTotal|MemAvailable|SwapTotal|SwapFree):\s+(\d+)',line)
    if m: memory[m[1]+'_kB']=int(m[2])
emit('memory',memory)
try:
    lines=cmd(['ps','-eo','pid,comm,pcpu,pmem,rss,etime','--sort=-pcpu']).splitlines()
    emit('top_processes',lines[:13])
except Exception as e: emit('ps_error',type(e).__name__)
node=[]
for item in os.listdir('/proc'):
    if not item.isdigit(): continue
    p='/proc/'+item
    try:
        if read(p+'/comm',100).strip() not in ('node','nodejs'):continue
        cwd=os.readlink(p+'/cwd'); env={}
        raw=open(p+'/environ','rb').read(262144)
        for pair in raw.split(b'\0'):
            k,sep,v=pair.partition(b'=')
            if sep and k in (b'PORT',b'NODE_APP_INSTANCE',b'NODE_ENV',b'PM2_HOME'):env[k.decode()]=v.decode(errors='replace')[:100]
        node.append({'pid':int(item),'cwd':cwd,'safe_env':env})
    except OSError:pass
emit('node_processes',node[:15])
for root in ('/home/ubuntu/haoyouji-web','/root/haoyouji-web'):
    for suffix in ('/dist/.deployed-commit','/.deployed-commit'):
        try:
            sha=read(root+suffix,100).strip()
            if re.fullmatch('[a-f0-9]{40}',sha):emit('deployed_commit',{'path':root+suffix,'sha':sha})
        except OSError:pass
# Parse only path/status/time metadata; never expose request arguments, IPs, auth or user payloads.
logs=['/var/log/nginx/access.log','/www/wwwlogs/jiangyuchen.cn.log','/www/wwwlogs/jiangyuchen.cn-access.log']
for path in logs:
    if not os.path.isfile(path):continue
    records=[]
    for line in tail(path).splitlines():
        m=re.search(r'\[([^\]]+)\]\s+"(GET|POST)\s+([^\s]+)\s+HTTP/[^\"]+"\s+(\d{3})',line)
        if not m:continue
        timestamp,method,url,status=m.groups(); route=url.split('?',1)[0]
        if not any(key in route for key in ('walletAdjust','WalletAdjust','walletSnapshot','walletBalanceTrend','afGetMyRechargeHistory','adminUser.list','multiAssetWalletHistory')):continue
        times={k:v for k,v in re.findall(r'(request_time|upstream_response_time|rt|urt)[=:]\s*"?([0-9.]+)',line)}
        records.append({'time':timestamp,'method':method,'route':route[:300],'status':int(status),'durations_if_logged':times})
    emit('wallet_request_log',{'path':path,'records':records[-45:]})
for home in ('/home/ubuntu/.pm2/logs','/root/.pm2/logs'):
    if not os.path.isdir(home):continue
    for name in os.listdir(home):
        if not re.match(r'haoyouji.*(?:error|out)\.log$',name):continue
        lines=[]
        for line in tail(home+'/'+name,60000).splitlines():
            if not re.search(r'(pool is closed|too many connections|lock wait|deadlock|ECONNRESET|ETIMEDOUT|ENOTFOUND|walletAdjust|multiAssetWalletAdjust|Authentication context unavailable)',line,re.I):continue
            # Emit category only, never raw message/SQL/payload.
            categories=re.findall(r'pool is closed|too many connections|lock wait|deadlock|ECONNRESET|ETIMEDOUT|ENOTFOUND|walletAdjust|multiAssetWalletAdjust|Authentication context unavailable',line,re.I)
            lines.append({'categories':categories})
        emit('app_error_categories',{'log':home+'/'+name,'recent_matches':lines[-20:]})
for port in sorted({int(n['safe_env']['PORT']) for n in node if n['safe_env'].get('PORT','').isdigit()} | {3000}):
    if not 0<port<65536:continue
    c=http.client.HTTPConnection('127.0.0.1',port,timeout=4)
    start=time.monotonic()
    try:
        c.request('GET','/',headers={'Host':'jiangyuchen.cn','Connection':'close'})
        response=c.getresponse();response.read(1024)
        emit('anonymous_loopback_response',{'port':port,'status':response.status,'elapsedMs':round((time.monotonic()-start)*1000)})
    except Exception as e:emit('anonymous_loopback_response',{'port':port,'error':type(e).__name__,'elapsedMs':round((time.monotonic()-start)*1000)})
    finally:c.close()

# Inspect only safe PM2 fields; never invoke PM2 or output application secrets.
for home in ('/home/ubuntu/.pm2','/root/.pm2'):
    try:
        dump=json.loads(read(home+'/dump.pm2',4000000))
        for item in dump:
            env=item.get('pm2_env',item)
            safe={k:env.get(k) for k in ('name','pm_cwd','pm_exec_path','max_memory_restart','restart_time','unstable_restarts','pm_uptime','exec_mode') if k in env}
            emit('pm2_saved_limits',safe)
    except (OSError,ValueError,TypeError):pass
    try:
        records=[]
        for line in tail(home+'/pm2.log',120000).splitlines():
            if re.search(r'memory|exceed|restart|exited|errored|online',line,re.I):
                cleaned=re.sub(r"'(?:[^'\\]|\\.)*'","'?'",line)
                records.append(cleaned[:260])
        emit('pm2_lifecycle_log',{'home':home,'recent':records[-28:]})
    except OSError:pass
actual_nodes=[]
for item in os.listdir('/proc'):
    if not item.isdigit():continue
    try:
        exe=os.readlink('/proc/'+item+'/exe')
        if os.path.basename(exe) not in ('node','nodejs'):continue
        raw=open('/proc/'+item+'/cmdline','rb').read(10000)
        if b'God Daemon' in raw:continue
        status=read('/proc/'+item+'/status',10000)
        mem={k:int(v) for k,v in re.findall(r'^(VmRSS|VmHWM|VmSwap|Threads):\s+(\d+)',status,re.M)}
        actual_nodes.append({'pid':int(item),'cwd':os.readlink('/proc/'+item+'/cwd'),'memory':mem})
    except OSError:pass
emit('actual_node_processes',actual_nodes)
# Locate the effective log path from known nginx config directories without emitting configs.
import glob
found=set()
for pattern in ('/etc/nginx/nginx.conf','/etc/nginx/sites-enabled/*','/etc/nginx/conf.d/*.conf'):
    for config in glob.glob(pattern):
        if not os.path.isfile(config):continue
        try:text=read(config,150000)
        except OSError:continue
        for path in re.findall(r'\baccess_log\s+(/[^\s;]+)',text):
            if re.fullmatch(r'/[A-Za-z0-9_.\-/]+',path):found.add(path)
for path in sorted(found):
    try:data=tail(path,800000)
    except OSError:continue
    records=[]
    for line in data.splitlines():
        m=re.search(r'\[([^\]]+)\]\s+"(GET|POST)\s+([^\s]+)\s+HTTP/[^\"]+"\s+(\d{3})',line)
        if not m:continue
        timestamp,method,url,status=m.groups();route=url.split('?',1)[0]
        if not any(x in route for x in ('walletAdjust','WalletAdjust','walletSnapshot','walletBalanceTrend','afGetMyRechargeHistory','adminUser.list')):continue
        times={k:v for k,v in re.findall(r'(request_time|upstream_response_time|rt|urt)[=:]\s*"?([0-9.]+)',line)}
        records.append({'time':timestamp,'method':method,'route':route[:300],'status':int(status),'durations_if_logged':times})
    emit('effective_wallet_access_log',{'path':path,'recent':records[-25:]})
