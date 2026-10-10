from dulwich.repo import Repo
import sys

repo = Repo('.')
walker = repo.get_walker()
found = False

for entry in walker:
    commit = entry.commit
    tree = repo[commit.tree]
    for item in repo.object_store.iter_tree_contents(tree.id):
        path_str = item.path.decode('utf-8')
        if 'prescription_context' in path_str and path_str.endswith('.py'):
            print(f"Found in commit {commit.id.decode('utf-8')}: {path_str}")
            found = True
            
            # restore it
            import os
            blob = repo[item.sha]
            os.makedirs(os.path.dirname(path_str), exist_ok=True)
            with open(path_str, 'wb') as f:
                f.write(blob.data)
    if found:
        print('Files restored from previous commit')
        sys.exit(0)

print('Not found in any commit')
