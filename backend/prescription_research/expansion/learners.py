"""Compact categorical ML learners; no disease, medicine, teacher or safety rules."""

from collections import Counter
import math

from prescription_research import categorical_tree as tree

VERSION = 'stdlib-categorical-comparison-learners-v1'
ALGORITHMS = ('categorical_tree', 'categorical_naive_bayes', 'hamming_knn')


def fit(algorithm, X, y, feature_names, parameters):
    if algorithm not in ALGORITHMS:
        raise ValueError('Unknown learner.')
    if not X or len(X) != len(y) or len(set(y)) < 2 or not all(isinstance(label, str) and label for label in y):
        raise ValueError('Training requires matched nonempty inputs and at least two label classes.')
    if not feature_names or len(set(feature_names)) != len(feature_names):
        raise ValueError('Feature names must be nonempty and unique.')
    encoded = [tree.encode(row, feature_names) for row in X]
    vocabulary = {name: sorted({row[name] for row in encoded}) for name in feature_names}
    labels = sorted(set(y))
    if algorithm == 'categorical_tree':
        state = tree.fit_model(X, y, feature_names, parameters)
    elif algorithm == 'categorical_naive_bayes':
        if set(parameters) != {'alpha'} or type(parameters['alpha']) not in (int, float) or not math.isfinite(parameters['alpha']) or parameters['alpha'] <= 0:
            raise ValueError('Naive Bayes requires a positive finite smoothing alpha.')
        counts = Counter(y)
        state = {'class_counts': dict(sorted(counts.items())), 'feature_counts': {
            label: {name: dict(sorted(Counter(row[name] for row, actual in zip(encoded, y) if actual == label).items()))
                    for name in feature_names} for label in labels}}
    else:
        if (set(parameters) != {'k', 'boundary_ties', 'class_ties'} or type(parameters['k']) is not int
                or not 1 <= parameters['k'] <= len(X) or parameters['boundary_ties'] != 'include_all_at_kth_distance'
                or parameters['class_ties'] != 'alphabetical'):
            raise ValueError('Invalid fixed Hamming k-NN parameters.')
        state = {'training_inputs': encoded, 'training_labels': list(y)}
    return {'learner_version': VERSION, 'algorithm': algorithm, 'feature_names': list(feature_names),
            'labels': labels, 'parameters': dict(parameters), 'vocabulary': vocabulary,
            'training_inputs': len(X), 'state': state}


def predict(model, features):
    encoded = tree.encode(features, model['feature_names'])
    unseen = [name for name in model['feature_names'] if encoded[name] not in model['vocabulary'][name]]
    if unseen:
        return {'label': None, 'status': 'abstained', 'reason': 'unseen_training_category', 'unseen_features': unseen, 'evidence': {}}
    algorithm = model['algorithm']
    if algorithm == 'categorical_tree':
        result = tree.predict(model['state'], features)
        return {'label': result['label'], 'status': result['status'], 'reason': result['reason'],
                'unseen_features': result['unseen_features'],
                'evidence': {'learned_path': result['path'], 'leaf_training_support': result['leaf_training_unique_inputs']}}
    if algorithm == 'categorical_naive_bayes':
        state, alpha = model['state'], model['parameters']['alpha']
        log_scores = {}
        for label in model['labels']:
            count = state['class_counts'][label]
            score = math.log(count / model['training_inputs'])
            for name in model['feature_names']:
                observed = state['feature_counts'][label][name].get(encoded[name], 0)
                score += math.log((observed + alpha) / (count + alpha * len(model['vocabulary'][name])))
            log_scores[label] = score
        label = max(model['labels'], key=lambda item: log_scores[item])
        return {'label': label, 'status': 'predicted', 'reason': 'learned_categorical_naive_bayes', 'unseen_features': [],
                'evidence': {'class_training_support': state['class_counts'][label], 'scores_exposed': False}}
    if algorithm == 'hamming_knn':
        state = model['state']
        neighbors = sorted((sum(query[name] != encoded[name] for name in model['feature_names']), index)
                           for index, query in enumerate(state['training_inputs']))
        boundary = neighbors[model['parameters']['k'] - 1][0]
        indices = [index for distance, index in neighbors if distance <= boundary]
        counts = Counter(state['training_labels'][index] for index in indices)
        label = max(model['labels'], key=lambda item: counts[item])
        return {'label': label, 'status': 'predicted', 'reason': 'learned_hamming_neighbor_vote', 'unseen_features': [],
                'evidence': {'neighbor_count': len(indices), 'boundary_mismatches': boundary,
                             'label_support_counts': dict(sorted(counts.items()))}}
    raise ValueError('Unknown learner; no fallback prediction.')


