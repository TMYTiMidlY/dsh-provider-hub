#!/usr/bin/env python3
"""Generate profile-patch rows that override preset tool-web with searchMaxResults.

Reads the bundled dsh-web-app preset patch files, restates each preset row's
whole `config` (patch semantics replace config wholesale -- no deep merge),
and adds searchMaxResults to the tool-web plugin entry. `!!js` expressions are
preserved verbatim via uniform 4-space dedent of the config block.
"""
import re
import sys

PRESETS_DIR = ("/home/timidly/.nvm/versions/node/v24.21.0/lib/node_modules/"
               "@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/presets")
PRESETS = ["standard", "ptc", "cordis"]
NEW_VALUE = 200

HEADER = """# ── web_search 来源上限：搜到多少给多少（searchMaxResults: {n}） ──────────────
# 官方 tool-web 默认只展示 8 条（dsh-tool-web Config.searchMaxResults），截断发生在
# seam/合并的呈现层，后端实际已返回全部结果。以下三行按 id 覆盖
# dsh-web-app/presets/{{standard,ptc,cordis}}.patch.yml 的 preset 行：patch 语义是
# 整行 config 替换（applyEntryPatches 不深合并），故完整重述每个 preset 的 plugins，
# 仅在 tool-web 的 config 里增加 searchMaxResults: {n}。
# 升级 dsh 后若上游 preset 组成有变，删除本段（回退默认 8）或从新版包内文件重新生成。
"""


def gen(name: str) -> str:
    path = f"{PRESETS_DIR}/{name}.patch.yml"
    with open(path) as f:
        lines = f.read().splitlines(keepends=True)

    # config block starts right after the preset row's `      config:` (6 spaces)
    start = None
    for i, line in enumerate(lines):
        if line.rstrip("\n") == "      config:":
            start = i + 1
            break
    if start is None:
        sys.exit(f"{path}: preset row config: not found")
    body = lines[start:]

    # uniform dedent by 4 spaces (blank lines untouched)
    dedented = []
    for line in body:
        if line.strip() == "":
            dedented.append(line)
        elif line.startswith("    "):
            dedented.append(line[4:])
        else:
            sys.exit(f"{path}: unexpected indent at line: {line!r}")

    # find the tool-web plugin entry and its config keys
    text = "".join(dedented)
    entries = [m for m in re.finditer(r"^      - id: tool-web$", text, re.M)]
    if len(entries) != 1:
        sys.exit(f"{path}: expected exactly one tool-web entry, found {len(entries)}")
    if len(re.findall(r"^          searchTimeoutMs: 60000$", text, re.M)) != 1:
        sys.exit(f"{path}: expected exactly one tool-web searchTimeoutMs line")
    text = text.replace(
        "          searchTimeoutMs: 60000",
        f"          searchTimeoutMs: 60000\n          searchMaxResults: {NEW_VALUE}",
    )

    row = f"- id: preset-{name}\n  config:\n" + text
    return row


def main() -> None:
    out = [HEADER.format(n=NEW_VALUE)]
    for name in PRESETS:
        out.append(gen(name))
        if not out[-1].endswith("\n"):
            out[-1] += "\n"
    with open("/home/timidly/dsh-provider-hub/.preset-override.generated.yml", "w") as f:
        f.write("\n".join(out))
    print("generated /home/timidly/dsh-provider-hub/.preset-override.generated.yml")


if __name__ == "__main__":
    main()
