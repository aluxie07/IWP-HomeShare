const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { encode, decode, TOTAL_SHARDS } = require("./reedSolomon");

/**
 * Shard layout (5 shards, any 3 recover):
 *   R2  → shards 0, 1
 *   B2  → shards 2, 3
 *   E2  → shard  4
 */
const PROVIDER_PLAN = [
    { provider: "r2", shardIndex: 0 },
    { provider: "r2", shardIndex: 1 },
    { provider: "b2", shardIndex: 2 },
    { provider: "b2", shardIndex: 3 },
    { provider: "e2", shardIndex: 4 },
];

function env(name) {
    return (process.env[name] || "").trim();
}

function providerConfig(name) {
    if (name === "r2") {
        return {
            name: "r2",
            bucket: env("R2_BUCKET") || "homeshare-shards-r2",
            client: new S3Client({
                region: "auto",
                endpoint: env("R2_ENDPOINT"),
                credentials: {
                    accessKeyId: env("R2_ACCESS_KEY_ID"),
                    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
                },
                forcePathStyle: true,
            }),
        };
    }
    if (name === "b2") {
        const endpoint = env("B2_ENDPOINT").startsWith("http")
            ? env("B2_ENDPOINT")
            : `https://${env("B2_ENDPOINT")}`;
        const region =
            env("B2_REGION") ||
            (endpoint.match(/s3\.([^.]+)\.backblazeb2\.com/) || [])[1] ||
            "us-east-005";
        return {
            name: "b2",
            bucket: env("B2_BUCKET") || "homeshare-shards-b2",
            client: new S3Client({
                region,
                endpoint,
                credentials: {
                    accessKeyId: env("B2_KEY_ID"),
                    secretAccessKey: env("B2_APPLICATION_KEY"),
                },
                forcePathStyle: true,
            }),
        };
    }
    if (name === "e2") {
        const endpoint = env("E2_ENDPOINT").startsWith("http")
            ? env("E2_ENDPOINT")
            : `https://${env("E2_ENDPOINT")}`;
        return {
            name: "e2",
            bucket: env("E2_BUCKET") || "homeshare-shards-e2",
            client: new S3Client({
                region: env("E2_REGION") || "us-midwest-1",
                endpoint,
                credentials: {
                    accessKeyId: env("E2_ACCESS_KEY_ID"),
                    secretAccessKey: env("E2_SECRET_ACCESS_KEY"),
                },
                forcePathStyle: true,
            }),
        };
    }
    throw new Error(`Unknown shard provider: ${name}`);
}

function areCloudShardsConfigured() {
    return Boolean(
        env("R2_ENDPOINT") &&
            env("R2_ACCESS_KEY_ID") &&
            env("R2_SECRET_ACCESS_KEY") &&
            env("B2_ENDPOINT") &&
            env("B2_KEY_ID") &&
            env("B2_APPLICATION_KEY") &&
            env("E2_ENDPOINT") &&
            env("E2_ACCESS_KEY_ID") &&
            env("E2_SECRET_ACCESS_KEY")
    );
}

const clientCache = new Map();

function getProvider(name) {
    if (!clientCache.has(name)) {
        clientCache.set(name, providerConfig(name));
    }
    return clientCache.get(name);
}

async function streamToBuffer(body) {
    if (!body) {
        return Buffer.alloc(0);
    }
    if (Buffer.isBuffer(body)) {
        return body;
    }
    if (typeof body.transformToByteArray === "function") {
        return Buffer.from(await body.transformToByteArray());
    }
    const chunks = [];
    for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

function shardObjectKey(fileId, shardIndex, chunkIndex = 0) {
    return `shards/${fileId}/c${chunkIndex}/s${shardIndex}.bin`;
}

async function uploadShard(providerName, bucket, key, body) {
    const { client } = getProvider(providerName);
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: "application/octet-stream",
        })
    );
}

async function downloadShard(providerName, bucket, key) {
    const { client } = getProvider(providerName);
    const res = await client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        })
    );
    return streamToBuffer(res.Body);
}

async function deleteShard(providerName, bucket, key) {
    const { client } = getProvider(providerName);
    try {
        await client.send(
            new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            })
        );
    } catch (err) {
        console.warn(
            `[HomeShare] Shard delete ${providerName}/${key}: ${err.message}`
        );
    }
}

async function shardExists(providerName, bucket, key) {
    const { client } = getProvider(providerName);
    try {
        await client.send(
            new HeadObjectCommand({
                Bucket: bucket,
                Key: key,
            })
        );
        return true;
    } catch {
        return false;
    }
}

