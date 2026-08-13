"""One-shot codemod: move JSDoc type tags into TypeScript syntax.

Deliberately conservative. It only rewrites shapes it can prove it understands
and leaves anything else for a human, because `tsc` catches an omission but not
a wrong type that still typechecks.
"""
import re
import sys
import pathlib


def read_braced(text, start):
    """Return (content, index_after) for a {...} run starting at `start`."""
    assert text[start] == '{'
    depth = 0
    i = start
    while i < len(text):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[start + 1:i], i + 1
        i += 1
    raise ValueError('unbalanced brace')


def parse_jsdoc(block):
    """Extract (params, returns, leftover_lines) from a JSDoc comment body."""
    params = []
    returns = None
    leftover = []
    for raw in block.split('\n'):
        line = re.sub(r'^\s*\*?\s?', '', raw).rstrip()
        m = re.match(r'@(param|returns|type)\s*\{', line)
        if not m:
            leftover.append(line)
            continue
        pos = line.index('{')
        rest = line
        while rest.count('{') > rest.count('}'):
            leftover.append('__UNCLOSED__')
            return None, None, None
        type_text, after = read_braced(rest, pos)
        tag = m.group(1)
        trailing = rest[after:].strip()
        if tag == 'param':
            name_m = re.match(r'\[?([A-Za-z_$][\w$]*)\]?', trailing)
            if not name_m:
                return None, None, None
            optional = trailing.startswith('[')
            params.append((name_m.group(1), type_text.strip(), optional))
            remainder = trailing[name_m.end():].strip()
            if remainder:
                leftover.append(f'@param {name_m.group(1)} {remainder}')
        elif tag == 'returns':
            returns = type_text.strip()
            if trailing:
                leftover.append(f'@returns {trailing}')
        else:
            return None, None, None
    return params, returns, leftover


ARROW = re.compile(
    r'^(?P<indent>[ \t]*)(?P<export>export\s+)?const\s+(?P<name>[\w$]+)\s*='
    r'\s*(?P<async>async\s+)?\((?P<args>[^)]*)\)\s*=>'
)


def convert(path):
    text = pathlib.Path(path).read_text()
    out = []
    i = 0
    lines = text.split('\n')
    changed = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped.startswith('/**'):
            out.append(line)
            i += 1
            continue

        start = i
        block_lines = []
        while i < len(lines):
            block_lines.append(lines[i])
            if lines[i].rstrip().endswith('*/'):
                break
            i += 1
        if i >= len(lines):
            out.extend(block_lines)
            break
        i += 1

        block_text = '\n'.join(block_lines)
        body = block_text.strip()
        body = body[3:] if body.startswith('/**') else body
        body = body[:-2] if body.endswith('*/') else body

        params, returns, leftover = parse_jsdoc(body)
        target = lines[i] if i < len(lines) else ''
        m = ARROW.match(target) if target else None

        if params is None or not m or (not params and not returns):
            out.extend(block_lines)
            continue

        args = [a.strip() for a in m.group('args').split(',')] if m.group('args').strip() else []
        if any('{' in a or '[' in a or '=' in a or '...' in a for a in args) and len(params) != 1:
            out.extend(block_lines)
            continue

        if len(params) == 1 and len(args) == 1 and ('{' in args[0] or '[' in args[0]):
            typed_args = [f'{args[0]}: {params[0][1]}']
        else:
            by_name = {name: (t, opt) for name, t, opt in params}
            if [a for a in args] != [n for n, _, _ in params]:
                out.extend(block_lines)
                continue
            typed_args = [f'{a}: {by_name[a][0]}' for a in args]

        prose = [l for l in (leftover or []) if l.strip()]
        rebuilt = []
        if prose:
            if len(prose) == 1:
                rebuilt.append(f"{m.group('indent')}/** {prose[0]} */")
            else:
                rebuilt.append(f"{m.group('indent')}/**")
                rebuilt.extend(f"{m.group('indent')} * {l}".rstrip() for l in prose)
                rebuilt.append(f"{m.group('indent')} */")

        head = f"{m.group('indent')}{m.group('export') or ''}const {m.group('name')} = "
        head += m.group('async') or ''
        signature = f"({', '.join(typed_args)})"
        if returns:
            signature += f': {returns}'
        rest_of_line = target[m.end():]
        rebuilt.append(f'{head}{signature} =>{rest_of_line}')

        out.extend(rebuilt)
        i += 1
        changed += 1

    if changed:
        pathlib.Path(path).write_text('\n'.join(out))
    return changed


if __name__ == '__main__':
    total = 0
    for arg in sys.argv[1:]:
        n = convert(arg)
        total += n
        if n:
            print(f'{arg}: {n}')
    print(f'total rewritten: {total}')
