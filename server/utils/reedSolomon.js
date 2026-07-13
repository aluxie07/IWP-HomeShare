/**
 * Reed-Solomon over GF(2^8) — dataShards + parityShards fragments.
 * Any `dataShards` of the `dataShards + parityShards` shards can rebuild the file.
 */
const DATA_SHARDS = 3;
const PARITY_SHARDS = 2;
const TOTAL_SHARDS = DATA_SHARDS + PARITY_SHARDS;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGf() {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x = x << 1;
        if (x & 0x100) {
            x ^= 0x11d;
        }
    }
    for (let i = 255; i < 512; i += 1) {
        GF_EXP[i] = GF_EXP[i - 255];
    }
    GF_LOG[0] = 0;
})();

function gfMul(a, b) {
    if (a === 0 || b === 0) {
        return 0;
    }
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfDiv(a, b) {
    if (b === 0) {
        throw new Error("GF divide by zero");
    }
    if (a === 0) {
        return 0;
    }
    return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

function gfPow(a, p) {
    if (p === 0) {
        return 1;
    }
    if (a === 0) {
        return 0;
    }
    return GF_EXP[(GF_LOG[a] * p) % 255];
}

/** Invert matrix over GF using Gauss-Jordan. matrix is n x n flat row-major. */
function invertMatrix(matrix, n) {
    const m = matrix.slice();
    const inv = new Uint8Array(n * n);
    for (let i = 0; i < n; i += 1) {
        inv[i * n + i] = 1;
    }

    for (let col = 0; col < n; col += 1) {
        let pivot = -1;
        for (let row = col; row < n; row += 1) {
            if (m[row * n + col] !== 0) {
                pivot = row;
                break;
            }
        }
        if (pivot < 0) {
            throw new Error("Singular matrix — cannot decode shards");
        }
        if (pivot !== col) {
            for (let j = 0; j < n; j += 1) {
                let tmp = m[col * n + j];
                m[col * n + j] = m[pivot * n + j];
                m[pivot * n + j] = tmp;
                tmp = inv[col * n + j];
                inv[col * n + j] = inv[pivot * n + j];
                inv[pivot * n + j] = tmp;
            }
        }

        const pivotVal = m[col * n + col];
        const invPivot = gfDiv(1, pivotVal);
        for (let j = 0; j < n; j += 1) {
            m[col * n + j] = gfMul(m[col * n + j], invPivot);
            inv[col * n + j] = gfMul(inv[col * n + j], invPivot);
        }

        for (let row = 0; row < n; row += 1) {
            if (row === col) {
                continue;
            }
            const factor = m[row * n + col];
            if (factor === 0) {
                continue;
            }
            for (let j = 0; j < n; j += 1) {
                m[row * n + j] ^= gfMul(factor, m[col * n + j]);
                inv[row * n + j] ^= gfMul(factor, inv[col * n + j]);
            }
        }
    }

    return inv;
}

/** Vandermonde-style encoding matrix (TOTAL x DATA). */
function buildEncodeMatrix() {
    const matrix = new Uint8Array(TOTAL_SHARDS * DATA_SHARDS);
    for (let row = 0; row < TOTAL_SHARDS; row += 1) {
        for (let col = 0; col < DATA_SHARDS; col += 1) {
            matrix[row * DATA_SHARDS + col] = gfPow(row + 1, col);
        }
    }
    // Make first DATA_SHARDS rows identity via inverting that block and multiplying
    const top = matrix.slice(0, DATA_SHARDS * DATA_SHARDS);
    const invTop = invertMatrix(top, DATA_SHARDS);
    const out = new Uint8Array(TOTAL_SHARDS * DATA_SHARDS);
    for (let row = 0; row < TOTAL_SHARDS; row += 1) {
        for (let col = 0; col < DATA_SHARDS; col += 1) {
            let sum = 0;
            for (let k = 0; k < DATA_SHARDS; k += 1) {
                sum ^= gfMul(matrix[row * DATA_SHARDS + k], invTop[k * DATA_SHARDS + col]);
            }
            out[row * DATA_SHARDS + col] = sum;
        }
    }
    return out;
}

const ENCODE_MATRIX = buildEncodeMatrix();

function encode(buffer) {
    const originalSize = buffer.length;
    const shardSize = Math.ceil(originalSize / DATA_SHARDS) || 1;
    const paddedSize = shardSize * DATA_SHARDS;
    const padded = Buffer.alloc(paddedSize);
    buffer.copy(padded);

    const dataShards = [];
    for (let i = 0; i < DATA_SHARDS; i += 1) {
        dataShards.push(padded.subarray(i * shardSize, (i + 1) * shardSize));
    }

    const shards = [];
    for (let row = 0; row < TOTAL_SHARDS; row += 1) {
        const out = Buffer.alloc(shardSize);
        for (let col = 0; col < DATA_SHARDS; col += 1) {
            const coeff = ENCODE_MATRIX[row * DATA_SHARDS + col];
            if (coeff === 0) {
                continue;
            }
            if (coeff === 1) {
                for (let i = 0; i < shardSize; i += 1) {
                    out[i] ^= dataShards[col][i];
                }
            } else {
                for (let i = 0; i < shardSize; i += 1) {
                    out[i] ^= gfMul(coeff, dataShards[col][i]);
                }
            }
        }
        shards.push(out);
    }

    return {
        shards,
        originalSize,
        shardSize,
        dataShards: DATA_SHARDS,
        parityShards: PARITY_SHARDS,
    };
}

/**
 * @param {(Buffer|null)[]} shards length TOTAL_SHARDS; null/undefined = missing
 */
function decode(shards, originalSize, shardSize) {
    if (!Array.isArray(shards) || shards.length !== TOTAL_SHARDS) {
        throw new Error("Expected 5 shard slots");
    }

    const present = [];
    for (let i = 0; i < TOTAL_SHARDS; i += 1) {
        if (shards[i] && Buffer.isBuffer(shards[i]) && shards[i].length === shardSize) {
            present.push(i);
        }
    }

    if (present.length < DATA_SHARDS) {
        throw new Error(
            `Need at least ${DATA_SHARDS} shards to recover; have ${present.length}`
        );
    }

    const use = present.slice(0, DATA_SHARDS);
    const decodeMatrix = new Uint8Array(DATA_SHARDS * DATA_SHARDS);
    for (let row = 0; row < DATA_SHARDS; row += 1) {
        const shardIndex = use[row];
        for (let col = 0; col < DATA_SHARDS; col += 1) {
            decodeMatrix[row * DATA_SHARDS + col] =
                ENCODE_MATRIX[shardIndex * DATA_SHARDS + col];
        }
    }

    const inv = invertMatrix(decodeMatrix, DATA_SHARDS);
    const recovered = [];
    for (let row = 0; row < DATA_SHARDS; row += 1) {
        const out = Buffer.alloc(shardSize);
        for (let col = 0; col < DATA_SHARDS; col += 1) {
            const coeff = inv[row * DATA_SHARDS + col];
            const src = shards[use[col]];
            if (coeff === 0) {
                continue;
            }
            if (coeff === 1) {
                for (let i = 0; i < shardSize; i += 1) {
                    out[i] ^= src[i];
                }
            } else {
                for (let i = 0; i < shardSize; i += 1) {
                    out[i] ^= gfMul(coeff, src[i]);
                }
            }
        }
        recovered.push(out);
    }

    const padded = Buffer.concat(recovered);
    return padded.subarray(0, originalSize);
}

module.exports = {
    DATA_SHARDS,
    PARITY_SHARDS,
    TOTAL_SHARDS,
    encode,
    decode,
};
