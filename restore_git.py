from dulwich.repo import Repo
import os

repo = Repo('.')
index = repo.open_index()

for path in index:
    path_str = path.decode('utf-8')
    if 'prescription_context' in path_str and path_str.endswith('.py'):
        print(f"Restoring {path_str}")
        blob = repo[index[path][1]]
        os.makedirs(os.path.dirname(path_str), exist_ok=True)
        with open(path_str, 'wb') as f:
            f.write(blob.data)
