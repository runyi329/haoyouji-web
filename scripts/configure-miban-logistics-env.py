#!/usr/bin/env python3
"""Install only approved logistics settings from stdin. Never print credentials."""
import json
import os
import re
import stat
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlsplit

KEYS = {"KUAIDI100_KEY", "KUAIDI100_CUSTOMER", "KUAIDI100_SUBSCRIPTION_ENABLED", "KUAIDI100_CALLBACK_URL", "MIBAN_LOGISTICS_CACHE_DIR"}
CACHE = "/home/ubuntu/.local/share/haoyouji/miban-logistics"
CALLBACK = "https://jiangyuchen.cn/api/miban/logistics/kuaidi100/callback"


def validate(settings):
    if not isinstance(settings, dict) or set(settings) != KEYS:
        raise ValueError("Unexpected logistics settings")
    for key in ("KUAIDI100_KEY", "KUAIDI100_CUSTOMER"):
        if not isinstance(settings[key], str) or not re.fullmatch(r"[A-Za-z0-9_-]{6,1024}", settings[key]):
            raise ValueError("Invalid logistics credential")
    # HTTPS push has not been verified; deploying the query does not turn it on.
    if settings["KUAIDI100_SUBSCRIPTION_ENABLED"] != "false":
        raise ValueError("Automatic subscription must remain disabled until verified")
    if settings["KUAIDI100_CALLBACK_URL"] != CALLBACK or settings["MIBAN_LOGISTICS_CACHE_DIR"] != CACHE:
        raise ValueError("Unexpected logistics destination")
    return settings


def configure(filename, settings):
    settings = validate(settings)
    path = Path(filename)
    status = path.lstat()
    if not stat.S_ISREG(status.st_mode) or stat.S_ISLNK(status.st_mode):
        raise ValueError("Unsafe environment file")
    original = path.read_bytes()
    lines = original.decode("utf-8").splitlines(keepends=True)
    assignment = re.compile(r"^\s*(?:export\s+)?(" + "|".join(re.escape(key) for key in KEYS) + r")\s*=")
    updated = "".join(line for line in lines if not assignment.match(line))
    if updated and not updated.endswith("\n"):
        updated += "\n"
    updated += "".join(f"{key}={settings[key]}\n" for key in sorted(KEYS))
    encoded = updated.encode("utf-8")
    if encoded == original:
        return False
    backup = path.with_name(path.name + ".before-miban-logistics-" + uuid.uuid4().hex)
    backup_fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(backup_fd, "wb") as output:
        output.write(original)
        output.flush()
        os.fsync(output.fileno())
        if os.geteuid() == 0:
            os.fchown(output.fileno(), status.st_uid, status.st_gid)
    fd, temporary = tempfile.mkstemp(prefix=".miban-logistics-env-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o600)
            if os.geteuid() == 0:
                os.fchown(output.fileno(), status.st_uid, status.st_gid)
        if path.read_bytes() != original:
            raise ValueError("Environment changed concurrently")
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Expected the existing environment file path")
    try:
        payload = sys.stdin.read(8193)
        if len(payload) > 8192:
            raise ValueError("Configuration too large")
        changed = configure(sys.argv[1], json.loads(payload))
    except Exception:
        raise SystemExit("Logistics runtime configuration failed; credentials were not logged")
    print("Logistics configuration updated with private backup; subscriptions disabled." if changed else "Logistics configuration already current; subscriptions disabled.")
