#!/usr/bin/env python3
"""Read-only PM2 boot/port diagnostic; intended invocation: sudo -n python3 -.

No PM2 CLI, shell, database, service mutation, file writes, config execution,
logs, full argv, full Environment, or full HTTP response is used. Run only when
explicitly authorized. This file's local validation must compile, not execute it.
"""

import errno
import http.client
import json
import os
import pwd
import re
import shlex
import subprocess

EXPECTED_COMMIT = "6cb774158d6c106253e5fbea66108cf0774c7787"
PROJECTS = ("/home/ubuntu/haoyouji-web", "/root/haoyouji-web")
PORTS = (3000, 3001, 3002)
UNRESOLVED = "unresolved"
REDACTED = "redacted_unsafe"
SAFE_PATH_RE = re.compile(r"/[A-Za-z0-9_./@+\-]{0,510}\Z")
SAFE_NAME_RE = re.compile(r"[A-Za-z0-9_.@+\-]{1,96}\Z")
SCRIPT_RE = re.compile(r"/[A-Za-z0-9_./@+\-]+\.(?:js|cjs|mjs)\Z")
ASSET_RE = re.compile(r"/assets/index[A-Za-z0-9_.\-]*\.(?:js|css)(?=[\s\"'<>?#]|$)")
FIELD_NAMES = ("name", "pm_id", "pm_exec_path", "pm_cwd", "exec_interpreter", "exec_mode", "instances")
ENV_NAMES = ("name", "pm_id", "PORT", "PM2_HOME", "NODE_APP_INSTANCE")


class Report:
    """JSON Lines only; hard total limit below 20 KiB, with section budgets."""
    def __init__(self):
        self.total = 0
        self.used = {}
        self.omitted = {}
        self.limits = {"meta": 500, "host": 700, "dumps": 3200,
                       "systemd": 3500, "processes": 4600, "sockets": 1300,
                       "filesystem": 4600, "http": 1500}

    def emit(self, section, record):
        record = dict(record)
        record["section"] = section
        encoded = (json.dumps(record, ensure_ascii=True, separators=(",", ":")) + "\n").encode("ascii")
        if (self.total + len(encoded) > 19500 or
                self.used.get(section, 0) + len(encoded) > self.limits.get(section, 500)):
            self.omitted[section] = self.omitted.get(section, 0) + 1
            return
        os.write(1, encoded)
        self.total += len(encoded)
        self.used[section] = self.used.get(section, 0) + len(encoded)

    def finish(self):
        record = {"section": "summary", "records_omitted_by_output_budget": self.omitted,
                  "output_limit_bytes": 20480, "read_only": True}
        encoded = (json.dumps(record, separators=(",", ":")) + "\n").encode("ascii")
        if self.total + len(encoded) <= 20480:
            os.write(1, encoded)


REPORT = Report()


def error_info(exc):
    # Do not expose exception messages: they can contain source, argv or HTML.
    out = {"error": type(exc).__name__}
    number = getattr(exc, "errno", None)
    if isinstance(number, int):
        out["errno"] = number
    return out


def read_bytes(path, limit):
    with open(path, "rb") as handle:
        data = handle.read(limit + 1)
    return data[:limit], len(data) > limit


def text(path, limit):
    data, truncated = read_bytes(path, limit)
    return data.decode("utf-8", "replace"), truncated


def safe_path(value):
    if not isinstance(value, str):
        return UNRESOLVED
    return value if SAFE_PATH_RE.fullmatch(value) else REDACTED


def safe_name(value):
    if not isinstance(value, str):
        return UNRESOLVED
    return value if SAFE_NAME_RE.fullmatch(value) else REDACTED


def safe_integer(value, minimum=0, maximum=1000000000):
    if isinstance(value, bool):
        return UNRESOLVED
    if isinstance(value, int) or (isinstance(value, str) and re.fullmatch(r"\d{1,10}", value)):
        number = int(value)
        if minimum <= number <= maximum:
            return number
    return UNRESOLVED


