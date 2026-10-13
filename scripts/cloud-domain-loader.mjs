import { readFileSync, existsSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

/** Execute the checked-in server/domain code in a standalone administrative CLI.
 * Only the React server-only build marker is skipped; SDK/network/persistence
 * implementations remain real. The cache preserves normal CommonJS cycles. */
export function createCloudDomainLoader(root = process.cwd()) {
  const cache = new Map();
  const packageRequire = createRequire(resolve(root, 'package.json'));
  function loadTS(name) {
    let filename = resolve(root, name);
    if (!extname(filename)) filename = ['.ts', '.tsx', '.json', '.js'].map(extension => filename + extension).find(existsSync) ?? filename;
    if (extname(filename) === '.json') return JSON.parse(readFileSync(filename, 'utf8'));
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const require = specifier => {
      if (specifier === 'server-only') return {};
      if (specifier.startsWith('@/')) return loadTS(resolve(root, 'src', specifier.slice(2)));
      if (specifier.startsWith('.')) return loadTS(resolve(dirname(filename), specifier));
      return packageRequire(specifier);
    };
    const result = ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, isolatedModules: true } });
    new Function('require', 'module', 'exports', '__filename', '__dirname', result.outputText)(require, loadedModule, loadedModule.exports, filename, dirname(filename));
    return loadedModule.exports;
  }
  return loadTS;
}
