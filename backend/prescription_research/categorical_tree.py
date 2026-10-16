"""Small fitted categorical information-gain tree, using only Python stdlib.

This learner knows no diseases, medicines, label criteria or clinical rules.
It estimates splits and leaf labels from the supplied X/y training examples.
"""

from collections import Counter, defaultdict
import math

ALGORITHM_VERSION = 'categorical-information-gain-v1'


def token(value):
    if value is None:
        return 'null'
    if type(value) is bool:
        return 'bool:true' if value else 'bool:false'
    if isinstance(value, str):
        return 'string:' + value
    raise ValueError('Only strings, booleans and explicit null categorical values are supported.')


def entropy(counts):
    total = sum(counts.values())
    if not total:
        return 0.0
    return -sum((count / total) * math.log2(count / total) for count in counts.values() if count)


def encode(features, feature_names):
    if set(features) != set(feature_names):
        raise ValueError('Model inputs must match the exact feature allowlist.')
    return {name: token(features[name]) for name in feature_names}


def fit_model(X, y, feature_names, hyperparameters):
    if not X or len(X) != len(y) or len(set(y)) < 2:
        raise ValueError('Nonempty matched X/y and at least two observed target classes are required.')
    if len(set(feature_names)) != len(feature_names):
        raise ValueError('Feature names must be unique.')
    parameters = dict(hyperparameters)
    if set(parameters) != {'max_depth', 'min_split_samples', 'min_information_gain'}:
        raise ValueError('Unknown/missing tree hyperparameter.')
    if type(parameters['max_depth']) is not int or not 1 <= parameters['max_depth'] <= len(feature_names):
        raise ValueError('Invalid maximum depth.')
    if type(parameters['min_split_samples']) is not int or parameters['min_split_samples'] < 2:
        raise ValueError('Invalid minimum split size.')
    if not math.isfinite(parameters['min_information_gain']) or parameters['min_information_gain'] < 0:
        raise ValueError('Invalid minimum information gain.')
    encoded = [encode(features, feature_names) for features in X]
    labels = sorted(set(y))
    vocabulary = {name: sorted({example[name] for example in encoded}) for name in feature_names}

    def grow(indices, remaining, depth):
        counts = Counter(y[index] for index in indices)
        prediction = max(labels, key=lambda label: counts[label])
        node = {'class_counts': dict(sorted(counts.items())), 'training_unique_inputs': len(indices),
                'prediction': prediction}
        if len(counts) == 1 or depth >= parameters['max_depth'] or len(indices) < parameters['min_split_samples']:
            return node
        best_feature, best_gain, best_groups = None, parameters['min_information_gain'], None
        parent_entropy = entropy(counts)
        for name in remaining:
            groups = defaultdict(list)
            for index in indices:
                groups[encoded[index][name]].append(index)
            if len(groups) < 2:
                continue
            child_entropy = sum(len(group) / len(indices) * entropy(Counter(y[index] for index in group))
                                for group in groups.values())
            gain = parent_entropy - child_entropy
            # Ties retain the declared feature order; no validation/test tuning.
            if gain > best_gain + 1e-12:
                best_feature, best_gain, best_groups = name, gain, groups
        if best_feature is not None:
            node.update(feature=best_feature, information_gain=best_gain,
                        branches={value: grow(group, [name for name in remaining if name != best_feature], depth + 1)
                                  for value, group in sorted(best_groups.items())})
        return node

    return {'algorithm_version': ALGORITHM_VERSION, 'feature_names': list(feature_names),
            'labels': labels, 'hyperparameters': parameters, 'vocabulary': vocabulary,
            'training_unique_inputs': len(X), 'root': grow(list(range(len(X))), list(feature_names), 0)}


def predict(model, features):
    encoded = encode(features, model['feature_names'])
    unseen = [name for name in model['feature_names'] if encoded[name] not in model['vocabulary'][name]]
    if unseen:
        return {'label': None, 'status': 'abstained', 'reason': 'unseen_training_category', 'unseen_features': unseen,
                'path': [], 'leaf_training_unique_inputs': None}
    node, path = model['root'], []
    while 'feature' in node:
        feature = node['feature']
        path.append({'feature': feature, 'value': features[feature],
                     'node_training_unique_inputs': node['training_unique_inputs']})
        next_node = node['branches'].get(encoded[feature])
        if next_node is None:
            return {'label': None, 'status': 'abstained', 'reason': 'unseen_learned_branch', 'unseen_features': [feature],
                    'path': path, 'leaf_training_unique_inputs': None}
        node = next_node
    return {'label': node['prediction'], 'status': 'predicted', 'reason': 'learned_training_leaf',
            'unseen_features': [], 'path': path, 'leaf_training_unique_inputs': node['training_unique_inputs']}


