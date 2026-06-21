import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_BASE = path.resolve(ROOT, 'voice-audio');
const PROJECT_JSON = '.project.json';
const AUDIO_FILE = 'audio.webm';
const NAME_LIMIT = 200;

let BASE = DEFAULT_BASE;

export function setBaseDir(dir) {
  BASE = path.resolve(dir);
}

export function getBaseDir() {
  return BASE;
}

function ensureBase() {
  if (!fs.existsSync(BASE)) {
    fs.mkdirSync(BASE, { recursive: true });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeName(name) {
  let s = String(name).trim().slice(0, NAME_LIMIT);
  // Replace filesystem-reserved characters with spaces.
  s = s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  // Drop leading/trailing dots to avoid hidden files / traversal lookalikes.
  s = s.replace(/\.+$/, '').replace(/^\.+/, '').trim();
  if (!s) s = 'Untitled';
  return s;
}

function assertUnderBase(target) {
  const resolved = path.resolve(BASE, target);
  const relative = path.relative(BASE, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
    throw new Error('Invalid path');
  }
  return { resolved, relative };
}

function dirFor(relPath) {
  return assertUnderBase(relPath).resolved;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function readProjectJson(dir) {
  return readJsonFile(path.join(dir, PROJECT_JSON));
}

function writeProjectJson(dir, obj) {
  writeJsonFile(path.join(dir, PROJECT_JSON), obj);
}

function isProjectDir(dir) {
  return fs.existsSync(path.join(dir, PROJECT_JSON));
}

function statSafely(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function uniqueProjectPath(parentRel, name) {
  let rel = parentRel ? `${parentRel}/${name}` : name;
  let resolved = dirFor(rel);
  if (!fs.existsSync(resolved)) return rel;
  // If a folder with the same name exists, also avoid collision.
  for (let i = 1; i < 10000; i++) {
    const candidate = `${name} (${i})`;
    rel = parentRel ? `${parentRel}/${candidate}` : candidate;
    resolved = dirFor(rel);
    if (!fs.existsSync(resolved)) return rel;
  }
  throw new Error('Unable to find a unique project name');
}

function uniqueFolderPath(parentRel, name) {
  let rel = parentRel ? `${parentRel}/${name}` : name;
  let resolved = dirFor(rel);
  if (!fs.existsSync(resolved)) return rel;
  for (let i = 1; i < 10000; i++) {
    const candidate = `${name} (${i})`;
    rel = parentRel ? `${parentRel}/${candidate}` : candidate;
    resolved = dirFor(rel);
    if (!fs.existsSync(resolved)) return rel;
  }
  throw new Error('Unable to find a unique folder name');
}

function toProjectObject(meta, relPath) {
  return {
    id: relPath,
    name: meta.name,
    folder_id: path.dirname(relPath) === '.' ? null : path.dirname(relPath),
    status: meta.status,
    transcript: meta.transcript,
    has_audio: meta.hasAudio,
    sourceLang: meta.sourceLang || 'zh',
    created_at: meta.createdAt,
    updated_at: meta.updatedAt,
    audio_data: undefined,
  };
}

function toFolderObject(name, relPath, createdAt, updatedAt) {
  return {
    id: relPath,
    type: 'folder',
    folderId: relPath,
    parentId: path.dirname(relPath) === '.' ? null : path.dirname(relPath),
    name,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function scanDir(dir, relPath, folders, projects) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const childRel = relPath ? `${relPath}/${e.name}` : e.name;
    const childDir = path.join(dir, e.name);
    if (isProjectDir(childDir)) {
      const meta = readProjectJson(childDir) || {};
      projects.push({
        relPath: childRel,
        name: meta.name || e.name,
        status: meta.status || 'draft',
        createdAt: meta.createdAt || nowIso(),
        updatedAt: meta.updatedAt || nowIso(),
      });
    } else {
      const st = statSafely(childDir);
      const createdAt = st ? st.mtime.toISOString() : nowIso();
      folders.push({
        relPath: childRel,
        name: e.name,
        createdAt,
        updatedAt: createdAt,
      });
      scanDir(childDir, childRel, folders, projects);
    }
  }
}

export function listVoiceTree({ query = '', limit = 100, offset = 0 } = {}) {
  ensureBase();
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const start = Math.max(Number(offset) || 0, 0);
  const q = String(query || '').trim().toLowerCase();

  const folders = [];
  const projects = [];
  scanDir(BASE, '', folders, projects);

  const folderMap = new Map(folders.map(f => [f.relPath, f]));
  const childMap = new Map(); // parentPath -> [{ kind, key }]

  function addChild(parentPath, kind, key) {
    if (!childMap.has(parentPath)) childMap.set(parentPath, []);
    childMap.get(parentPath).push({ kind, key });
  }

  for (const f of folders) {
    const parent = path.dirname(f.relPath) === '.' ? '' : path.dirname(f.relPath);
    addChild(parent, 'folder', f.relPath);
  }
  for (const p of projects) {
    const parent = path.dirname(p.relPath) === '.' ? '' : path.dirname(p.relPath);
    addChild(parent, 'project', p.relPath);
  }

  const matchedProjects = new Set();
  const matchedFolders = new Set();

  function markMatches(parentPath, ancestorMatch) {
    const items = childMap.get(parentPath) || [];
    let hasMatch = false;

    for (const item of items.filter(i => i.kind === 'folder')) {
      const f = folderMap.get(item.key);
      const folderMatch = !q || f.name.toLowerCase().includes(q);
      const childHasMatch = markMatches(item.key, ancestorMatch || folderMatch);
      if (folderMatch || childHasMatch) {
        matchedFolders.add(item.key);
        hasMatch = true;
      }
    }

    for (const item of items.filter(i => i.kind === 'project')) {
      const p = projects.find(pr => pr.relPath === item.key);
      if (!q || ancestorMatch || p.name.toLowerCase().includes(q)) {
        matchedProjects.add(item.key);
        hasMatch = true;
      }
    }

    return hasMatch;
  }
  markMatches('', false);

  const matchedProjectList = projects.filter(p => matchedProjects.has(p.relPath));
  matchedProjectList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const total = matchedProjectList.length;
  const paginated = matchedProjectList.slice(start, start + cap);
  const paginatedPaths = new Set(paginated.map(p => p.relPath));

  const includedFolders = new Set();
  function addFolderAndAncestors(rel) {
    if (!rel) return;
    includedFolders.add(rel);
    const parent = path.dirname(rel) === '.' ? '' : path.dirname(rel);
    addFolderAndAncestors(parent);
  }

  for (const p of paginated) {
    const parent = path.dirname(p.relPath) === '.' ? '' : path.dirname(p.relPath);
    addFolderAndAncestors(parent);
  }
  if (q) {
    for (const fp of matchedFolders) addFolderAndAncestors(fp);
  }

  function build(parentPath) {
    const items = [];
    const all = childMap.get(parentPath) || [];
    const childFolders = all
      .filter(i => i.kind === 'folder' && includedFolders.has(i.key))
      .map(i => folderMap.get(i.key))
      .sort((a, b) => a.name.localeCompare(b.name));
    const childProjects = all
      .filter(i => i.kind === 'project' && paginatedPaths.has(i.key))
      .map(i => projects.find(p => p.relPath === i.key));
    // Preserve pagination ordering (updated_at DESC) across the tree.
    childProjects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    for (const f of childFolders) {
      items.push({
        id: `f-${f.relPath}`,
        type: 'folder',
        folderId: f.relPath,
        parentId: parentPath || null,
        name: f.name,
        created_at: f.createdAt,
        updated_at: f.updatedAt,
        children: build(f.relPath),
      });
    }
    for (const p of childProjects) {
      items.push({
        id: `p-${p.relPath}`,
        type: 'project',
        projectId: p.relPath,
        folderId: parentPath || null,
        name: p.name,
        status: p.status,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      });
    }
    return items;
  }

  return {
    tree: { id: 'root', type: 'root', name: 'Voice', children: build('') },
    total,
  };
}

export function getVoiceProject(relPath) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  if (!fs.existsSync(dir)) return null;
  const meta = readProjectJson(dir);
  if (!meta) return null;
  return toProjectObject(meta, relPath);
}

export function createVoiceProject({ name = '', folderPath = null, sourceLang = 'zh' } = {}) {
  ensureBase();
  const cleanName = sanitizeName(name);
  const parentRel = folderPath ? String(folderPath).trim() : '';
  if (parentRel) dirFor(parentRel); // validate parent exists & is under base
  const relPath = uniqueProjectPath(parentRel, cleanName);
  const dir = dirFor(relPath);
  fs.mkdirSync(dir, { recursive: true });
  const now = nowIso();
  const meta = {
    id: relPath,
    name: path.basename(relPath),
    status: 'draft',
    transcript: [],
    hasAudio: false,
    sourceLang,
    createdAt: now,
    updatedAt: now,
  };
  writeProjectJson(dir, meta);
  return toProjectObject(meta, relPath);
}

export function updateVoiceProject(relPath, { name, status } = {}) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  const meta = readProjectJson(dir);
  if (!meta) return null;
  if (status !== undefined) {
    meta.status = String(status);
  }
  meta.updatedAt = nowIso();
  writeProjectJson(dir, meta);
  return toProjectObject(meta, relPath);
}

export function renameVoiceProject(relPath, name) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  const meta = readProjectJson(dir);
  if (!meta) return null;
  const cleanName = sanitizeName(name);
  const parentRel = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
  const newRelPath = uniqueProjectPath(parentRel, cleanName);
  if (newRelPath !== relPath) {
    const newDir = dirFor(newRelPath);
    fs.renameSync(dir, newDir);
  }
  meta.id = newRelPath;
  meta.name = path.basename(newRelPath);
  meta.updatedAt = nowIso();
  writeProjectJson(dirFor(newRelPath), meta);
  return toProjectObject(meta, newRelPath);
}

export function moveVoiceProject(relPath, folderPath) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  const meta = readProjectJson(dir);
  if (!meta) return null;
  const parentRel = folderPath ? String(folderPath).trim() : '';
  if (parentRel) dirFor(parentRel); // validate
  const newRelPath = uniqueProjectPath(parentRel, path.basename(relPath));
  if (newRelPath !== relPath) {
    const newDir = dirFor(newRelPath);
    fs.renameSync(dir, newDir);
  }
  meta.id = newRelPath;
  meta.updatedAt = nowIso();
  writeProjectJson(dirFor(newRelPath), meta);
  return toProjectObject(meta, newRelPath);
}

