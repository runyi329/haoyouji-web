#!/usr/bin/env python3
"""Offline tests; no real credentials, provider request, SSH or database."""
import importlib.util
import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("logistics_env", ROOT / "scripts/configure-miban-logistics-env.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def settings():
    return {"KUAIDI100_KEY": "offline_key_only", "KUAIDI100_CUSTOMER": "offline_customer_only", "KUAIDI100_SUBSCRIPTION_ENABLED": "false", "KUAIDI100_CALLBACK_URL": mod.CALLBACK, "MIBAN_LOGISTICS_CACHE_DIR": mod.CACHE}


class LogisticsDeploymentTests(unittest.TestCase):
    def test_preserves_unrelated_environment_and_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / ".env"
            file.write_text("JWT_SECRET=existing_secret\nDATABASE_URL=existing_database\nWALLET_SETTING=unchanged\nexport KUAIDI100_KEY=old_key\n")
            os.chmod(file, 0o644)
            self.assertTrue(mod.configure(file, settings()))
            self.assertFalse(mod.configure(file, settings()))
            text = file.read_text()
            for line in ["JWT_SECRET=existing_secret", "DATABASE_URL=existing_database", "WALLET_SETTING=unchanged"]:
                self.assertIn(line, text)
            self.assertNotIn("old_key", text)
            self.assertNotIn("DEV_BYPASS_AUTH", text)
            self.assertNotIn("FAST_PREVIEW", text)
            self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)
            backup = list(Path(directory).glob(".env.before-miban-logistics-*"))
            self.assertEqual(len(backup), 1)
            self.assertEqual(stat.S_IMODE(backup[0].stat().st_mode), 0o600)

    def test_rejects_unknown_preview_keys_and_unverified_push(self):
        for patch in [{"DEV_BYPASS_AUTH": "true"}, {"FAST_PREVIEW": "true"}, {"KUAIDI100_SUBSCRIPTION_ENABLED": "true"}, {"KUAIDI100_CALLBACK_URL": "http://unsafe.test/callback"}, {"MIBAN_LOGISTICS_CACHE_DIR": "/tmp/public"}, {"KUAIDI100_KEY": "bad\nJWT_SECRET=override"}]:
            with self.subTest(patch=patch):
                with self.assertRaises(ValueError):
                    mod.validate({**settings(), **patch})

    def test_rejects_symlink_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "real-env"
            target.write_text("KEEP=original\n")
            link = Path(directory) / ".env"
            link.symlink_to(target)
            with self.assertRaises(ValueError):
                mod.configure(link, settings())
            self.assertEqual(target.read_text(), "KEEP=original\n")

    def test_stdin_error_does_not_print_input(self):
        completed = subprocess.run(["python3", str(ROOT / "scripts/configure-miban-logistics-env.py"), "/nonexistent"], input="private-test-string", text=True, capture_output=True)
        self.assertNotEqual(completed.returncode, 0)
        self.assertNotIn("private-test-string", completed.stdout + completed.stderr)

    def test_pm2_override_fail_closed_and_private_directory(self):
        code = r'''
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verify, prepareDirectory, CACHE, CALLBACK } = require('./scripts/prepare-miban-logistics-deploy.cjs');
const env = { KUAIDI100_KEY:'offline_key', KUAIDI100_CUSTOMER:'offline_customer', KUAIDI100_SUBSCRIPTION_ENABLED:'false', KUAIDI100_CALLBACK_URL:CALLBACK, MIBAN_LOGISTICS_CACHE_DIR:CACHE };
assert.equal(verify(env,{apps:[{name:'haoyouji-web'}]},[]),true);
assert.throws(()=>verify(env,{apps:[{name:'haoyouji-web',env:{KUAIDI100_KEY:'wrong'}}]},[]));
assert.throws(()=>verify(env,{apps:[{name:'haoyouji-web'}]},[{name:'haoyouji-web',pm2_env:{KUAIDI100_SUBSCRIPTION_ENABLED:'true'}}]));
assert.throws(()=>verify({...env,KUAIDI100_CUSTOMER:''},{apps:[{name:'haoyouji-web'}]},[]));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'miban-logistics-preflight-'));
try {
 const dir=path.join(tmp,'private'); prepareDirectory(dir);
 assert.equal(fs.statSync(dir).mode & 0o777,0o700);
 const link=path.join(tmp,'link'); fs.symlinkSync(dir,link);
 assert.throws(()=>prepareDirectory(link));
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
console.log('PM2 preflight offline checks passed');
'''
        completed = subprocess.run(["node", "-e", code], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)


if __name__ == "__main__":
    unittest.main()