def safe_field(key, value):
    if key in ("cwd", "script"):
        if not isinstance(value, str):
            return UNRESOLVED
        return value if re.fullmatch(r"[A-Za-z0-9_./@+\-]{1,512}", value) else REDACTED
    if key in ("pm_exec_path", "pm_cwd", "PM2_HOME"):
        return safe_path(value)
    if key in ("exec_interpreter", "interpreter"):
        return safe_path(value) if isinstance(value, str) and value.startswith("/") else safe_name(value)
    if key == "PORT":
        return safe_integer(value, 1, 65535)
    if key in ("pm_id", "NODE_APP_INSTANCE"):
        return safe_integer(value)
    if key == "instances":
        return "max" if value == "max" else safe_integer(value, -1, 10000)
    if key == "exec_mode":
        return value if value in ("fork", "cluster", "fork_mode", "cluster_mode") else UNRESOLVED
    return safe_name(value)


def run_tool(tool, args, limit=65536):
    # Only fixed OS tools and fixed read-only arguments. No shell or inherited
    # application environment; stderr (which may contain secrets) is discarded.
    if tool not in ("systemctl", "ss"):
        raise ValueError("unsupported tool")
    executable = next((directory + "/" + tool for directory in
                       ("/usr/bin", "/bin", "/usr/sbin", "/sbin")
                       if os.path.isfile(directory + "/" + tool)), None)
    if executable is None:
        raise FileNotFoundError(errno.ENOENT, "missing tool")
    result = subprocess.run([executable] + list(args), stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=5, check=False, shell=False, close_fds=True,
                            env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LC_ALL": "C",
                                 "SYSTEMD_PAGER": "", "SYSTEMD_COLORS": "0"})
    return result.returncode, result.stdout[:limit].decode("utf-8", "replace"), len(result.stdout) > limit


def host_section():
    system = os.uname()
    REPORT.emit("host", {"kernel": safe_name(system.sysname), "release": safe_name(system.release),
                         "machine": safe_name(system.machine)})
    try:
        value, _ = text("/proc/uptime", 256)
        token = value.split()[0]
        REPORT.emit("host", {"uptime_seconds": float(token) if re.fullmatch(r"\d+\.\d+", token) else UNRESOLVED})
    except Exception as exc:
        REPORT.emit("host", {"source": "/proc/uptime", **error_info(exc)})
    try:
        value, _ = text("/proc/meminfo", 16384)
        selected = {}
        for line in value.splitlines():
            match = re.fullmatch(r"(MemTotal|MemAvailable|MemFree|SwapTotal|SwapFree):\s+(\d+) kB", line)
            if match:
                selected[match.group(1) + "_kB"] = int(match.group(2))
        REPORT.emit("host", {"memory": selected})
    except Exception as exc:
        REPORT.emit("host", {"source": "/proc/meminfo", **error_info(exc)})


def dumps_section():
    for home in ("/root/.pm2", "/home/ubuntu/.pm2"):
        for basename in ("dump.pm2", "dump.pm2.bak"):
            path = home + "/" + basename
            try:
                raw, truncated = text(path, 2 * 1024 * 1024)
                if truncated:
                    REPORT.emit("dumps", {"path": path, "status": "input_size_limit"})
                    continue
                data = json.loads(raw)
                if not isinstance(data, list):
                    REPORT.emit("dumps", {"path": path, "status": "unresolved_not_array"})
                    continue
                REPORT.emit("dumps", {"path": path, "entries": len(data)})
                for index, item in enumerate(data[:48]):
                    if not isinstance(item, dict):
                        continue
                    nested = item.get("pm2_env", {})
                    nested = nested if isinstance(nested, dict) else {}
                    fields = {}
                    for key in FIELD_NAMES:
                        if key in item or key in nested:
                            fields[key] = safe_field(key, item.get(key, nested.get(key)))
                    for env in (item.get("env"), nested.get("env")):
                        if isinstance(env, dict) and "PORT" in env:
                            fields["PORT"] = safe_field("PORT", env["PORT"])
                            break
                    REPORT.emit("dumps", {"path": path, "entry": index, "fields": fields})
                if len(data) > 48:
                    REPORT.emit("dumps", {"path": path, "entry_scan_limit": 48})
            except FileNotFoundError:
                REPORT.emit("dumps", {"path": path, "exists": False})
            except Exception as exc:
                REPORT.emit("dumps", {"path": path, **error_info(exc)})


def scripts_from_arguments(arguments):
    scripts = set()
    for arg in arguments:
        if SCRIPT_RE.fullmatch(arg):
            scripts.add(arg)
        # PM2 can replace argv with a title such as "node /absolute/index.js".
        # Only extract whitespace-delimited absolute JS paths, never the title.
        elif arg.startswith(("node ", "nodejs ")):
            for token in arg.split()[1:]:
                if SCRIPT_RE.fullmatch(token):
                    scripts.add(token)
    return sorted(scripts)[:12]