async function saveChunkToCloudShards(fileId, chunkIndex, buffer) {
    if (!areCloudShardsConfigured()) {
        throw new Error(
            "Cloud shard providers are not configured. Set R2_*, B2_*, and E2_* env vars."
        );
    }
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("Upload chunk is empty");
    }

    const encoded = encode(buffer);
    const shardRecords = [];

    for (const plan of PROVIDER_PLAN) {
        const provider = getProvider(plan.provider);
        const key = shardObjectKey(fileId, plan.shardIndex, chunkIndex);
        await uploadShard(
            plan.provider,
            provider.bucket,
            key,
            encoded.shards[plan.shardIndex]
        );
        shardRecords.push({
            index: plan.shardIndex,
            provider: plan.provider,
            bucket: provider.bucket,
            key,
        });
    }

    return {
        index: chunkIndex,
        size: buffer.length,
        shards: shardRecords,
        shardMeta: {
            dataShards: encoded.dataShards,
            parityShards: encoded.parityShards,
            shardSize: encoded.shardSize,
            originalSize: encoded.originalSize,
        },
    };
}

/** Legacy whole-file upload (small files / older clients). */
async function saveToCloudShards(fileId, buffer) {
    const chunk = await saveChunkToCloudShards(fileId, 0, buffer);
    return {
        storageKind: "shards",
        shards: chunk.shards,
        shardMeta: chunk.shardMeta,
        chunks: [chunk],
    };
}

async function loadChunkFromCloudShards(chunk) {
    const meta = chunk.shardMeta || {};
    const shardSize = meta.shardSize;
    const originalSize = meta.originalSize ?? chunk.size;
    if (!shardSize || !chunk.shards?.length) {
        throw new Error("Chunk shard metadata is missing");
    }

    const slots = new Array(TOTAL_SHARDS).fill(null);
    const errors = [];

    await Promise.all(
        chunk.shards.map(async (s) => {
            try {
                slots[s.index] = await downloadShard(s.provider, s.bucket, s.key);
            } catch (err) {
                errors.push(`${s.provider}:${s.index} ${err.message}`);
            }
        })
    );

    try {
        return decode(slots, originalSize, shardSize);
    } catch (err) {
        const detail = errors.length ? ` (${errors.join("; ")})` : "";
        throw new Error(`${err.message}${detail}`);
    }
}

async function loadFromCloudShards(file) {
    if (file.chunks?.length) {
        const parts = [];
        for (const chunk of [...file.chunks].sort((a, b) => a.index - b.index)) {
            parts.push(await loadChunkFromCloudShards(chunk));
        }
        return Buffer.concat(parts);
    }

    // Legacy single-shard-set records
    const meta = file.shardMeta || {};
    const shardSize = meta.shardSize;
    const originalSize = meta.originalSize ?? file.fileSize;
    if (!shardSize || !file.shards?.length) {
        throw new Error("File shard metadata is missing");
    }

    return loadChunkFromCloudShards({
        shards: file.shards,
        shardMeta: meta,
        size: originalSize,
    });
}

async function streamCloudShardsToResponse(file, res, downloadName) {
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${String(downloadName || "file").replace(/"/g, "")}"`
    );
    if (file.fileType) {
        res.setHeader("Content-Type", file.fileType);
    }
    if (file.fileSize) {
        res.setHeader("Content-Length", String(file.fileSize));
    }

    if (file.chunks?.length) {
        const ordered = [...file.chunks].sort((a, b) => a.index - b.index);
        for (const chunk of ordered) {
            const buf = await loadChunkFromCloudShards(chunk);
            if (!res.write(buf)) {
                await new Promise((resolve) => res.once("drain", resolve));
            }
        }
        res.end();
        return;
    }

    const buffer = await loadFromCloudShards(file);
    res.end(buffer);
}

async function cloudShardsExist(file) {
    const sets = file.chunks?.length
        ? file.chunks
        : file.shards?.length
          ? [{ shards: file.shards }]
          : [];

    if (!sets.length) {
        return false;
    }

    for (const set of sets) {
        let ok = 0;
        await Promise.all(
            (set.shards || []).map(async (s) => {
                if (await shardExists(s.provider, s.bucket, s.key)) {
                    ok += 1;
                }
            })
        );
        if (ok < 3) {
            return false;
        }
    }
    return true;
}

async function deleteCloudShards(file) {
    const all = [];
    if (file.chunks?.length) {
        for (const chunk of file.chunks) {
            for (const s of chunk.shards || []) {
                all.push(deleteShard(s.provider, s.bucket, s.key));
            }
        }
    } else if (file.shards?.length) {
        for (const s of file.shards) {
            all.push(deleteShard(s.provider, s.bucket, s.key));
        }
    }
    await Promise.all(all);
}

module.exports = {
    areCloudShardsConfigured,
    saveToCloudShards,
    saveChunkToCloudShards,
    loadFromCloudShards,
    streamCloudShardsToResponse,
    cloudShardsExist,
    deleteCloudShards,
    PROVIDER_PLAN,
};
