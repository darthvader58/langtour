#!/usr/bin/env python3
"""Read N×D embeddings from stdin as JSON array, output N×3 UMAP coords to stdout."""
import sys, json
import numpy as np
import umap

data = json.load(sys.stdin)
if not data or not isinstance(data, list) or not isinstance(data[0], list):
    print(json.dumps({"error": "expected JSON array of arrays"}))
    sys.exit(1)

X = np.array(data, dtype=np.float32)
N, D = X.shape
n_neighbors = max(3, min(15, N - 2))

reducer = umap.UMAP(
    n_components=3,
    n_neighbors=n_neighbors,
    min_dist=0.05,
    metric='cosine',
    low_memory=True,
    random_state=42,
    verbose=False,
)
coords = reducer.fit_transform(X).astype(np.float64)

# Center and normalise to unit radius
coords -= coords.mean(axis=0)
scale = float(np.sqrt((coords ** 2).sum(axis=1).max()))
if scale > 0:
    coords /= scale

json.dump(coords.tolist(), sys.stdout)
