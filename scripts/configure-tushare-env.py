#!/usr/bin/env python3
"""Install the already authorized market token from stdin; never log its value."""
import os
import re
import shutil
import stat
import sys
import tempfile
import uuid
from pathlib import Path


def configure(filename, token):
    if not re.fullmatch(r"[a-fA-F0-9]{40,128}", token):
        raise ValueError("Invalid market token format")
    path = Path(filename).resolve(strict=True)
    original = path.read_bytes()
    status = path.stat()
    text = original.decode("utf-8")
    lines = text.splitlines(keepends=True)
    new_lines = [line for line in lines if not re.match(r"^\s*(?:export\s+)?TUSHARE_TOKEN\s*=", line)]
    updated = "".join(new_lines)
    if updated and not updated.endswith("\n"):
        updated += "\n"
    updated += "TUSHARE_TOKEN=" + token + "\n"
    encoded = updated.encode("utf-8")
    if encoded == original:
        return False
    backup = path.with_name(path.name + ".before-tushare-" + uuid.uuid4().hex)
    backup_fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(backup_fd, "wb") as output:
        output.write(original)
        output.flush()
        os.fsync(output.fileno())
    fd, temporary = tempfile.mkstemp(prefix=".tushare-env-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), stat.S_IMODE(status.st_mode))
            if os.geteuid() == 0:
                os.fchown(output.fileno(), status.st_uid, status.st_gid)
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Expected the existing environment file path")
    try:
        changed = configure(sys.argv[1], sys.stdin.read(256).strip())
    except Exception:
        raise SystemExit("Market runtime configuration failed; credentials were not logged")
    print("Market runtime configuration updated with backup." if changed else "Market runtime configuration already current.")