export function deleteVoiceProject(relPath) {
  ensureBase();
  if (!relPath) return false;
  const dir = dirFor(relPath);
  if (!fs.existsSync(dir) || !readProjectJson(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function createVoiceFolder(folderPath) {
  ensureBase();
  const cleanPath = String(folderPath || '').trim();
  if (!cleanPath) throw new Error('Folder path is required');
  const dir = dirFor(cleanPath);
  if (fs.existsSync(dir)) throw new Error('Folder already exists');
  fs.mkdirSync(dir, { recursive: true });
  const st = statSafely(dir);
  const now = st ? st.mtime.toISOString() : nowIso();
  return toFolderObject(path.basename(cleanPath), cleanPath, now, now);
}

export function renameVoiceFolder(relPath, name) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  if (!fs.existsSync(dir) || isProjectDir(dir)) return null;
  const cleanName = sanitizeName(name);
  const parentRel = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
  const newRelPath = uniqueFolderPath(parentRel, cleanName);
  const newDir = dirFor(newRelPath);
  fs.renameSync(dir, newDir);
  const st = statSafely(newDir);
  const now = st ? st.mtime.toISOString() : nowIso();
  return toFolderObject(path.basename(newRelPath), newRelPath, now, now);
}

export function moveVoiceFolder(relPath, folderPath) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  if (!fs.existsSync(dir) || isProjectDir(dir)) return null;
  const parentRel = folderPath ? String(folderPath).trim() : '';
  if (parentRel) dirFor(parentRel); // validate
  const newRelPath = uniqueFolderPath(parentRel, path.basename(relPath));
  const newDir = dirFor(newRelPath);
  fs.renameSync(dir, newDir);
  const st = statSafely(newDir);
  const now = st ? st.mtime.toISOString() : nowIso();
  return toFolderObject(path.basename(newRelPath), newRelPath, now, now);
}

export function deleteVoiceFolder(relPath) {
  ensureBase();
  if (!relPath) return false;
  const dir = dirFor(relPath);
  if (!fs.existsSync(dir) || isProjectDir(dir)) return false;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return false; }
  if (entries.length > 0) return false;
  fs.rmdirSync(dir);
  return true;
}