def validate(model, expected_features):
    required = {'learner_version', 'algorithm', 'feature_names', 'labels', 'parameters', 'vocabulary', 'training_inputs', 'state'}
    if set(model) != required or model['learner_version'] != VERSION or model['algorithm'] not in ALGORITHMS:
        raise ValueError('Unsupported learner artifact/version.')
    if model['feature_names'] != list(expected_features) or len(set(expected_features)) != len(expected_features):
        raise ValueError('Unexpected model feature allowlist.')
    if type(model['training_inputs']) is not int or model['training_inputs'] < 2:
        raise ValueError('Invalid training input support.')
    if not isinstance(model['labels'], list) or model['labels'] != sorted(set(model['labels'])) or len(model['labels']) < 2 or not all(isinstance(x, str) for x in model['labels']):
        raise ValueError('Invalid learned labels.')
    if set(model['vocabulary']) != set(expected_features):
        raise ValueError('Invalid train-only vocabulary fields.')
    for values in model['vocabulary'].values():
        if not isinstance(values, list) or not values or values != sorted(set(values)) or not all(isinstance(x, str) for x in values):
            raise ValueError('Invalid categorical vocabulary.')
    state, algorithm = model['state'], model['algorithm']
    if algorithm == 'categorical_tree':
        tree.validate_model(state, expected_features)
        if state['vocabulary'] != model['vocabulary'] or state['training_unique_inputs'] != model['training_inputs'] or state['hyperparameters'] != model['parameters'] or state['labels'] != model['labels']:
            raise ValueError('Tree wrapper/state mismatch.')
    elif algorithm == 'categorical_naive_bayes':
        if set(state) != {'class_counts', 'feature_counts'} or set(state['class_counts']) != set(model['labels']) or set(state['feature_counts']) != set(model['labels']):
            raise ValueError('Invalid Naive Bayes state.')
        if any(type(count) is not int or count < 1 for count in state['class_counts'].values()) or sum(state['class_counts'].values()) != model['training_inputs']:
            raise ValueError('Invalid class support.')
        for label in model['labels']:
            if set(state['feature_counts'][label]) != set(expected_features):
                raise ValueError('Missing categorical feature counts.')
            for name, counts in state['feature_counts'][label].items():
                if (not set(counts) <= set(model['vocabulary'][name]) or any(type(n) is not int or n < 1 for n in counts.values())
                        or sum(counts.values()) != state['class_counts'][label]):
                    raise ValueError('Invalid categorical count totals.')
        alpha = model['parameters'].get('alpha')
        if set(model['parameters']) != {'alpha'} or type(alpha) not in (int, float) or not math.isfinite(alpha) or alpha <= 0:
            raise ValueError('Invalid smoothing parameter.')
    else:
        if set(state) != {'training_inputs', 'training_labels'} or len(state['training_inputs']) != model['training_inputs'] or len(state['training_labels']) != model['training_inputs']:
            raise ValueError('Invalid k-NN training state.')
        for row in state['training_inputs']:
            if set(row) != set(expected_features) or any(value not in model['vocabulary'][name] for name, value in row.items()):
                raise ValueError('Invalid stored neighbor input.')
        if set(state['training_labels']) != set(model['labels']):
            raise ValueError('Invalid stored neighbor labels.')
        parameters = model['parameters']
        if (set(parameters) != {'k', 'boundary_ties', 'class_ties'} or type(parameters['k']) is not int or not 1 <= parameters['k'] <= model['training_inputs']
                or parameters['boundary_ties'] != 'include_all_at_kth_distance' or parameters['class_ties'] != 'alphabetical'):
            raise ValueError('Invalid neighbor policy.')
