import { readFile, writeFile, rename, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Dataset, Migration } from "@/types";
import { localDir, demoDataset } from "./dataset";
import { get, put, list } from "@vercel/blob";
const cloud = () => !!process.env.VERCEL;
const versions = new WeakMap<Migration, string>();
async function readBlob<T>(key: string): Promise<{ value: T; etag: string }> {
  // Compressed responses have weak ETags, which cannot be used for If-Match.
  const result = await get(key, {
    access: "private", useCache: false,
    headers: { "Accept-Encoding": "identity" },
  });
  if (!result || result.statusCode !== 200) throw Error("Migration not found");
  return {
    value: (await new Response(result.stream).json()) as T,
    etag: result.blob.etag,
  };
}
const dir = path.join(localDir, "cases");
export async function saveCase(m: Migration) {
  if (cloud()) {
    const etag = versions.get(m);
    const saved = await put(`cases/${m.id}.json`, JSON.stringify(m), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
    });
    versions.set(m, saved.etag);
    return;
  }
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, m.id + ".json");
  const temp = target + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(m));
  await rename(temp, target);
}
export async function getCase(id: string): Promise<Migration> {
  if (!/^[a-z0-9-]{1,60}$/.test(id)) throw Error("Invalid migration ID");
  if (cloud()) {
    const { value, etag } = await readBlob<Migration>(`cases/${id}.json`);
    versions.set(value, etag);
    return value;
  }
  try {
    return JSON.parse(await readFile(path.join(dir, id + ".json"), "utf8"));
  } catch {
    throw Error("Migration not found");
  }
}
export async function listCases(): Promise<Migration[]> {
  if (cloud()) {
    const cases: Migration[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "cases/", cursor, limit: 100 });
      cases.push(
        ...(await Promise.all(
          page.blobs.map((b) => getCase(path.basename(b.pathname, ".json"))),
        )),
      );
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return cases;
  }
  await mkdir(dir, { recursive: true });
  return Promise.all(
    (await readdir(dir))
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8"))),
  );
}
export async function createCase(
  input: {
    name: string;
    sourceAdmin: string;
    targetSystem: string;
    date: string;
    baseCurrency: string;
  },
  data?: Dataset,
) {
  const at = new Date().toISOString();
  const id = randomUUID();
  const datasetFile = data ? id : "demo";
  if (data) {
    if (cloud()) {
      await put(`datasets/${id}.json`, JSON.stringify(data), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
      });
    } else {
      await mkdir(localDir, { recursive: true });
      await writeFile(
        path.join(localDir, id + ".dataset.json"),
        JSON.stringify(data),
      );
    }
  } else await demoDataset();
  const m: Migration = {
    ...input,
    scope: data?.scope,
    id,
    createdAt: at,
    revision: 0,
    decisions: [],
    suggestions: {},
    datasetFile,
    audit: [
      {
        id: randomUUID(),
        at,
        action: "Migration created",
        detail: data?.scope
          ? data.scope.description
          : data
            ? "Uploaded source GL inspected and mapped against supplied reference crosswalks."
            : "Demo source inspected; mappings derived from reference crosswalks. All source entities retained.",
        reviewer: "System",
      },
    ],
  };
  await saveCase(m);
  return m;
}
const dataCache = new Map<string, Promise<Dataset>>();
export async function getDataset(m: Migration) {
  if (m.datasetFile === "demo") return demoDataset();
  if (cloud())
    return (await readBlob<Dataset>(`datasets/${m.datasetFile}.json`)).value;
  if (!dataCache.has(m.datasetFile))
    dataCache.set(
      m.datasetFile,
      readFile(
        path.join(localDir, m.datasetFile + ".dataset.json"),
        "utf8",
      ).then(JSON.parse),
    );
  return dataCache.get(m.datasetFile)!;
}
const locks = new Map<string, Promise<unknown>>();
export async function mutateCase<T>(
  id: string,
  fn: (m: Migration) => Promise<T>,
): Promise<T> {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => fn(await getCase(id)));
  locks.set(id, next);
  try {
    return await next;
  } finally {
    if (locks.get(id) === next) locks.delete(id);
  }
}