export function saveVoiceAudio(relPath, base64) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  const meta = readProjectJson(dir);
  if (!meta) return null;
  const buf = Buffer.from(String(base64), 'base64');
  fs.writeFileSync(path.join(dir, AUDIO_FILE), buf);
  meta.hasAudio = true;
  meta.status = 'ready';
  meta.updatedAt = nowIso();
  writeProjectJson(dir, meta);
  return toProjectObject(meta, relPath);
}

export function loadVoiceAudio(relPath) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  const audioPath = path.join(dir, AUDIO_FILE);
  if (!fs.existsSync(audioPath)) return null;
  try {
    const buf = fs.readFileSync(audioPath);
    return { buf, contentType: 'audio/webm' };
  } catch {
    return null;
  }
}

export function saveVoiceTranscript(relPath, segments) {
  ensureBase();
  if (!relPath) return null;
  const dir = dirFor(relPath);
  const meta = readProjectJson(dir);
  if (!meta) return null;
  meta.transcript = Array.isArray(segments) ? segments : [];
  meta.status = 'completed';
  meta.updatedAt = nowIso();
  writeProjectJson(dir, meta);
  return toProjectObject(meta, relPath);
}

export function listVoiceFolders() {
  ensureBase();
  const folders = [];
  const projects = []; // ignored
  scanDir(BASE, '', folders, projects);
  return folders.map(f => ({
    id: f.relPath,
    name: f.name,
    parent_id: path.dirname(f.relPath) === '.' ? null : path.dirname(f.relPath),
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  }));
}
