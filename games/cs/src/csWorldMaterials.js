import * as T from 'three';

// Generated from the game-owned offline preparation script; release-local files only.
const MANIFEST_DATA = {
  "plaster": {
    "sourceId": "plastered_wall",
    "repeatMeters": 2,
    "maps": {
      "map": {
        "path": "assets/materials/plaster-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 22238,
        "sha256": "12e9b67132a8b35e891f3b7685977572bacd8fbb77806378c2e71fe219b3bd78"
      },
      "normalMap": {
        "path": "assets/materials/plaster-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 77644,
        "sha256": "e370032fded6970f80802bd1183372340550358502a5742e06060fa1d81b2918"
      },
      "roughnessMap": {
        "path": "assets/materials/plaster-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 2738,
        "sha256": "c1e580ed515fe1c87b33fa9ad4fe79a6150efb3332c5ebf149c8f0b7c0eddb08"
      }
    }
  },
  "sandstone": {
    "sourceId": "sandstone_blocks_05",
    "repeatMeters": 3,
    "maps": {
      "map": {
        "path": "assets/materials/sandstone-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 84082,
        "sha256": "42fe0d45a0b80da9873bcec0b1730b726fa018f1366a569994165d0cc478b6ad"
      },
      "normalMap": {
        "path": "assets/materials/sandstone-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 129512,
        "sha256": "acd3c5ee341d23936d8b4f7706726b54c284324a94d47ab9b021aa991cd3e69d"
      },
      "roughnessMap": {
        "path": "assets/materials/sandstone-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 19038,
        "sha256": "4f70729251564ad17fb0cfca282204d2281432ccbe84e38141f07dd96a88ade4"
      }
    }
  },
  "brick": {
    "sourceId": "brick_wall_001",
    "repeatMeters": 3,
    "maps": {
      "map": {
        "path": "assets/materials/brick-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 60496,
        "sha256": "b2ada8bf98b9b9928ba3efccc1a5c5f26dfac0231ccce48f8ee2e60cab500762"
      },
      "normalMap": {
        "path": "assets/materials/brick-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 92518,
        "sha256": "36163de105cf851671be33a7500781a5a152c76f5352946c55555390a94d57e1"
      },
      "roughnessMap": {
        "path": "assets/materials/brick-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 19112,
        "sha256": "39f771b6d4736651c70365ce49d0a5f121d91978dac07135b604ffdccfe8e989"
      }
    }
  },
  "cobble": {
    "sourceId": "cobblestone_floor_02",
    "repeatMeters": 2,
    "maps": {
      "map": {
        "path": "assets/materials/cobble-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 45750,
        "sha256": "ef8556312bf9f7ca230fe914ab8e350be0f50729268d07066eed85555c9860b2"
      },
      "normalMap": {
        "path": "assets/materials/cobble-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 66634,
        "sha256": "e4b167de6aa1610a3ce10632598aad40c6f717c89aa09c1a70773448d12b300d"
      },
      "roughnessMap": {
        "path": "assets/materials/cobble-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 29264,
        "sha256": "aab49a3f645597ecb84318a57e3e98a8e418f97a759e7d18daaef8fe90546912"
      }
    }
  },
  "concrete": {
    "sourceId": "concrete_floor_02",
    "repeatMeters": 2,
    "maps": {
      "map": {
        "path": "assets/materials/concrete-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 97584,
        "sha256": "82e7445360f8ee120ec0fa4589caab6842fd289189e2d437cd2129307ad876ab"
      },
      "normalMap": {
        "path": "assets/materials/concrete-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 36476,
        "sha256": "61c0944d20d8175b6b10261775431285be949bf0a3f25570b0b5eb35d294dc7c"
      },
      "roughnessMap": {
        "path": "assets/materials/concrete-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 25792,
        "sha256": "55e8a75fe99422ce30b1fb019841c158e274232f1e7a21dbbddffb8718dec0a3"
      }
    }
  },
  "wood": {
    "sourceId": "wood_planks",
    "repeatMeters": 1.5,
    "maps": {
      "map": {
        "path": "assets/materials/wood-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 23258,
        "sha256": "1abf558ae7e130b22a973bd53187685697d9fbf25a33180c2166c8900b6e46e9"
      },
      "normalMap": {
        "path": "assets/materials/wood-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 20714,
        "sha256": "a5f0a18728ac4bd812d7e9a09a536e0eac5f558f1e701bd8422afd8a74887ddc"
      },
      "roughnessMap": {
        "path": "assets/materials/wood-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 4462,
        "sha256": "7132c7865710f11efdfde56085bb824d7365282add0f0b19f90b6fc6739d7ec5"
      }
    }
  },
  "metal": {
    "sourceId": "rusty_painted_metal",
    "repeatMeters": 2.2,
    "maps": {
      "map": {
        "path": "assets/materials/metal-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 15120,
        "sha256": "e0d9ac019e9cf498767632748f62b866abe97321c7e5c713b9c01bc358fdc4a4"
      },
      "normalMap": {
        "path": "assets/materials/metal-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 7304,
        "sha256": "83ad3f304c29516d8750719d5383d84ad6a230672e2fdd50582381c163b5984f"
      },
      "roughnessMap": {
        "path": "assets/materials/metal-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 6978,
        "sha256": "91c6388b283cb1fc45ee65218ff2de3bcf845b4bdc8e7d6640660a210b804c4b"
      }
    }
  },
  "roof": {
    "sourceId": "clay_roof_tiles",
    "repeatMeters": 4,
    "maps": {
      "map": {
        "path": "assets/materials/roof-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 65166,
        "sha256": "847edee27c36a897acf7ffa0154bbbffb7dfe91a2b647e88dafaffea158d647f"
      },
      "normalMap": {
        "path": "assets/materials/roof-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 102358,
        "sha256": "feafe991b5a0c1fbbaac3a2f583b46b5dd61fe0c96635e1cadde6face340829a"
      },
      "roughnessMap": {
        "path": "assets/materials/roof-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 8924,
        "sha256": "a65e02a6316102f7465bfd6680431363b6c35d696cf9da06a12cbf3ab82c75a0"
      }
    }
  },
  "snow": {
    "sourceId": "snow_02",
    "repeatMeters": 2,
    "maps": {
      "map": {
        "path": "assets/materials/snow-albedo.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 21084,
        "sha256": "d5c64edfc910f4eee58a499b1bacec9ed04cf9988c72b3bb2b5deebbd15835c4"
      },
      "normalMap": {
        "path": "assets/materials/snow-normal.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 100378,
        "sha256": "a9536c92b7e5622c1d07c1b7394b484d9c6ec0101c6bcafcb42f726689a52ad2"
      },
      "roughnessMap": {
        "path": "assets/materials/snow-roughness.webp",
        "width": 512,
        "height": 512,
        "encodedBytes": 4030,
        "sha256": "4335a93c0c5592fe36339efd739975b9472ad93805a4639ad3f43093507fd7ee"
      }
    }
  }
};
const freeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); return Object.freeze(value); };
export const WORLD_MATERIAL_MANIFEST = freeze(MANIFEST_DATA);
export const WORLD_MATERIAL_KINDS = Object.freeze(Object.keys(WORLD_MATERIAL_MANIFEST));
export const WORLD_MATERIAL_BUDGET = Object.freeze({ maxDownloadBytes: 4 * 1024 * 1024, maxGpuBytes: 48 * 1024 * 1024, maxAnisotropy: 4, maxConcurrent: 4 });
const FINISH = {
  plaster: [0xc7bdac, .93, 0, .35], sandstone: [0xb9a17a, .94, 0, .65],
  brick: [0x986e58, .94, 0, .6], cobble: [0x8b8982, .95, 0, .65],
  concrete: [0x99978f, .94, 0, .35], wood: [0x89745b, .88, 0, .45],
  metal: [0x777a78, .75, .25, .4], roof: [0x96654f, .94, 0, .65],
  snow: [0xe3e8e9, .98, 0, .3],
};
const SLOTS = ['map', 'normalMap', 'roughnessMap'];
const clampAnisotropy = n => Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 1;
const canonical = kind => kind === 'stone' ? 'sandstone' : Object.hasOwn(FINISH, kind) ? kind : 'plaster';
const mipBytes = (w, h) => { let bytes = 0; for (;;) { bytes += w * h * 4; if (w === 1 && h === 1) return bytes; w = Math.max(1, Math.floor(w / 2)); h = Math.max(1, Math.floor(h / 2)); } };

