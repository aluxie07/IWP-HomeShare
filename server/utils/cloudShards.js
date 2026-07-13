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

function shardObjectKey(fileId, shardIndex) {
    return `shards/${fileId}/s${shardIndex}.bin`;
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

/**
 * Encode buffer into 5 shards and upload across R2 / B2 / E2.
 * @returns metadata for the File document
 */
async function saveToCloudShards(fileId, buffer) {
    if (!areCloudShardsConfigured()) {
        throw new Error(
            "Cloud shard providers are not configured. Set R2_*, B2_*, and E2_* env vars."
        );
    }
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("Upload buffer is empty");
    }

    const encoded = encode(buffer);
    const shardRecords = [];

    for (const plan of PROVIDER_PLAN) {
        const provider = getProvider(plan.provider);
        const key = shardObjectKey(fileId, plan.shardIndex);
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
        storageKind: "shards",
        shards: shardRecords,
        shardMeta: {
            dataShards: encoded.dataShards,
            parityShards: encoded.parityShards,
            shardSize: encoded.shardSize,
            originalSize: encoded.originalSize,
        },
    };
}

async function loadFromCloudShards(file) {
    const meta = file.shardMeta || {};
    const shardSize = meta.shardSize;
    const originalSize = meta.originalSize ?? file.fileSize;
    if (!shardSize || !file.shards?.length) {
        throw new Error("File shard metadata is missing");
    }

    const slots = new Array(TOTAL_SHARDS).fill(null);
    const errors = [];

    await Promise.all(
        file.shards.map(async (s) => {
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

async function cloudShardsExist(file) {
    if (!file.shards?.length) {
        return false;
    }
    let ok = 0;
    await Promise.all(
        file.shards.map(async (s) => {
            if (await shardExists(s.provider, s.bucket, s.key)) {
                ok += 1;
            }
        })
    );
    return ok >= 3;
}

async function deleteCloudShards(file) {
    if (!file.shards?.length) {
        return;
    }
    await Promise.all(
        file.shards.map((s) => deleteShard(s.provider, s.bucket, s.key))
    );
}

module.exports = {
    areCloudShardsConfigured,
    saveToCloudShards,
    loadFromCloudShards,
    cloudShardsExist,
    deleteCloudShards,
    PROVIDER_PLAN,
};