def sanitized_execstart(raw):
    # systemctl show's ExecStart can contain secrets in argv. Never return raw.
    match = re.search(r"(?:^|\s)path=([^ ;}]+)", raw)
    executable = safe_path(match.group(1)) if match else UNRESOLVED
    argument_match = re.search(r"argv\[\]=(.*?)(?:\s;|;\s|\s\})", raw)
    args = []
    if argument_match:
        try:
            args = shlex.split(argument_match.group(1))[:128]
        except ValueError:
            pass
    actions = sorted({arg for arg in args if arg in ("resurrect", "kill", "reload", "restart", "start", "stop", "save")})
    return {"executable": executable, "pm2_actions": actions,
            "script_paths": scripts_from_arguments(args), "other_arguments": "omitted"}


def pm2_home_from_unit(path):
    if not path or safe_path(path) == REDACTED:
        return {"PM2_HOME": UNRESOLVED}
    source, truncated = text(path, 131072)
    values = []
    for line in source.splitlines():
        # Ignore comments; inspect only relevant assignments, never emit lines.
        if not re.match(r"\s*(?:Environment|ExecStart)\s*=", line):
            continue
        for match in re.finditer(r"(?<![A-Za-z0-9_])PM2_HOME\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"';]+))", line):
            raw = next((part for part in match.groups() if part is not None), "")
            values.append(safe_path(raw) if "$" not in raw and "%" not in raw else UNRESOLVED)
    return {"PM2_HOME": list(dict.fromkeys(values))[:8] or UNRESOLVED, "input_truncated": truncated}


def systemd_section():
    units = set()
    fragments = {}
    for verb in ("list-units", "list-unit-files"):
        try:
            rc, output, truncated = run_tool("systemctl", [verb, "--all", "--type=service",
                                            "--no-pager", "--no-legend", "--plain", "pm2*.service"])
            for name in re.findall(r"(?m)^\s*(pm2[A-Za-z0-9_.@\-]*\.service)\s", output):
                units.add(name)
            REPORT.emit("systemd", {"query": verb, "returncode": rc, "output_truncated": truncated})
        except Exception as exc:
            REPORT.emit("systemd", {"query": verb, **error_info(exc)})
    # On-disk units are inspectable even if systemd's bus is unavailable.
    for directory in ("/etc/systemd/system", "/run/systemd/system", "/usr/lib/systemd/system", "/lib/systemd/system"):
        try:
            for name in os.listdir(directory):
                if re.fullmatch(r"pm2[A-Za-z0-9_.@\-]*\.service", name):
                    units.add(name)
                    fragments.setdefault(name, directory + "/" + name)
        except OSError:
            pass
    REPORT.emit("systemd", {"units": sorted(units)[:32], "unit_scan_limit": 32})
    properties = ("User", "FragmentPath", "ActiveState", "UnitFileState", "ExecStart", "MainPID")
    for unit in sorted(units)[:32]:
        fragment = fragments.get(unit)
        try:
            rc, output, truncated = run_tool("systemctl", ["show", "--no-pager", "--property=" + ",".join(properties), unit], 32768)
            fields = {}
            for line in output.splitlines():
                key, separator, value = line.partition("=")
                if not separator or key not in properties:
                    continue
                if key == "ExecStart":
                    fields[key] = sanitized_execstart(value) if value else {"empty": True}
                elif key == "FragmentPath":
                    fields[key] = safe_path(value) if value else ""
                    if value and SAFE_PATH_RE.fullmatch(value):
                        fragment = value
                elif key == "MainPID":
                    fields[key] = safe_integer(value)
                else:
                    fields[key] = safe_name(value) if value else ""
            REPORT.emit("systemd", {"unit": unit, "show": fields, "returncode": rc, "output_truncated": truncated})
        except Exception as exc:
            REPORT.emit("systemd", {"unit": unit, "operation": "show", **error_info(exc)})
        if fragment:
            try:
                REPORT.emit("systemd", {"unit": unit, "unit_file": safe_path(fragment), **pm2_home_from_unit(fragment)})
            except Exception as exc:
                REPORT.emit("systemd", {"unit": unit, "operation": "read_PM2_HOME", **error_info(exc)})
        else:
            REPORT.emit("systemd", {"unit": unit, "PM2_HOME": UNRESOLVED})


def processes_section():
    candidates = []
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        directory = "/proc/" + name
        try:
            raw, truncated = read_bytes(directory + "/cmdline", 65536)
            args = [part.decode("utf-8", "replace") for part in raw.split(b"\0") if part]
            comm, _ = text(directory + "/comm", 256)
            try:
                exe_raw = os.readlink(directory + "/exe")
            except OSError:
                exe_raw = ""
            pm2_daemon = bool(args and re.match(r"^PM2(?:\s|$)", args[0]) and "God Daemon" in args[0])
            exe_clean = exe_raw[:-10] if exe_raw.endswith(" (deleted)") else exe_raw
            node = (os.path.basename(exe_clean) in ("node", "nodejs") or
                    comm.strip() in ("node", "nodejs"))
            if not (pm2_daemon or node):
                continue
            candidates.append((not pm2_daemon, int(name), directory, args, exe_raw, truncated))
        except (OSError, ValueError):
            continue
    candidates.sort()
    REPORT.emit("processes", {"matched_processes": len(candidates), "scan_limit": 64,
                              "selection": "PM2 God Daemon or node/nodejs; no full cmdline"})
    for not_daemon, pid, directory, args, exe_raw, cmd_truncated in candidates[:64]:
        record = {"pid": pid, "kind": "node" if not_daemon else "PM2_daemon",
                  "exe": safe_path(exe_raw[:-10] if exe_raw.endswith(" (deleted)") else exe_raw),
                  "exe_deleted": exe_raw.endswith(" (deleted)"),
                  "scripts": scripts_from_arguments(args), "cmdline_input_truncated": cmd_truncated}
        try:
            uid = os.stat(directory).st_uid
            try:
                record["username"] = safe_name(pwd.getpwuid(uid).pw_name)
            except KeyError:
                record["username"] = UNRESOLVED
            status, _ = text(directory + "/status", 16384)
            match = re.search(r"(?m)^PPid:\s*(\d+)$", status)
            record["ppid"] = int(match.group(1)) if match else UNRESOLVED
        except Exception as exc:
            record["identity_error"] = error_info(exc)
        try:
            record["cwd"] = safe_path(os.readlink(directory + "/cwd"))
        except Exception as exc:
            record["cwd_error"] = error_info(exc)
        try:
            environment, env_truncated = read_bytes(directory + "/environ", 262144)
            selected = {}
            for pair in environment.split(b"\0"):
                key, separator, value = pair.partition(b"=")
                if separator and key in tuple(item.encode("ascii") for item in ENV_NAMES):
                    decoded_key = key.decode("ascii")
                    selected[decoded_key] = safe_field(decoded_key, value.decode("utf-8", "replace"))
            record["env_allowlist"] = selected
            record["environ_input_truncated"] = env_truncated
        except Exception as exc:
            record["env_error"] = error_info(exc)
        REPORT.emit("processes", record)


def sockets_section():
    rc, output, truncated = run_tool("ss", ["-H", "-ltnp", "( sport = :3000 or sport = :3001 or sport = :3002 )"], 65536)
    records = []
    for line in output.splitlines():
        columns = line.split()
        if len(columns) < 5:
            continue
        local = columns[3]
        port_text = local.rsplit(":", 1)[-1]
        if not port_text.isdigit() or int(port_text) not in PORTS:
            continue
        owners = [{"pid": int(pid), "process_name": safe_name(name)}
                  for name, pid in re.findall(r'\("([^"\n]{1,96})",pid=(\d+),fd=\d+\)', line)][:16]
        records.append({"port": int(port_text), "owners": owners})
    REPORT.emit("sockets", {"returncode": rc, "output_truncated": truncated,
                            "listeners": records[:24], "listener_scan_limit": 24})


def entries_from_html(source):
    # Return only bounded static /assets/index*.js/css paths, never HTML/data.
    return sorted(set(ASSET_RE.findall(source)))[:12]


def index_info(path):
    try:
        size = os.stat(path).st_size
        source, truncated = text(path, 16384)
        return {"exists": True, "size_bytes": size, "entry_assets": entries_from_html(source),
                "input_truncated": truncated}
    except FileNotFoundError:
        return {"exists": False}
    except Exception as exc:
        return error_info(exc)


def commit_info(path):
    try:
        value, truncated = text(path, 256)
        value = value.strip()
        return {"exists": True, "commit": value.lower() if not truncated and re.fullmatch(r"[0-9a-fA-F]{40}", value) else UNRESOLVED}
    except FileNotFoundError:
        return {"exists": False}
    except Exception as exc:
        return error_info(exc)


def parse_literal(raw):
    raw = raw.strip()
    if re.fullmatch(r"-?\d{1,10}", raw):
        return int(raw)
    if len(raw) < 2 or raw[0] not in "\"'" or raw[-1] != raw[0]:
        return UNRESOLVED
    inner = raw[1:-1]
    # Conservatively refuse escapes, interpolation, embedded delimiters or
    # expressions. No eval/exec/require or JavaScript runtime is ever invoked.
    if "\\" in inner or raw[0] in inner or "$" in inner or "`" in inner:
        return UNRESOLVED
    return inner


def ecosystem_info(path):
    try:
        source, truncated = text(path, 131072)
        # Lexically remove comments; preserve quoted strings. Regex matching only.
        token = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/')
        source = token.sub(lambda match: " " if match.group(0).startswith(("//", "/*")) else match.group(0), source)
        keys = "name|script|cwd|interpreter|exec_mode|instances|PORT"
        pattern = re.compile(r"(?<![\w$])(?P<quote>[\"']?)(?P<key>" + keys + r")(?P=quote)\s*:\s*(?P<raw>[^\r\n,}]*)(?=[,}\r\n]|$)")
        values = []
        for match in pattern.finditer(source):
            key = match.group("key")
            literal = parse_literal(match.group("raw"))
            value = UNRESOLVED if literal == UNRESOLVED else safe_field(key, literal)
            values.append({"field": key, "value": value})
            if len(values) == 48:
                break
        return {"exists": True, "regex_only": True, "fields_in_source_order": values,
                "input_truncated": truncated, "field_scan_limit": 48}
    except FileNotFoundError:
        return {"exists": False}
    except Exception as exc:
        return error_info(exc)


def release_roots():
    roots = set()
    for project in PROJECTS:
        for name in ("releases", ".releases", "dist-releases", ".deploy-releases"):
            roots.add(project + "/" + name)
        parent = os.path.dirname(project)
        roots.add(parent + "/haoyouji-web-releases")
        roots.add(parent + "/releases/haoyouji-web")
        # Existing immediate project/sibling directories whose basename indicates
        # releases. Never print other directory contents or recursively traverse.
        for container in (project, parent):
            try:
                for entry in os.scandir(container):
                    if re.fullmatch(r"[A-Za-z0-9_.\-]*releases?[A-Za-z0-9_.\-]*", entry.name) and entry.is_dir():
                        roots.add(entry.path)
            except OSError:
                pass
        real = os.path.realpath(project + "/dist")
        # Derive the release collection from the current dist symlink if present.
        if real != project + "/dist":
            for ancestor in (os.path.dirname(real), os.path.dirname(os.path.dirname(real))):
                if ancestor.startswith(("/home/ubuntu/", "/root/")) and SAFE_PATH_RE.fullmatch(ancestor):
                    basename = os.path.basename(ancestor)
                    if "release" in basename:
                        roots.add(ancestor)
                    if re.fullmatch(r"(?:release-|dist-)?[0-9a-f]{40}", basename):
                        roots.add(os.path.dirname(ancestor))
            if re.fullmatch(r"(?:release-|dist-)?[0-9a-f]{40}", os.path.basename(real)):
                roots.add(os.path.dirname(real))
    return sorted(roots)


def releases_section():
    existing_roots = []
    for root in release_roots()[:32]:
        if not os.path.isdir(root):
            continue
        existing_roots.append(root)
        try:
            entries = []
            scanned = 0
            with os.scandir(root) as iterator:
                for entry in iterator:
                    scanned += 1
                    if scanned > 4096:
                        break
                    try:
                        if entry.is_dir():
                            entries.append((entry.stat().st_mtime_ns, entry.name))
                    except OSError:
                        continue
            entries.sort(reverse=True)
            REPORT.emit("filesystem", {"release_root": safe_path(root), "latest_12_basenames_by_mtime":
                                        [safe_name(name) for _, name in entries[:12]], "directory_scan_truncated": scanned > 4096})
            target_names = {EXPECTED_COMMIT, "release-" + EXPECTED_COMMIT, "dist-" + EXPECTED_COMMIT}
            target_names.update(name for _, name in entries if EXPECTED_COMMIT in name and SAFE_NAME_RE.fullmatch(name))
            existing_targets = []
            for name in sorted(target_names):
                target = root + "/" + name
                if not os.path.isdir(target):
                    continue
                existing_targets.append({"basename": safe_name(name), "exists": True,
                                         "public_index": index_info(target + "/public/index.html"),
                                         "dist_public_index": index_info(target + "/dist/public/index.html")})
            REPORT.emit("filesystem", {"release_root": safe_path(root), "expected_commit": EXPECTED_COMMIT,
                                        "expected_target_exists": bool(existing_targets), "targets": existing_targets[:4]})
        except Exception as exc:
            REPORT.emit("filesystem", {"release_root": safe_path(root), **error_info(exc)})
    REPORT.emit("filesystem", {"existing_release_roots_checked": len(existing_roots),
                                "expected_commit": EXPECTED_COMMIT, "discovery": "bounded known paths, immediate release-named directories and current dist realpath"})


def filesystem_section():
    for project in PROJECTS:
        dist = project + "/dist"
        try:
            exists = os.path.lexists(dist)
            record = {"dist": dist, "exists": exists, "is_symlink": os.path.islink(dist),
                      "realpath": safe_path(os.path.realpath(dist)),
                      "realpath_exists": os.path.exists(dist)}
            if record["is_symlink"]:
                link = os.readlink(dist)
                # readlink may be relative; allow path-only syntax without secrets.
                record["readlink"] = link if re.fullmatch(r"[A-Za-z0-9_./@+\-]{1,512}", link) else REDACTED
            else:
                record["readlink"] = "not_symlink"
            record["deployed_commit"] = commit_info(dist + "/.deployed-commit")
            record["project_deployed_commit"] = commit_info(project + "/.deployed-commit")
            record["public_index"] = index_info(dist + "/public/index.html")
            REPORT.emit("filesystem", record)
        except Exception as exc:
            REPORT.emit("filesystem", {"dist": dist, **error_info(exc)})
        for basename in ("ecosystem.config.cjs", "ecosystem.config.js"):
            path = project + "/" + basename
            REPORT.emit("filesystem", {"ecosystem": path, **ecosystem_info(path)})
    releases_section()


def http_section():
    for port in PORTS:
        connection = None
        try:
            # Literal loopback, no proxy, no redirect, no cookies/auth, no asset
            # requests. Exactly GET /; read at most the first 16 KiB of the body.
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            connection.request("GET", "/", headers={"Host": "localhost:" + str(port),
                                                      "Connection": "close", "Accept-Encoding": "identity"})
            response = connection.getresponse()
            raw_type = (response.getheader("Content-Type") or "").split(";", 1)[0].strip().lower()
            mime = raw_type if re.fullmatch(r"[a-z0-9.+\-]{1,48}/[a-z0-9.+\-]{1,48}", raw_type) else UNRESOLVED
            data = response.read(16384)
            assets = entries_from_html(data.decode("utf-8", "replace")) if mime in ("text/html", "application/xhtml+xml") else []
            REPORT.emit("http", {"port": port, "method": "GET", "path": "/", "status": response.status,
                                 "content_type": mime, "body_bytes_read": len(data), "body_read_limit": 16384,
                                 "entry_assets": assets})
        except Exception as exc:
            REPORT.emit("http", {"port": port, **error_info(exc)})
        finally:
            if connection is not None:
                connection.close()


def main():
    REPORT.emit("meta", {"diagnostic": "pm2-boot-readonly", "expected_commit": EXPECTED_COMMIT,
                         "pm2_cli_invoked": False, "configuration_executed": False,
                         "env_output": "strict allowlist only", "ExecStart_output": "sanitized; arguments omitted"})
    for section, function in (("host", host_section), ("dumps", dumps_section),
                              ("systemd", systemd_section), ("processes", processes_section),
                              ("sockets", sockets_section), ("filesystem", filesystem_section),
                              ("http", http_section)):
        try:
            function()
        except Exception as exc:
            REPORT.emit(section, {"section_failed": True, **error_info(exc)})
    REPORT.finish()


if __name__ == "__main__":
    main()