def validate_model(model, expected_features):
    required = {'algorithm_version', 'feature_names', 'labels', 'hyperparameters', 'vocabulary',
                'training_unique_inputs', 'root'}
    if set(model) != required or model['algorithm_version'] != ALGORITHM_VERSION:
        raise ValueError('Invalid learner artifact/version.')
    if model['feature_names'] != list(expected_features) or set(model['vocabulary']) != set(expected_features):
        raise ValueError('Unexpected model input features.')
    if not isinstance(model['labels'], list) or len(set(model['labels'])) < 2 or not all(isinstance(label, str) for label in model['labels']):
        raise ValueError('Invalid learned classes.')
    for values in model['vocabulary'].values():
        if not isinstance(values, list) or not values or len(set(values)) != len(values) or not all(isinstance(value, str) for value in values):
            raise ValueError('Invalid train-only vocabulary.')

    def visit(node, used):
        keys = {'class_counts', 'training_unique_inputs', 'prediction'}
        branch = 'feature' in node
        if branch:
            keys |= {'feature', 'information_gain', 'branches'}
        if set(node) != keys or not node['class_counts'] or not set(node['class_counts']) <= set(model['labels']):
            raise ValueError('Invalid learned node.')
        if any(type(count) is not int or count <= 0 for count in node['class_counts'].values()):
            raise ValueError('Invalid training support.')
        if type(node['training_unique_inputs']) is not int or sum(node['class_counts'].values()) != node['training_unique_inputs']:
            raise ValueError('Inconsistent training support.')
        expected_label = max(model['labels'], key=lambda label: node['class_counts'].get(label, 0))
        if node['prediction'] != expected_label:
            raise ValueError('Leaf decision does not match training counts.')
        if branch:
            feature = node['feature']
            if feature not in expected_features or feature in used or not node['branches']:
                raise ValueError('Invalid/repeated learned split.')
            if len(used) >= model['hyperparameters']['max_depth']:
                raise ValueError('Tree exceeds declared depth.')
            if not set(node['branches']) <= set(model['vocabulary'][feature]):
                raise ValueError('Branch not in training vocabulary.')
            child_counts = Counter()
            for child in node['branches'].values():
                visit(child, used | {feature})
                child_counts.update(child['class_counts'])
            if dict(child_counts) != node['class_counts']:
                raise ValueError('Child training counts do not sum to parent.')
            if not isinstance(node['information_gain'], (int, float)) or not math.isfinite(node['information_gain']) or node['information_gain'] <= 0:
                raise ValueError('Invalid learned information gain.')

    visit(model['root'], set())
    if model['root']['training_unique_inputs'] != model['training_unique_inputs']:
        raise ValueError('Root training support mismatch.')


def summary(model):
    def visit(node, depth):
        if 'feature' not in node:
            return 1, 1, depth
        children = [visit(child, depth + 1) for child in node['branches'].values()]
        return 1 + sum(child[0] for child in children), sum(child[1] for child in children), max(child[2] for child in children)
    nodes, leaves, depth = visit(model['root'], 0)
    return {'nodes': nodes, 'leaves': leaves, 'maximum_depth': depth}


def tree_text(model):
    lines = ['Experimental ML: fitted categorical information-gain tree',
             'Labels are provisional rule-derived relevance, not clinical prescribing decisions.', '']

    def visit(node, prefix):
        lines.append(f'{prefix}prediction={node["prediction"]}; unique training inputs={node["training_unique_inputs"]}; counts={node["class_counts"]}')
        if 'feature' in node:
            for value, child in node['branches'].items():
                lines.append(f'{prefix}  if {node["feature"]} == {value}:')
                visit(child, prefix + '    ')

    visit(model['root'], '')
    return '\n'.join(lines) + '\n'
