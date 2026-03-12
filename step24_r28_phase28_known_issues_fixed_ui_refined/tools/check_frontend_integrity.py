#!/usr/bin/env python3
from __future__ import annotations
import argparse
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
JS_ROOT = ROOT / 'js'
INDEX_HTML = ROOT / 'index.html'


def find_js_files():
    return sorted(JS_ROOT.rglob('*.js'))


def run_node_check(files):
    errs = []
    for path in files:
        proc = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True, cwd=str(ROOT))
        if proc.returncode != 0:
            errs.append(f'[syntax] {path.relative_to(ROOT)}\n{proc.stderr.strip() or proc.stdout.strip()}')
    return errs


def collect_exports_imports(files):
    exports = {}
    imports = []
    for path in files:
        text = path.read_text(encoding='utf-8')
        ex = set()
        for m in re.finditer(r'export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)', text):
            ex.add(m.group(1))
        for m in re.finditer(r'export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)', text):
            ex.add(m.group(1))
        for m in re.finditer(r'export\s*\{([^}]*)\}', text, re.S):
            for part in m.group(1).split(','):
                part = part.strip()
                if part:
                    ex.add(part.split(' as ')[-1].strip())
        if re.search(r'export\s+default\s+', text):
            ex.add('default')
        exports[path.resolve()] = ex

        for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]", text, re.S):
            imports.append((path.resolve(), m.group(2), [x.strip() for x in m.group(1).replace('\n', ' ').split(',') if x.strip()]))
        for m in re.finditer(r"import\s+([A-Za-z_$][\w$]*)\s*from\s*['\"]([^'\"]+)['\"]", text):
            imports.append((path.resolve(), m.group(2), ['default']))
        for m in re.finditer(r"import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s*from\s*['\"]([^'\"]+)['\"]", text):
            imports.append((path.resolve(), m.group(1), ['*']))
        for m in re.finditer(r"import\(\s*['\"]([^'\"]+)['\"]\s*\)", text):
            imports.append((path.resolve(), m.group(1), ['<dynamic>']))
    return exports, imports


def check_local_imports(files):
    exports, imports = collect_exports_imports(files)
    errs = []
    for owner, src, names in imports:
        if not src.startswith('.'):
            continue
        clean = src.split('?', 1)[0].split('#', 1)[0]
        target = (owner.parent / clean).resolve()
        if target.suffix != '.js':
            target = target.with_suffix('.js')
        if not target.exists():
            errs.append(f'[import] {owner.relative_to(ROOT)} -> {src} 找不到檔案')
            continue
        avail = exports.get(target, set())
        for name in names:
            if name in ('*', '<dynamic>'):
                continue
            raw = name.split(' as ')[0].strip()
            if raw and raw not in avail:
                errs.append(f'[export] {owner.relative_to(ROOT)} -> {src} 缺少匯出 {raw} (可用: {", ".join(sorted(avail)) or "<none>"})')
    return errs


def check_duplicate_html_ids():
    html = INDEX_HTML.read_text(encoding='utf-8')
    ids = re.findall(r'id=["\']([^"\']+)["\']', html)
    seen = set()
    dup = []
    for item in ids:
        if item in seen and item not in dup:
            dup.append(item)
        seen.add(item)
    return [f'[dom] index.html 重複 id="{item}"' for item in dup]


def check_duplicate_function_signature_lines(files):
    errs = []
    pattern = re.compile(r'^\s*function\s+([A-Za-z_$][\w$]*)\s*\(')
    for path in files:
        lines = path.read_text(encoding='utf-8').splitlines()
        for idx in range(len(lines) - 1):
            left = lines[idx].strip()
            right = lines[idx + 1].strip()
            if not left or left != right:
                continue
            match = pattern.match(left)
            if match:
                errs.append(f'[structure] {path.relative_to(ROOT)} 第 {idx + 1} 行與第 {idx + 2} 行重複函式宣告 {match.group(1)}')
    return errs

def check_suspicious_multiline_strings(files):
    errs = []
    patterns = [
        (re.compile(r"join\('\s*\r?\n\s*'\)"), 'join() 內疑似混入跨行字串'),
        (re.compile(r"=\s*['\"]\s*\r?\n"), '賦值字串疑似被斷成跨行字元'),
    ]
    for path in files:
        text = path.read_text(encoding='utf-8')
        for regex, label in patterns:
            if regex.search(text):
                errs.append(f'[string] {path.relative_to(ROOT)} {label}')
                break
    return errs


def check_dom_ids(files):
    html = INDEX_HTML.read_text(encoding='utf-8')
    ids = set(re.findall(r'id=["\']([^"\']+)["\']', html))
    refs = set()
    pats = [
        r"byId\('([^']+)'\)",
        r'byId\("([^\"]+)"\)',
        r"\bon\('([^']+)'",
        r'\bon\("([^\"]+)"',
        r"getElementById\('([^']+)'\)",
        r'getElementById\("([^\"]+)"\)',
    ]
    for path in files:
        text = path.read_text(encoding='utf-8')
        for pat in pats:
            refs.update(re.findall(pat, text))
    return [f'[dom] index.html 缺少 id="{ref}"' for ref in sorted(refs) if ref not in ids]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()
    files = find_js_files()
    if not args.quiet:
        print(f'檢查目錄：{ROOT}')
        print(f'JS 檔案數：{len(files)}')
    errs = (
        run_node_check(files)
        + check_local_imports(files)
        + check_duplicate_html_ids()
        + check_dom_ids(files)
        + check_duplicate_function_signature_lines(files)
        + check_suspicious_multiline_strings(files)
    )
    if errs:
        print('前端完整性檢查失敗：')
        for err in errs:
            print(f'- {err}')
        return 1
    print('前端完整性檢查通過：語法 / 本地 import-export / index.html DOM ID / 疑似跨行字串檢查全部正常。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