/** GoldSrc names are semantic hints, NOT URLs. Cutout alpha is the world's decision:
 * this classifier deliberately returns a normal family, never an opaque fake alpha map.
 * Numbered fy_snow names below were checked against the actual embedded pixel images.
 */
export function classifyWorldMaterial(textureName, theme = 'snow') {
  const raw = String(textureName || '').toLowerCase();
  const name = raw.replace(/^[+\-][0-9a-z]/, '').replace(/^\{/, '');
  const snowNames = { '1-teks': 'snow', '2-teks': 'sandstone', '3-teks': 'sandstone', '4-teks': 'plaster', '5-teks': 'plaster', '6-teks': 'wood' };
  if (snowNames[name]) return snowNames[name];
  if (/snow|ice|frost/.test(name)) return 'snow';
  if (/metal|steel|iron|grate|chain|fence|duct|pipe|vent|generic011|^black$|fifties_lgt/.test(name)) return 'metal';
  if (/wood|crate|crte|sandcrt|plank|timber|door|wndw/.test(name)) return 'wood';
  if (/roof|terracotta|roofing/.test(name)) return 'roof';
  if (/cobble|sandroad|pavement|paving/.test(name)) return 'cobble';
  if (/concrete|ccrete|cement|asphalt/.test(name)) return 'concrete';
  if (/brick/.test(name)) return 'brick';
  if (/sandrock|sandstone|stone|rock|sandtrim/.test(name) || /^sand$/.test(name)) return 'sandstone';
  if (/plaster|stucco|sandwall|sandwll|white|credit/.test(name)) return 'plaster';
  return theme === 'desert' ? 'sandstone' : 'plaster';
}

/** Abortable local-release photo loader. Image.decode is not required on older browsers.
 * CPU-only callers never reach this function. Object URLs and image handlers are always released.
 */
async function loadBrowserTexture(url, { signal, onDownload }) {
  const response = await fetch(url, { signal, priority: 'low' });
  if (!response.ok) throw new Error(`Texture HTTP ${response.status}`);
  const blob = await response.blob();
  onDownload(blob.size);
  if (signal.aborted) throw new Error('Texture load aborted');
  return new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async'; image.loading = 'eager';
    const objectUrl = URL.createObjectURL(blob);
    const clean = () => { image.onload = image.onerror = null; signal.removeEventListener('abort', abort); URL.revokeObjectURL(objectUrl); };
    const abort = () => { clean(); image.src = ''; reject(new Error('Texture load aborted')); };
    image.onload = () => { clean(); resolve({ texture: new T.Texture(image), encodedBytes: blob.size }); };
    image.onerror = () => { clean(); reject(new Error('Texture image decode failed')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    image.src = objectUrl;
  });
}

/** One owner per world. UVs are meters / manifest[kind].repeatMeters; texture.repeat is 1.
 * material() is synchronous and CPU-safe. load() resolves diagnostics, including failures.
 * detail=false avoids downloading/using normal and roughness maps; enabling detail then
 * load() fetches only missing slots. Disabling detail retains cached textures for cheap toggles.
 * The optional loadTexture hook is for controlled tests; it must return {texture, encodedBytes}.
 * GPU accounting is exact RGBA8 mip storage, not a claim about opaque driver overhead.
 */
export class WorldMaterialPalette {
  constructor(assetUrl, options = {}) {
    if (typeof assetUrl !== 'function') throw new TypeError('WorldMaterialPalette requires instance assetUrl');
    this.quality = { detail: options.detail !== false, anisotropy: clampAnisotropy(options.anisotropy ?? 4) };
    this._loader = options.loadTexture || loadBrowserTexture;
    this._canLoad = !!options.loadTexture || (typeof Image !== 'undefined' && typeof fetch === 'function');
    this._timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : 15000;
    this._materials = new Map();
    this._records = new Map();
    this._released = new WeakSet();
    this._controllers = new Set();
    this._disposed = false;
    this._cpuFallback = false;
    this._loading = null;
    this._downloadedBytes = 0;
    for (const kind of WORLD_MATERIAL_KINDS) for (const slot of SLOTS) {
      const metadata = WORLD_MATERIAL_MANIFEST[kind].maps[slot];
      // Resolve ONCE per instance, before async work can observe another release's state.
      this._records.set(`${kind}:${slot}`, { kind, slot, metadata, url: assetUrl(metadata.path), state: 'idle', texture: null, error: null, downloaded: false });
    }
  }

  material(kind) {
    if (this._disposed) throw new Error('WorldMaterialPalette is disposed');
    kind = canonical(kind);
    if (!this._materials.has(kind)) {
      const [color, roughness, metalness, normalScale] = FINISH[kind];
      const material = new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
      material.name = `world:${kind}`;
      material.normalScale.setScalar(normalScale);
      material.userData.worldMaterialPalette = true;
      material.userData.materialKind = kind;
      this._materials.set(kind, material);
      this._bind(kind);
    }
    return this._materials.get(kind);
  }

  _bind(kind) {
    const material = this._materials.get(kind);
    if (!material) return;
    let changed = false;
    for (const slot of SLOTS) {
      const texture = (slot === 'map' || this.quality.detail) ? this._records.get(`${kind}:${slot}`).texture : null;
      if (material[slot] !== texture) { material[slot] = texture; changed = true; }
    }
    material.color.setHex(material.map ? 0xffffff : FINISH[kind][0]);
    material.roughness = material.roughnessMap ? 1 : FINISH[kind][1];
    if (changed) material.needsUpdate = true;
  }

  applyQuality({ detail = this.quality.detail, anisotropy = this.quality.anisotropy } = {}) {
    if (this._disposed) return this.stats();
    this.quality = { detail: !!detail, anisotropy: clampAnisotropy(anisotropy) };
    for (const record of this._records.values()) if (record.texture && record.texture.anisotropy !== this.quality.anisotropy) {
      record.texture.anisotropy = this.quality.anisotropy;
      record.texture.needsUpdate = true;
    }
    for (const kind of this._materials.keys()) this._bind(kind);
    return this.stats();
  }

  load() {
    if (this._disposed) return Promise.resolve(this.stats());
    if (!this._canLoad) { this._cpuFallback = true; return Promise.resolve(this.stats()); }
    if (this._loading) return this._loading;
    const worker = async () => {
      for (;;) {
        if (this._disposed) return;
        const record = [...this._records.values()].find(r => r.state === 'idle' && (r.slot === 'map' || this.quality.detail));
        if (!record) return;
        record.state = 'loading';
        await this._loadOne(record);
      }
    };
    this._loading = Promise.all(Array.from({ length: 4 }, worker)).then(() => {
      this._loading = null;
      return this.stats();
    });
    return this._loading;
  }

  async _loadOne(record) {
    const controller = new AbortController();
    this._controllers.add(controller);
    let settled = false, timer, abortListener;
    const onDownload = bytes => {
      if (!settled && !record.downloaded && Number.isFinite(bytes) && bytes >= 0) {
        this._downloadedBytes += bytes;
        record.downloaded = true;
      }
    };
    try {
      const result = await new Promise((resolve, reject) => {
        abortListener = () => { settled = true; reject(new Error(this._disposed ? 'Palette disposed' : 'Texture timeout')); };
        controller.signal.addEventListener('abort', abortListener, { once: true });
        timer = setTimeout(() => controller.abort(), this._timeoutMs);
        Promise.resolve().then(() => this._loader(record.url, { signal: controller.signal, onDownload })).then(value => {
          if (settled || this._disposed) { this._releaseTexture(value?.texture); return; }
          resolve(value);
        }, reject);
      });
      if (!result?.texture?.isTexture) throw new Error('Texture loader returned no texture');
      const texture = result.texture;
      if (this._disposed || controller.signal.aborted) {
        this._releaseTexture(texture);
        throw new Error('Palette disposed or texture timed out');
      }
      const width = texture.image?.naturalWidth || texture.image?.width;
      const height = texture.image?.naturalHeight || texture.image?.height;
      if (width !== record.metadata.width || height !== record.metadata.height) {
        this._releaseTexture(texture);
        throw new Error('Texture dimensions do not match the release manifest');
      }
      onDownload(result.encodedBytes ?? record.metadata.encodedBytes);
      texture.colorSpace = record.slot === 'map' ? T.SRGBColorSpace : T.NoColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.minFilter = T.LinearMipmapLinearFilter;
      texture.magFilter = T.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = this.quality.anisotropy;
      texture.needsUpdate = true;
      record.texture = texture;
      record.state = 'loaded';
      this._bind(record.kind);
    } catch (error) {
      record.state = this._disposed ? 'disposed' : 'failed';
      record.error = error instanceof Error ? error.message : String(error);
    } finally {
      settled = true;
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', abortListener);
      this._controllers.delete(controller);
    }
  }

  stats() {
    const records = [...this._records.values()];
    const unique = new Set(records.map(r => r.texture).filter(Boolean));
    let decodedBytes = 0, gpuBytes = 0;
    for (const texture of unique) {
      const w = texture.image.naturalWidth || texture.image.width, h = texture.image.naturalHeight || texture.image.height;
      decodedBytes += w * h * 4;
      gpuBytes += mipBytes(w, h);
    }
    const failed = records.filter(r => r.state === 'failed').length;
    const loaded = records.filter(r => r.state === 'loaded').length;
    return {
      status: this._disposed ? 'disposed' : this._cpuFallback ? 'cpu-fallback' : this._loading ? 'loading' : failed ? 'degraded' : loaded ? 'loaded' : 'idle',
      photographicTexturesLoaded: loaded,
      materialCount: this._materials.size, textureCount: unique.size, failedTextures: failed,
      encodedBytes: records.reduce((sum, r) => sum + r.metadata.encodedBytes, 0),
      requestedEncodedBytes: records.filter(r => r.slot === 'map' || this.quality.detail).reduce((sum, r) => sum + r.metadata.encodedBytes, 0),
      downloadedBytes: this._downloadedBytes, decodedBytes, gpuBytes,
      budgetGpuBytes: records.reduce((sum, r) => sum + mipBytes(r.metadata.width, r.metadata.height), 0),
      gpuAccounting: 'RGBA8 base plus complete mip chain; excludes driver/material overhead',
      quality: { ...this.quality },
      assets: records.map(r => ({ kind: r.kind, slot: r.slot, url: r.url, state: r.state, error: r.error })),
    };
  }

  _releaseTexture(texture) {
    if (!texture || this._released.has(texture)) return;
    this._released.add(texture);
    texture.dispose();
    texture.image?.close?.();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const controller of this._controllers) controller.abort();
    // A texture can occupy several slots; release by identity exactly once.
    for (const material of this._materials.values()) {
      for (const slot of SLOTS) { this._releaseTexture(material[slot]); material[slot] = null; }
      material.dispose();
    }
    for (const record of this._records.values()) {
      this._releaseTexture(record.texture);
      record.texture = null;
      record.state = 'disposed';
    }
    this._materials.clear();
  }
}
