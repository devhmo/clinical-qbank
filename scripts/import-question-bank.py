import gzip
import json
import re
import sys
from pathlib import Path

archive = Path(sys.argv[1])
dist = Path(sys.argv[2])
catalog_rows = json.loads((dist / 'catalog.json').read_bytes())
catalog = {row['id']: row for row in catalog_rows}
assert len(catalog) == len(catalog_rows)

marker = 'const TESTS_LIST = '
with gzip.open(archive, 'rt', encoding='utf-8') as source:
    html = source.read()
assert html.count(marker) == 1
offset = html.index(marker) + len(marker)
tests, _ = json.JSONDecoder().raw_decode(html, offset)
del html

ids = [str(test['id']) for test in tests]
assert len(ids) == len(set(ids)) and set(ids) == set(catalog)
assert all(re.fullmatch(r'[A-Za-z0-9_-]{1,120}', test_id) for test_id in ids)

directory = dist / 'tests'
directory.mkdir(exist_ok=True)
for test in tests:
    metadata = catalog[str(test['id'])]
    questions = test['questions']
    assert len(questions) == metadata['count']
    assert [str(question['id']) for question in questions] == metadata['ids']
    payload = json.dumps(test, ensure_ascii=False, separators=(',', ':')).encode()
    assert b'aseel-xcoder.github.io' not in payload.lower()
    path = directory / (metadata['id'] + '.json.gz')
    path.write_bytes(gzip.compress(payload, compresslevel=6, mtime=0))
    assert gzip.decompress(path.read_bytes()) == payload

files = list(directory.glob('*.json.gz'))
assert len(files) == len(tests)
print(f'{len(tests):,} tests, {sum(len(t["questions"]) for t in tests):,} question records')
print(f'{sum(file.stat().st_size for file in files):,} compressed bytes, {max(file.stat().st_size for file in files):,} largest file')
